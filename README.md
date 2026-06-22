# CricScore

Social cricket scoring platform — live scoring, scorecards, tournaments, and real-time updates. Monorepo managed with npm workspaces and Turbo.

| Package | Path | Stack |
|---------|------|-------|
| API | `apps/api` | Fastify, Drizzle, TimescaleDB, Redis, Socket.IO |
| Web | `apps/web` | React, Vite, TanStack Query |
| Mobile | `apps/mobile` | Expo Router, React Native |
| Shared | `packages/shared` | Zod schemas, shared types |
| UI | `packages/ui` | Shared Tailwind tokens/components |

Architecture reference (system diagram, route map, WebSocket catalog, schema table, onboarding): [docs/ARCHITECTURE.md](./docs/ARCHITECTURE.md).

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
| `npm run test:e2e:docker` | Docker Postgres/Redis, migrate, seed, API, full E2E |
| `npm run test:load` | k6 stress test (API must be running) |
| `npm run test:load:delivery` | Delivery throughput load test |
| `npm run test:load:spectator` | Spectator load test |
| `npm run test:load:ws` | WebSocket connection load test |

E2E scripts expect the API at `http://localhost:3001`. Load tests require [k6](https://k6.io/) installed.

**One-command Docker E2E** (recommended for full verification):

```bash
npm run test:e2e:docker
```

This starts Postgres and Redis via `docker compose`, runs migrations and seed (creates `admin@cricscore.dev` / `password123` for role-gated routes), builds and starts the API, then runs all three bash E2E suites. Scoring tests authenticate as the seeded admin because newly registered users are spectators.

Manual flow (API already running with seeded DB):

```bash
docker compose up -d postgres redis
npm run db:migrate && npm run db:seed
npm run dev:api   # separate terminal
npm run test:e2e:all
```

## Deploy

Push to `main` runs [.github/workflows/deploy.yml](.github/workflows/deploy.yml): build/push GHCR images, deploy staging, then production (manual approval on the `production` environment).

After a deploy lands, run [.github/workflows/post-deploy-smoke.yml](.github/workflows/post-deploy-smoke.yml) manually (workflow dispatch) to verify the live URL — health check and Playwright smoke are stubbed until production hosts are wired.

Copy [`.env.example`](./.env.example) to `.env` and set secrets. GitHub Actions uses `STAGING_*` / `PRODUCTION_*` secrets and `*_ALLOWED_ORIGINS` variables (see workflow file).

**Production** exposes only the web/nginx port (`WEB_PORT`, default 80). The API is internal-only and reached via nginx (`/api/`, `/socket.io/`, `/health`).

### Deploy checklist

Before deploying:

- [ ] GitHub `staging` / `production` environment secrets set (`*_POSTGRES_PASSWORD`, `*_JWT_SECRET`, `*_JWT_REFRESH_SECRET`)
- [ ] `STAGING_ALLOWED_ORIGINS` / `PRODUCTION_ALLOWED_ORIGINS` vars match the public URL(s)
- [ ] Note the current running `IMAGE_TAG` (git SHA) for rollback
- [ ] Database backup taken if the release includes schema migrations

Deploy (staging or production):

```bash
export REGISTRY=ghcr.io
export IMAGE_PREFIX=owner/cricket_scoring
export IMAGE_TAG=<git-sha>
docker compose -f docker-compose.staging.yml pull   # or docker-compose.prod.yml
docker compose -f docker-compose.staging.yml --profile migrate run --rm migrate
docker compose -f docker-compose.staging.yml up -d
docker compose -f docker-compose.staging.yml ps     # all services healthy
curl -sf http://localhost/health                    # or your WEB_PORT / public URL
```

Post-deploy:

- [ ] `/health` returns `"status":"ok"` via nginx
- [ ] Run post-deploy smoke workflow with the live `base_url`
- [ ] Spot-check login and live scoring on the target environment

### Rollback

Roll back to a known-good image tag without re-running migrations (safe when the release had no DB changes):

```bash
export IMAGE_TAG=<previous-good-sha>
docker compose -f docker-compose.prod.yml pull
docker compose -f docker-compose.prod.yml up -d
curl -sf http://localhost/health
```

If the bad release ran forward-only migrations, restore from backup before rolling back images, or deploy a forward fix instead of reverting the database.

Local API env vars: [`apps/api/.env.example`](./apps/api/.env.example).

## Agent workflow

- Repo-wide agent pre-prompt: [AGENTS.md](./AGENTS.md)
- Every agent should read the handoff first, run `npm run context:status` when available, and keep `AGENT_HANDOFF.md` plus `.agent-context/state.json` updated during work.
- Install the reusable workflow into other repos with the `agent-context-handoff` skill's installer.
