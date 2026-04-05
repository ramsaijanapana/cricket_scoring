# Project

## Agent workflow

- Repo-wide agent pre-prompt: [AGENTS.md](./AGENTS.md)
- Every agent should read the handoff first, run `npm run context:status` when available, and keep `AGENT_HANDOFF.md` plus `.agent-context/state.json` updated during work.
- This repo includes the runtime handoff scripts; install the reusable workflow into other repos with the `agent-context-handoff` skill's installer.
