#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const REPO_ROOT = findRepoRoot(process.cwd());
const CONTEXT_DIR = path.join(REPO_ROOT, ".agent-context");
const STATE_PATH = path.join(CONTEXT_DIR, "state.json");
const HISTORY_PATH = path.join(CONTEXT_DIR, "history.jsonl");
const SUMMARY_PATH = path.join(REPO_ROOT, "AGENT_HANDOFF.md");

const MAX_RECENT_CHECKPOINTS = 8;
const MAX_RENDERED_RECENT = 5;
const MAX_RENDERED_FILES = 20;
const MAX_HISTORY_LINES = 200;

const args = parseArgs(process.argv.slice(2));
const command = args._[0] ?? "status";

switch (command) {
  case "update":
    runUpdate(args);
    break;
  case "compact":
    runCompact();
    break;
  case "watch":
    runWatch();
    break;
  case "status":
    runStatus();
    break;
  case "check":
    runCheck(args);
    break;
  default:
    console.error(`Unknown command "${command}". Use update, compact, status, or check.`);
    process.exit(1);
}

function runUpdate(parsedArgs) {
  ensureContextDir();
  const state = buildNextState(readState(), parsedArgs, { appendCheckpoint: true });
  writeState(state);

  console.log(`Updated handoff context at ${SUMMARY_PATH}`);
}

function runCompact() {
  ensureContextDir();
  const state = readState();

  if (!state.updatedAt) {
    console.error("No handoff state exists yet. Run `npm run context:update -- --summary \"...\"` first.");
    process.exit(1);
  }

  const compactedState = {
    ...state,
    recentCheckpoints: (state.recentCheckpoints ?? []).slice(0, MAX_RECENT_CHECKPOINTS),
  };

  fs.writeFileSync(STATE_PATH, JSON.stringify(compactedState, null, 2) + "\n", "utf8");
  compactHistory();
  fs.writeFileSync(SUMMARY_PATH, renderSummary(compactedState), "utf8");
  console.log(`Compacted handoff context at ${SUMMARY_PATH}`);
}

function runWatch() {
  ensureContextDir();

  if (!readState().updatedAt) {
    const initialState = buildNextState(readState(), {}, { appendCheckpoint: false });
    writeState(initialState);
  } else {
    writeState(buildNextState(readState(), {}, { appendCheckpoint: false }));
  }

  const roots = getWatchRoots();
  const watchers = [];
  let timer = null;

  const scheduleRefresh = () => {
    if (timer) {
      clearTimeout(timer);
    }

    timer = setTimeout(() => {
      const nextState = buildNextState(readState(), {}, { appendCheckpoint: false });
      writeState(nextState);
      console.log(`[context] refreshed ${new Date().toLocaleTimeString()}`);
    }, 500);
  };

  for (const root of roots) {
    try {
      const watcher = fs.watch(root, { recursive: true }, (_eventType, filename) => {
        if (!filename) return;
        const normalized = normalizeGitPath(filename.toString());
        if (!normalized || !isRelevantWorkFile(normalized)) {
          return;
        }
        scheduleRefresh();
      });
      watchers.push(watcher);
    } catch {
      // Best effort; keep other watchers running.
    }
  }

  console.log("[context] watching for repo changes. Press Ctrl+C to stop.");
}

function runStatus() {
  const state = readState();

  if (!state.updatedAt) {
    console.log("No agent handoff context exists yet.");
    process.exit(0);
  }

  const changedFiles = getWorkingTreeFiles();
  const stagedFiles = getStagedFiles();
  const contextStaged = stagedFiles.includes("AGENT_HANDOFF.md") && stagedFiles.includes(".agent-context/state.json");
  const hasRelevantChanges = changedFiles.some(isRelevantWorkFile);

  console.log(`Updated: ${state.updatedAt}`);
  console.log(`Focus: ${state.currentFocus ?? "Not set"}`);
  console.log(`Branch: ${state.branch ?? "unknown"} (${state.head ?? "unknown"})`);
  console.log(`Working tree changes: ${changedFiles.length}`);
  console.log(`Context staged: ${contextStaged ? "yes" : "no"}`);
  if (hasRelevantChanges && !contextStaged) {
    console.log("Status: stale for commit enforcement");
  } else {
    console.log("Status: in sync");
  }
}

