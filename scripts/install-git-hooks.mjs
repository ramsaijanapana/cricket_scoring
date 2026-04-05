#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";

const repoRoot = findRepoRoot(process.cwd());
const gitDir = path.join(repoRoot, ".git");

if (!fs.existsSync(gitDir) || !fs.statSync(gitDir).isDirectory()) {
  process.exit(0);
}

const hooksDir = path.join(gitDir, "hooks");
fs.mkdirSync(hooksDir, { recursive: true });

const hookBody = [
  "#!/bin/sh",
  "node scripts/context-handoff.mjs check --staged",
  "RESULT=$?",
  "if [ $RESULT -ne 0 ]; then",
  "  echo \"Context check failed. Refresh the agent handoff before committing.\"",
  "  exit $RESULT",
  "fi",
  "",
].join("\n");

const preCommitPath = path.join(hooksDir, "pre-commit");
fs.writeFileSync(preCommitPath, hookBody, { encoding: "utf8", mode: 0o755 });

try {
  fs.chmodSync(preCommitPath, 0o755);
} catch {
  // Best effort on Windows; Git Bash can still read the hook.
}

console.log(`Installed context pre-commit hook at ${preCommitPath}`);

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
