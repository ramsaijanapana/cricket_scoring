# Agent Pre-Prompt

This repo uses a mandatory context-first workflow so work can be handed off cleanly between agents.

## Before You Start

You must do these steps before making changes:

1. Read `AGENT_HANDOFF.md`
2. Read `.agent-context/state.json`
3. Run `npm run context:status` if available, otherwise run `node scripts/context-handoff.mjs status`
4. Use that handoff as the starting point for your work

Do not start from memory alone.

## While Working

Keep the compact handoff updated as the work changes.

- After every meaningful change or milestone, run:
  - `npm run context:update -- --summary "what changed" --next "what should happen next"`
  - or `node scripts/context-handoff.mjs update --summary "what changed" --next "what should happen next"`
- Add optional flags when useful:
  - `--focus "current workstream"`
  - `--risk "known issue"`
  - `--decision "important choice"`
  - `--verify "what you checked"`
- If you are actively iterating for a while, also run:
  - `npm run context:watch`
  - or `node scripts/context-handoff.mjs watch`
- If the handoff gets too noisy, run:
  - `npm run context:compact`
  - or `node scripts/context-handoff.mjs compact`

## Before You Finish

You must do these steps before stopping or handing work off:

1. Run `context:update` again with the latest status
2. Make sure `AGENT_HANDOFF.md` and `.agent-context/state.json` reflect the current state
3. Include the refreshed context files with your changes

## Mandatory Rules

- Always check the handoff first
- Always leave the handoff better than you found it
- If you changed code, you must also refresh the context
- Do not commit stale code context

## Enforcement

- `context:check` validates the staged state
- A `pre-commit` hook blocks commits when code changes are staged without refreshed handoff files

## Short Version

Read the handoff first. Update it as you work. Refresh it again before you stop.