function runCheck(parsedArgs) {
  const stagedOnly = parsedArgs.staged === true || parsedArgs["staged-only"] === true;
  const filesToCheck = stagedOnly ? getStagedFiles() : getWorkingTreeFiles();
  const relevantFiles = filesToCheck.filter(isRelevantWorkFile);

  if (relevantFiles.length === 0) {
    process.exit(0);
  }

  const requiredFiles = ["AGENT_HANDOFF.md", ".agent-context/state.json"];
  const availableFiles = stagedOnly ? getStagedFiles() : getWorkingTreeFiles();
  const missing = requiredFiles.filter((file) => !availableFiles.includes(file));

  if (missing.length > 0) {
    console.error("Agent handoff context is stale.");
    console.error("Run `npm run context:update -- --summary \"...\" --next \"...\"` and include the generated files.");
    console.error(`Missing required context files: ${missing.join(", ")}`);
    process.exit(1);
  }

  process.exit(0);
}

function renderSummary(state) {
  const changedFiles = state.workingTree?.changedFiles ?? [];
  const stagedFiles = state.workingTree?.stagedFiles ?? [];
  const displayedChangedFiles = changedFiles.slice(0, MAX_RENDERED_FILES);
  const displayedRecent = (state.recentCheckpoints ?? []).slice(0, MAX_RENDERED_RECENT);

  const lines = [
    "# Agent Handoff",
    "",
    "> Generated by `npm run context:update`. Treat this as the compact source of truth for the next agent handoff.",
    "",
    "## Current State",
    "",
    `- Updated: ${state.updatedAt ?? "unknown"}`,
    `- Branch: ${state.branch ?? "unknown"}`,
    `- Head: ${state.head ?? "unknown"}`,
    `- Focus: ${state.currentFocus ?? "Not set"}`,
    "",
    "## Latest Summary",
    "",
    ...renderBullets(state.latestSummary, "No summary recorded yet."),
    "",
    "## Next Steps",
    "",
    ...renderBullets(state.nextSteps, "No next steps recorded yet."),
    "",
    "## Risks / Watchouts",
    "",
    ...renderBullets(state.risks, "No active risks recorded."),
    "",
    "## Decisions",
    "",
    ...renderBullets(state.decisions, "No explicit decisions recorded."),
    "",
    "## Verification",
    "",
    ...renderBullets(state.verification, "No verification steps recorded."),
    "",
    "## Working Tree Snapshot",
    "",
    `- Changed files: ${changedFiles.length}`,
    `- Staged files: ${stagedFiles.length}`,
    ...renderBullets(
      displayedChangedFiles.map((file) => file),
      "No working tree changes detected.",
    ),
  ];

  if (changedFiles.length > displayedChangedFiles.length) {
    lines.push(`- +${changedFiles.length - displayedChangedFiles.length} more changed files`);
  }

  lines.push("", "## Recent Checkpoints", "");

  if (displayedRecent.length === 0) {
    lines.push("- No checkpoints recorded yet.");
  } else {
    for (const checkpoint of displayedRecent) {
      lines.push(`### ${checkpoint.updatedAt} — ${checkpoint.focus || "Update"}`);
      lines.push("");
      lines.push(`- Actor: ${checkpoint.actor || "agent"}`);
      if (checkpoint.summary?.length) {
        lines.push(`- Summary: ${checkpoint.summary.join(" | ")}`);
      }
      if (checkpoint.nextSteps?.length) {
        lines.push(`- Next: ${checkpoint.nextSteps.join(" | ")}`);
      }
      if (checkpoint.verification?.length) {
        lines.push(`- Verified: ${checkpoint.verification.join(" | ")}`);
      }
      lines.push("");
    }
  }

  lines.push("## Workflow Rule", "", "- After every meaningful change, run `npm run context:update -- --summary \"...\" --next \"...\"`.", "- Commits are blocked when code changes are staged without refreshed handoff files.", "");

  return lines.join("\n");
}

