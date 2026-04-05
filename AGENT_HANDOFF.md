# Agent Handoff

> Last updated: 2026-04-05
> Branch: main (all changes uncommitted)
> Build status: PASSING (3/3 packages compile cleanly via `npm run build`)

## Current State

All Phase 1 code gaps from `context.md` have been implemented. The codebase compiles successfully. **The app has NOT been run yet** — infrastructure services (PostgreSQL + Redis) were never started.

## Architecture

Turborepo monorepo with 3 workspaces:

| Workspace | Path | Stack |
|-----------|------|-------|
| `@cricket/api` | `apps/api/` | Fastify 5 + Drizzle ORM + Socket.IO + TimescaleDB |
| `@cricket/web` | `apps/web/` | React 18 + Vite + Zustand + React Query + PWA |
| `@cricket/shared` | `packages/shared/` | Shared TypeScript types (models, events, enums) |

## What Was Built (Phase 1 Gap Fill)

The codebase was already substantially implemented before this session. The following **12 gaps** were identified and filled:

### P0: Free-hit tracking
- `apps/api/src/db/schema/delivery.ts` — added `isFreeHit` boolean column
- `apps/api/src/engine/scoring-engine.ts` — auto-detect free-hit after no-ball, validate only run-out dismissals during free-hit
- `packages/shared/src/types/models.ts` — added `is_free_hit` to Delivery interface

### P1: Auth system (JWT)
- **NEW** `apps/api/src/routes/auth.ts` — POST /register, /login, /refresh, /logout, GET /.well-known/jwks.json
- `apps/api/src/server.ts` — registered `@fastify/jwt` plugin + auth routes at `/api/v1/auth`
- Uses bcrypt (cost 12), Redis refresh tokens (7-day TTL), JWT access tokens (1h)

### P2: Format config CRUD
- **NEW** `apps/api/src/routes/format-configs.ts` — GET /, GET /:id, POST /, PATCH /:id
- Registered at `/api/v1/format-configs`

### P3: Batch undo
- `apps/api/src/routes/deliveries.ts` — DELETE `/:id/deliveries/batch?from_stack_pos=N&inningsId=ID`

### P4: Match interruption/resume
- `apps/api/src/routes/matches.ts` — POST `/:id/interruption`, POST `/:id/resume`
- Broadcasts status events via Socket.IO

### P5: DRS/Review entity
- **NEW** `apps/api/src/db/schema/review.ts` — review table with original/revised decisions (jsonb)
- **NEW** `apps/api/src/routes/reviews.ts` — POST `/:id/reviews`, PATCH `/:id/reviews/:reviewId`
- Registered at `/api/v1/matches`

### P6: Substitution entity
- **NEW** `apps/api/src/db/schema/substitution.ts` — concussion/impact/tactical/like_for_like types

### P7: Follow-on enforcement
- `apps/api/src/routes/innings.ts` — POST `/:id/innings/:inningsId/follow-on`
- Validates deficit threshold from format config

### P8: Super-over
- `apps/api/src/routes/matches.ts` — POST `/:id/super-over`
- Creates special innings with `isSuperOver: true`

### P9: Partial match state
- `apps/api/src/routes/matches.ts` — GET `/:id/state?fields=scorecard,innings,current_over`

### P10: Sync conflict handling (409)
- `apps/api/src/routes/deliveries.ts` — checks `expected_stack_pos` before insert, returns 409 with SyncConflictPayload

### P11: GDPR export/deletion
- **NEW** `apps/api/src/routes/users.ts` — GET `/me/export`, DELETE `/me` (soft-delete)
- Registered at `/api/v1/users`

### Schema index updated
- `apps/api/src/db/schema/index.ts` — exports `review` and `substitution`

### Shared types fix
- `packages/shared/src/types/events.ts` — fixed `DismissalType` import from `./enums` (was `./models`)

## What Has NOT Been Done

### Infrastructure (blocking — do this first)
1. **Docker services not started** — need PostgreSQL (TimescaleDB) + Redis
   - `docker compose up -d` (also includes ClickHouse + Kafka, but those are Phase 2+)
   - OR install PostgreSQL 16 + Redis 7 natively
2. **Drizzle migration not generated** — new columns/tables (isFreeHit, review, substitution) need migration
   - `cd apps/api && npx drizzle-kit generate`
