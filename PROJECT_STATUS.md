# Project Status — Cricket Scoring App

> Snapshot date: 2026-04-05

## Overview

Real-time cricket scoring application with live WebSocket updates, offline-first PWA, and comprehensive analytics. Designed to handle all cricket formats (T20, ODI, Test, custom).

## Completion Summary

| Area | Status | Notes |
|------|--------|-------|
| Specification (`context.md`) | COMPLETE | ~777 lines, production-ready, audited |
| Database schema (Drizzle) | COMPLETE | 15 tables defined |
| REST API routes | COMPLETE | 12 route modules, all Phase 1 endpoints |
| Scoring engine | COMPLETE | ~530 lines, extras, free-hits, undo |
| Commentary engine | COMPLETE | Template-based, milestone detection |
| WebSocket (Socket.IO) | COMPLETE | Server + broadcast helpers |
| Shared types | COMPLETE | Models, events, enums |
| Frontend pages | COMPLETE | 4 pages (Home, Create, Scoring, Scorecard) |
| Frontend state (Zustand) | COMPLETE | Scoring store with optimistic updates |
| Offline/PWA | COMPLETE | IndexedDB queue, service worker |
| Auth (JWT) | PARTIAL | Routes done, middleware NOT wired |
| Database migrations | NOT DONE | Need `drizzle-kit generate` for new tables |
| Database seeding | NOT DONE | `npm run db:seed` not yet run |
| Infrastructure | NOT DONE | Docker services never started |
| Manual testing | NOT DONE | App never launched |
| Automated tests | NOT DONE | No test suite exists |
| CI/CD | NOT DONE | No pipeline configured |

## API Endpoints (Phase 1)

### Auth (`/api/v1/auth`)
- `POST /register` — create account (default role: spectator)
- `POST /login` — returns JWT access + refresh tokens
- `POST /refresh` — rotate refresh token
- `POST /logout` — invalidate refresh token
- `GET /.well-known/jwks.json` — JWKS endpoint (stub)

### Matches (`/api/v1/matches`)
- `GET /` — list matches
- `GET /:id` — match detail with teams + innings
- `POST /` — create match
- `PATCH /:id` — update match
- `POST /:id/start` — start match, create first innings + scorecards
- `POST /:id/toss` — record toss
- `POST /:id/interruption` — rain/bad-light delay
- `POST /:id/resume` — resume after interruption
- `POST /:id/super-over` — initiate super over
- `GET /:id/state` — partial match state (selective fields)

### Deliveries (scoring)
- `POST /:id/deliveries` — record delivery (with sync conflict detection)
- `DELETE /:id/deliveries/last` — undo last ball
- `DELETE /:id/deliveries/batch` — batch undo

### Innings
- `GET /:id/innings` — list innings
- `POST /:id/innings` — create innings
- `PATCH /:id/innings/:inningsId` — update innings
- `POST /:id/innings/:inningsId/follow-on` — enforce follow-on

### Scorecards
- `GET /:id/scorecard` — full scorecard (batting + bowling + fielding)

### Commentary
- `GET /:id/commentary` — paginated commentary

### Reviews (DRS)
- `POST /:id/reviews` — create review
- `PATCH /:id/reviews/:reviewId` — update review outcome

### Teams (`/api/v1/teams`)
- `GET /`, `GET /:id`, `POST /`, `PATCH /:id`

### Players (`/api/v1/players`)
- `GET /`, `GET /:id`, `POST /`, `PATCH /:id`

### Format Configs (`/api/v1/format-configs`)
- `GET /`, `GET /:id`, `POST /`, `PATCH /:id`

### Analytics (`/api/v1/analytics`)
- `GET /player/:id/batting`, `GET /player/:id/bowling`
- `GET /match/:id/worm`, `GET /match/:id/manhattan`

### Users (`/api/v1/users`)
- `GET /me/export` — GDPR data export
- `DELETE /me` — GDPR soft-delete

## Database Schema (15 tables)

```
app_user          — user accounts (email, passwordHash, role, isActive)
team              — cricket teams
player            — player profiles (batting/bowling style)
player_team       — player-team membership (many-to-many)
tournament        — tournament/series
match_format_config — format rules (overs, powerplays, DLS, follow-on)
match             — match metadata (venue, toss, status)
match_team        — match-team junction (home/away, playing XI)
innings           — innings per match (batting/bowling team, super over flag)
delivery          — ball-by-ball event source (immutable, undo via override)
batting_scorecard — per-innings batting stats
bowling_scorecard — per-innings bowling stats
fielding_scorecard — per-innings fielding stats
commentary        — ball-by-ball text commentary
review            — DRS reviews (original/revised decisions)
substitution      — player substitutions (concussion/impact/tactical)
media             — media attachments (highlights, thumbnails)
```

## WebSocket Events

Server broadcasts on pattern `match:{id}:<event>`:
- `delivery` — delivery + scorecard snapshot + commentary
- `wicket` — delivery + wicket detail + partnership ended
- `over` — over summary + bowler stats + run rate
- `milestone` — fifty, hundred, hat trick, etc.
- `prediction` — win probabilities + projected scores
- `dls_update` — par score + revised target
- `status` — match status changes (rain delay, resumed, etc.)

Client sends:
- `join_match` / `leave_match` — room subscription
- `submit_delivery` — scoring input
- `undo_last_ball` — undo

## Frontend Pages

| Page | Route | Purpose |
|------|-------|---------|
| HomePage | `/` | Match list, quick access |
| CreateMatchPage | `/matches/new` | Match creation wizard |
| ScoringPage | `/matches/:id/score` | Live scoring interface |
| ScorecardPage | `/matches/:id/scorecard` | Full scorecard view |

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Runtime | Node.js >= 20 |
| Monorepo | Turborepo + npm workspaces |
| API framework | Fastify 5 |
| ORM | Drizzle ORM (PostgreSQL) |
| Database | TimescaleDB (PostgreSQL 16) |
| Cache/PubSub | Redis 7 |
| Analytics DB | ClickHouse 24 (Phase 2) |
| Event bus | Kafka 3.7 (Phase 2) |
| WebSocket | Socket.IO 4 |
| Frontend | React 18 + Vite |
| State | Zustand 5 |
| Data fetching | React Query 5 |
| Charts | Recharts 2 |
| Auth | @fastify/jwt + bcryptjs |
| PWA | Workbox + IndexedDB |

## Immediate Next Steps (Priority Order)

1. **Start Docker services** — `docker compose up -d`
2. **Generate Drizzle migration** — `cd apps/api && npx drizzle-kit generate`
3. **Run migrations** — `npm run db:migrate`
4. **Seed database** — `npm run db:seed`
5. **Start dev servers** — `npm run dev`
6. **Manual testing** — open http://localhost:5173, test scoring flow
7. **Wire auth middleware** — add `onRequest` JWT verification hook to protected routes
8. **Add request validation** — Fastify JSON Schema or Zod for all endpoints
9. **Write tests** — unit tests for scoring engine, integration tests for API
10. **Set up CI/CD** — GitHub Actions pipeline

## Known Issues

- `docker` not in bash PATH on this Windows machine — use PowerShell or add Docker Desktop to PATH
- PowerShell blocks npm.ps1 — use `npm.cmd` instead
- Auth routes exist but no middleware protects other endpoints
- No input validation on API endpoints (trusting client input)
- No rate limiting on auth endpoints
- Pre-commit hook requires handoff file refresh with code changes