function renderBullets(items, emptyLine) {
  if (!items || items.length === 0) {
    return [`- ${emptyLine}`];
  }

  return items.map((item) => `- ${item}`);
}

function compactHistory() {
  if (!fs.existsSync(HISTORY_PATH)) {
    return;
  }

  const lines = fs
    .readFileSync(HISTORY_PATH, "utf8")
    .split(/\r?\n/)
    .filter(Boolean);

  if (lines.length <= MAX_HISTORY_LINES) {
    return;
  }

  const trimmed = lines.slice(lines.length - MAX_HISTORY_LINES);
  fs.writeFileSync(HISTORY_PATH, trimmed.join("\n") + "\n", "utf8");
}

function writeState(state) {
  fs.writeFileSync(STATE_PATH, JSON.stringify(state, null, 2) + "\n", "utf8");
  compactHistory();
  fs.writeFileSync(SUMMARY_PATH, renderSummary(state), "utf8");
}

function buildNextState(previousState, parsedArgs, options) {
  const workingTreeFiles = getWorkingTreeFiles();
  const stagedFiles = getStagedFiles();
  const branch = getGitOutput("git branch --show-current");
  const head = getGitOutput("git rev-parse --short HEAD");
  const updatedAt = new Date().toISOString();

  const focus = getSingle(parsedArgs, "focus") ?? previousState.currentFocus ?? inferFocus(workingTreeFiles);
  const summary = normalizeLines(getMany(parsedArgs, "summary"));
  const nextSteps = normalizeLines(getMany(parsedArgs, "next"));
  const risks = normalizeLines(getMany(parsedArgs, "risk"));
  const decisions = normalizeLines(getMany(parsedArgs, "decision"));
  const verification = normalizeLines(getMany(parsedArgs, "verify"));
  const actor =
    getSingle(parsedArgs, "actor") ??
    process.env.CODEX_AGENT_NAME ??
    process.env.USERNAME ??
    process.env.USER ??
    "agent";

  const checkpoint = {
    updatedAt,
    actor,
    focus,
    summary,
    nextSteps,
    risks,
    decisions,
    verification,
    changedFiles: workingTreeFiles,
  };

  const recentCheckpoints = options.appendCheckpoint
    ? [checkpoint, ...(previousState.recentCheckpoints ?? [])].slice(0, MAX_RECENT_CHECKPOINTS)
    : (previousState.recentCheckpoints ?? []).slice(0, MAX_RECENT_CHECKPOINTS);

  if (options.appendCheckpoint) {
    appendHistory(checkpoint);
  }

  return {
    project: previousState.project ?? path.basename(REPO_ROOT),
    updatedAt,
    branch,
    head,
    currentFocus: focus,
    latestSummary: summary.length > 0 ? summary : previousState.latestSummary ?? [],
    nextSteps: nextSteps.length > 0 ? nextSteps : previousState.nextSteps ?? [],
    risks: risks.length > 0 ? risks : previousState.risks ?? [],
    decisions: decisions.length > 0 ? decisions : previousState.decisions ?? [],
    verification: verification.length > 0 ? verification : previousState.verification ?? [],
    workingTree: {
      changedFiles: workingTreeFiles,
      stagedFiles,
    },
    recentCheckpoints,
  };
}

function appendHistory(checkpoint) {
  const line = JSON.stringify(checkpoint);
  fs.appendFileSync(HISTORY_PATH, `${line}\n`, "utf8");
}

function readState() {
  if (!fs.existsSync(STATE_PATH)) {
    return {};
  }

  try {
    return JSON.parse(fs.readFileSync(STATE_PATH, "utf8"));
  } catch {
    return {};
  }
}

