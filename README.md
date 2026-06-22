# CricScore

Social cricket scoring platform — live scoring, scorecards, tournaments, and real-time updates. Monorepo managed with npm workspaces and Turbo.

| Package | Path | Stack |
|---------|------|-------|
| API | `apps/api` | Fastify, Drizzle, TimescaleDB, Redis, Socket.IO |
| Web | `apps/web` | React, Vite, TanStack Query |
| Mobile | `apps/mobile` | Expo Router, React Native |
| Shared | `packages/shared` | Zod schemas, shared types |
| UI | `packages/ui` | Shared Tailwind tokens/components |

## Local development

**Requirements:** Node ≥ 20, Docker

```bash
npm install
docker compose up -d          # Postgres (5433), Redis, ClickHouse, Kafka
cp apps/api/.env.example apps/api/.env
npm run db:migrate
npm run db:seed               # optional demo data
npm run dev                   # API :3001, web :5173, mobile via Expo
```

Run individual apps: `npm run dev:api`, `dev:web`, or `dev:mobile`.

## Tests

| Command | What it runs |
|---------|--------------|
| `npm test` | Unit tests (API + web via Vitest) |
| `npm run test:e2e` | Smoke E2E against local API |
| `npm run test:e2e:all` | Smoke + phase2 + architecture E2E |
| `npm run test:load` | k6 stress test (API must be running) |
| `npm run test:load:delivery` | Delivery throughput load test |
| `npm run test:load:spectator` | Spectator load test |
| `npm run test:load:ws` | WebSocket connection load test |

E2E scripts expect the API at `http://localhost:3001`. Load tests require [k6](https://k6.io/) installed.

## Deploy

Push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml): build/push GHCR images, deploy staging, then production (manual approval on the `production` environment).

Copy [`.env.example`](./.env.example) to `.env` and set secrets. GitHub Actions uses `STAGING_*` / `PRODUCTION_*` secrets and `*_ALLOWED_ORIGINS` variables (see workflow file).

**Staging or production** (GHCR images):

```bash
export IMAGE_PREFIX=owner/cricket_scoring
export IMAGE_TAG=<git-sha>
docker compose -f docker-compose.staging.yml pull   # or docker-compose.prod.yml
docker compose -f docker-compose.staging.yml --profile migrate run --rm migrate
docker compose -f docker-compose.staging.yml up -d
```

Local API env vars: [`apps/api/.env.example`](./apps/api/.env.example).

## Agent workflow

- Repo-wide agent pre-prompt: [AGENTS.md](./AGENTS.md)
- Every agent should read the handoff first, run `npm run context:status` when available, and keep `AGENT_HANDOFF.md` plus `.agent-context/state.json` updated during work.
- Install the reusable workflow into other repos with the `agent-context-handoff` skill's installer.