3. **Database not migrated** — `npm run db:migrate`
4. **Database not seeded** — `npm run db:seed`
5. **App never started** — `npm run dev` (API :3001, Web :5173)

### Code gaps remaining (Phase 2+)
- No auth middleware on protected routes (JWT decorator `onRequest` hook not wired)
- No request validation schemas (Fastify JSON Schema / Zod)
- No rate limiting on auth endpoints
- No test suite
- ClickHouse analytics pipeline not connected
- Kafka event streaming not connected
- PWA service worker not tested offline
- No CI/CD pipeline

### Frontend
- Web app exists with 4 pages: HomePage, CreateMatchPage, ScoringPage, ScorecardPage
- Uses React Router, Zustand for scoring state, React Query for data fetching
- Socket.IO client configured in `apps/web/src/lib/socket.ts`
- Offline queue via IndexedDB in `apps/web/src/lib/offline-store.ts`
- **NOT manually tested** — needs running API to verify

## Key Files

### API
| File | Purpose |
|------|---------|
| `apps/api/src/server.ts` | Fastify app setup, route registration, JWT plugin |
| `apps/api/src/engine/scoring-engine.ts` | Core scoring logic (~530 lines) — delivery recording, undo, over completion |
| `apps/api/src/engine/commentary-engine.ts` | Template-based commentary generation |
| `apps/api/src/services/realtime.ts` | Socket.IO server + broadcast helpers |
| `apps/api/src/db/schema/*.ts` | Drizzle ORM schema (15 tables) |
| `apps/api/src/routes/*.ts` | REST endpoints (12 route modules) |
| `apps/api/.env` | Environment config (DATABASE_URL, REDIS_URL, JWT_SECRET) |
| `apps/api/drizzle.config.ts` | Drizzle Kit migration config |

### Web
| File | Purpose |
|------|---------|
| `apps/web/src/App.tsx` | React Router setup |
| `apps/web/src/pages/ScoringPage.tsx` | Live scoring UI |
| `apps/web/src/stores/scoring-store.ts` | Zustand scoring state |
| `apps/web/src/lib/api.ts` | API client (fetch wrapper) |
| `apps/web/src/lib/socket.ts` | Socket.IO client |

### Shared
| File | Purpose |
|------|---------|
| `packages/shared/src/types/models.ts` | Domain model interfaces |
| `packages/shared/src/types/events.ts` | WebSocket event contracts |
| `packages/shared/src/types/enums.ts` | DismissalType, MatchStatus, etc. |

## Environment

- Platform: Windows 11
- Node: >= 20.0.0
- Package manager: npm 10.8
- Build tool: Turborepo
- Docker Compose services: TimescaleDB (PG16), Redis 7, ClickHouse 24, Kafka 3.7

## .env (apps/api/.env)

```
DATABASE_URL=postgres://cricket:cricket_dev@localhost:5432/cricket_scoring
REDIS_URL=redis://localhost:6379
JWT_SECRET=change-me-in-production
PORT=3001
HOST=0.0.0.0
```

## Quick Start for Next Agent

```bash
# 1. Install dependencies (if needed)
npm install

# 2. Start infrastructure
docker compose up -d

# 3. Generate migration for new schema changes
cd apps/api && npx drizzle-kit generate && cd ../..

# 4. Run migrations
npm run db:migrate

# 5. Seed database
npm run db:seed

# 6. Start dev servers
npm run dev
# API → http://localhost:3001
# Web → http://localhost:5173

# 7. Verify build
npm run build
```

## Specification

The full product spec is in `context.md` (~777 lines). It covers:
- Data model (15+ entities)
- REST API endpoints
- WebSocket event contracts
- Scoring engine rules (extras, free-hits, DLS, super overs)
- Auth & RBAC
- Offline-first PWA strategy
- Phase 1-4 roadmap

## Risks / Watchouts

- `docker` command not found in bash shell on this Windows machine — may need to run via PowerShell or ensure Docker Desktop is in PATH
- PowerShell blocks `npm.ps1` — use `npm.cmd` or call node directly
- The pre-commit hook (`scripts/context-handoff.mjs check --staged`) blocks commits without refreshed handoff files
- No tests exist — any refactoring should be done carefully
- Auth middleware is not yet wired to protect routes — all endpoints are currently open