function ensureContextDir() {
  fs.mkdirSync(CONTEXT_DIR, { recursive: true });
}

function getWorkingTreeFiles() {
  const lines = getGitOutput("git status --short --untracked-files=all")
    .split(/\r?\n/)
    .filter(Boolean);

  const files = new Set();

  for (const line of lines) {
    const rawPath = line.slice(3).trim();
    if (!rawPath) continue;
    const normalized = normalizeGitPath(rawPath);
    if (normalized) {
      files.add(normalized);
    }
  }

  return [...files].filter((file) => !isIgnoredContextFile(file));
}

function getStagedFiles() {
  return getGitOutput("git diff --cached --name-only --diff-filter=ACMR")
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .map(normalizeGitPath)
    .filter(Boolean);
}

function normalizeGitPath(filePath) {
  if (!filePath) return "";
  return filePath.replaceAll("\\", "/").replace(/^"+|"+$/g, "");
}

function inferFocus(files) {
  if (files.some((file) => file.startsWith("components/dashboard"))) {
    return "Dashboard and UI polish";
  }
  if (files.some((file) => file.startsWith("components/auth") || file.startsWith("app/api/auth"))) {
    return "Authentication flow";
  }
  if (files.some((file) => file.startsWith("components/transactions") || file.startsWith("app/api/transactions"))) {
    return "Transaction workflow";
  }
  if (files.length > 0) {
    return "Active implementation changes";
  }
  return "No active focus recorded";
}

function getWatchRoots() {
  return [
    "app",
    "components",
    "lib",
    "prisma",
    "scripts",
    "tests",
    "public",
  ]
    .map((segment) => path.join(REPO_ROOT, segment))
    .filter((segmentPath) => fs.existsSync(segmentPath));
}

function normalizeLines(values) {
  return values
    .flatMap((value) => value.split(/\r?\n| \| /))
    .map((value) => value.trim())
    .filter(Boolean);
}

function getMany(parsedArgs, key) {
  const value = parsedArgs[key];
  if (Array.isArray(value)) return value;
  if (typeof value === "string") return [value];
  return [];
}

function getSingle(parsedArgs, key) {
  const value = parsedArgs[key];
  if (Array.isArray(value)) {
    return value[value.length - 1];
  }
  return typeof value === "string" ? value : null;
}

function isRelevantWorkFile(file) {
  if (isIgnoredContextFile(file)) return false;
  if (file.startsWith(".next/")) return false;
  if (file.startsWith("node_modules/")) return false;
  if (file.startsWith("android/app/build/")) return false;
  if (file.startsWith("playwright-report/")) return false;
  if (file.startsWith("test-results/")) return false;
  if (file.startsWith(".outbox/")) return false;
  return true;
}

function isIgnoredContextFile(file) {
  return file === "AGENT_HANDOFF.md" || file.startsWith(".agent-context/");
}

function getGitOutput(command) {
  try {
    return execSync(command, {
      cwd: REPO_ROOT,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return "";
  }
}

function findRepoRoot(startDir) {
  try {
    return execSync("git rev-parse --show-toplevel", {
      cwd: startDir,
      stdio: ["ignore", "pipe", "ignore"],
      encoding: "utf8",
    }).trim();
  } catch {
    return startDir;
  }
}

function parseArgs(argv) {
  const parsed = { _: [] };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (!value.startsWith("--")) {
      parsed._.push(value);
      continue;
    }

    const key = value.slice(2);
    const nextValue = argv[index + 1];

    if (!nextValue || nextValue.startsWith("--")) {
      parsed[key] = true;
      continue;
    }

    if (parsed[key] === undefined) {
      parsed[key] = nextValue;
    } else if (Array.isArray(parsed[key])) {
      parsed[key].push(nextValue);
    } else {
      parsed[key] = [parsed[key], nextValue];
    }
    index += 1;
  }

  return parsed;
}
