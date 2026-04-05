# Cricket Scoring Platform - Architecture Review

*Generated: 2026-04-05 | 5 parallel deep-audit agents*

## Verdict: Architecturally Sound, Operationally Incomplete

**Stack confidence: 8/10** — Technology choices are correct and will serve at scale.
**Production readiness: 3/10** — Critical gaps in testing, security, observability, and DevOps.

---

## 1. WHAT'S WORKING (KEEP)

| Component | Choice | Why It's Right |
|-----------|--------|----------------|
| **Backend** | Fastify 5 + TypeScript | High throughput, plugin ecosystem, type-safe |
| **ORM** | Drizzle 0.36 | Best-in-class TS type safety, PostgreSQL-native |
| **Database** | TimescaleDB (PG 16) | Perfect for delivery time-series, compression, hypertables |
| **Cache/PubSub** | Redis 7 + ioredis | Industry standard for live scores, sessions, queues |
| **Real-time** | Socket.IO 4.8 | Auto-reconnect, room subscriptions, fallback polling |
| **Job Queue** | BullMQ 5.73 | Reliable background processing with Redis |
| **Frontend** | React 18 + Vite + Tailwind | Modern, fast, well-extended cricket theme |
| **State** | Zustand + TanStack Query | Clean separation: local UI state vs server state |
| **Mobile** | Expo 52 + React Native | Good for MVP, cross-platform with typed routes |
| **Monorepo** | Turborepo | Workspace isolation, correct build pipeline |
| **Data Model** | Immutable event sourcing | Delivery table as append-only log — correct for cricket |
| **Auth** | JWT + Redis refresh tokens | Solid pattern with session management |
| **PWA** | Workbox + IndexedDB | Offline-first scoring is the killer feature |

---

## 2. WHAT MUST CHANGE

### 2.1 Critical Architecture Gaps

| Gap | Current State | Risk | Fix |
|-----|--------------|------|-----|
| **Race conditions in scoring** | No transactions around multi-table updates | Concurrent deliveries corrupt state | Wrap in SERIALIZABLE transaction |
| **No idempotency keys** | Offline sync can submit same delivery twice | Duplicate scores | Add `clientId` column, check before insert |
| **Undo doesn't revert scorecards** | Only marks delivery overridden | Stale batting/bowling stats after undo | Revert all aggregates in transaction |
| **No request validation** | Zod installed but never used | Invalid data enters DB | Add Fastify JSON Schema on all routes |
| **No database transactions** | Multi-step operations commit individually | Orphaned state on partial failure | Use `db.transaction()` everywhere |

### 2.2 Technology Changes

| Current | Change To | Why |
|---------|-----------|-----|
| bcryptjs | **argon2** | Winner of Password Hashing Competition, GPU/ASIC resistant |
| node-cron (trending) | **BullMQ repeatable jobs** | Survives crashes, has retry/observability |
| Local disk uploads | **S3/R2** | Data loss on container restart, can't scale |
| CORS `origin: '*'` | **Environment-gated origins** | Security hole in production |
| JWT `'dev-secret'` fallback | **Fail if missing** | Silent weak secret in production |
| `x-user-id` header fallback | **JWT-only in production** | Spoofable identity |

### 2.3 Remove from Phase 1

| Component | Why Remove |
|-----------|-----------|
| **Kafka** (docker-compose) | Zero code consumes it. 2-4GB RAM wasted. Add back for Phase 4 analytics |
| **ClickHouse** (docker-compose) | No data flows to it. Add when analytics pipeline starts |

---

## 3. WHAT'S MISSING (MUST ADD)

### 3.1 Production-Blocking (Week 1-2)

| Missing | Impact | Effort |
|---------|--------|--------|
| **CI/CD pipeline** | No automated testing/deployment | M — GitHub Actions: lint, test, build, deploy |
| **Test suite** | 0% coverage, can't refactor safely | L — Vitest for API, RTL for frontend |
| **ESLint + Prettier** | No code consistency | S — Root config + Husky pre-commit |
| **Structured logging** | Can't debug production issues | S — Pino with correlation IDs |
| **Error tracking** | Bugs go unnoticed for hours | S — Sentry integration |
| **Prometheus metrics** | No visibility into latency/errors | M — prom-client + Grafana |
| **Graceful shutdown** | In-flight requests lost on deploy | S — SIGTERM handler |
| **Health check (deep)** | Current `/health` doesn't check DB/Redis | S — Add dependency checks |
| **Security headers** | No CSP, HSTS, X-Frame-Options | S — @fastify/helmet |
| **Env validation** | Missing var = silent crash | S — Zod schema for process.env |
| **Production Dockerfiles** | Dev-only docker-compose | M — Multi-stage builds with health checks |

### 3.2 Before Scaling (Week 3-4)

| Missing | Impact | Effort |
|---------|--------|--------|
| **Socket.IO Redis adapter** | Can't run 2+ API instances | S — Uncomment existing code |
| **DB connection pooling** | Exhaust connections under load | S — postgres.js `max: 20` |
| **API documentation** | Frontend team reverse-engineers endpoints | M — @fastify/swagger |
| **Load testing baseline** | No performance benchmark | M — k6 scripts |
| **Database backups** | No disaster recovery | M — pg_dump cron + S3 |
| **Audit log table** | No correction history (spec requires 5yr retention) | M — New table + triggers |

### 3.3 Missing Business Features

| Feature | Phase | Effort | Notes |
|---------|-------|--------|-------|
| Email service | 2B | S | nodemailer for verification/reset (routes exist, no sender) |
| FCM push notifications | 2F | M | expo-notifications + firebase-admin |
| OAuth (Google/Apple) | 2B | M | Can defer to v1.1 if email/password suffices |
| Career stats endpoints | 4A | M | No `/users/:id/stats` routes |
| DLS calculation | 4C | L | Schema exists, no implementation |
| Fantasy scoring engine | 5A | M | CRUD exists, points calculation missing |
| Team membership & roles | 3A | M | No RBAC, no invite workflow |

---

## 4. RISK REGISTER

| Risk | Severity | Mitigation |
|------|----------|------------|
| **Concurrent scoring corrupts data** | CRITICAL | SERIALIZABLE transactions + advisory locks |
| **Redis SPOF** | HIGH | Redis Sentinel for HA (Phase 2+) |
| **No test safety net** | HIGH | Vitest + E2E before any refactoring |
| **TimescaleDB hypertable not created** | MEDIUM | Migration to convert delivery table |
| **N+1 queries at scale** | MEDIUM | Already fixed with batch loading |
| **Socket.IO single-instance** | HIGH | Wire Redis adapter before horizontal scale |
| **Missing indexes** | MEDIUM | Add: delivery(created_at), innings(status), partnership(innings_id, is_active) |

---

## 5. STRATEGIC QUESTIONS

These need answers before finalizing architecture and timeline:

### Target & Scale
1. **Who is the primary user?** Club/gully cricket (offline-heavy, simple) vs professional leagues (real-time, analytics-heavy) vs fantasy enthusiasts (social, gamification)?
2. **Scale at launch?** 100 users / 10K / 100K / 1M? This determines single-server vs Kubernetes, caching strategy, read replicas.
3. **Geographic focus?** India-only / South Asia / global? Affects CDN, data residency, payment processors, multi-region.

### Product Scope
4. **What's the MVP?** Can we ship without fantasy? Mobile? Trending? Chat?
5. **Which cricket formats for v1?** T20+ODI covers 90% of use cases. Do we need Test, T10, Hundred at launch?
6. **Is mobile a v1 must-have?** Currently 0% feature parity. Web-first launch saves 3-4 weeks.
7. **Commentary: manual templates or AI-generated?** Templates = 2 weeks. NLG = Phase 3+ with hallucination risks.

### Architecture Decisions
8. **Is immutable event sourcing needed for gully cricket?** Adds complexity. Simpler CRUD could work for casual use. Keep for professional.
9. **Auth: email/password only or social login required?** OAuth adds 2 weeks. Email-only is fine for MVP.
10. **Python ML service: build or buy?** Build = +6 months, +2-3 FTE. Third-party APIs (Sportradar) = faster but less control.

### Operations
11. **Cloud provider?** AWS / GCP / Azure / self-hosted? Affects S3 vs R2, RDS vs Cloud SQL, deployment tooling.
12. **Team size?** 1 engineer / 3 / 5 / 10? Determines what to defer vs build.
13. **Launch timeline?** When does this need to be live?
14. **Monetization model?** Free-first / freemium from launch / ad-supported? Shapes feature priorities.

---

## 6. MVP DEFINITION (Recommended)

### Ship (6-8 weeks from bug fixes)
- Ball-by-ball scoring (Phase 1) -- DONE
- Teams + players CRUD -- DONE
- Match lifecycle + scorecard -- DONE
- Live WebSocket updates -- DONE
- JWT auth (email/password) -- DONE
- Chat (REST) -- DONE
- Trending -- DONE
- Web PWA with offline scoring
- Auth hardening (rate limiting, sessions)
- Security headers + CORS lockdown
- CI/CD + monitoring basics

### Defer to v1.1 (4-6 weeks after launch)
- Mobile app (Expo) feature parity
- Fantasy contests + scoring engine
- Achievements + gamification
- OAuth (Google/Apple)
- Email service integration
- FCM push notifications

### Defer to v2 (future)
- Career stats + analytics dashboards
- DLS calculation engine
- Python prediction service
- Team management (roles, invites)
- ClickHouse analytics pipeline
- Multi-region deployment
- i18n / monetization

---

## 7. PRODUCTION READINESS CHECKLIST

### Must-Have (Blocking Launch)
- [ ] 6 critical scoring bugs fixed (DONE this session)
- [ ] Auth enabled on all endpoints (DONE this session)
- [ ] SERIALIZABLE transactions in scoring engine
- [ ] Idempotency keys for delivery submission
- [ ] Request validation (Fastify JSON Schema / Zod)
- [ ] Security headers (@fastify/helmet)
- [ ] Graceful shutdown handler
- [ ] Production Docker images
- [ ] CI/CD pipeline (lint, test, build, deploy)
- [ ] Deep health check endpoint
- [ ] Structured logging with correlation IDs
- [ ] Database backups + restore procedure
- [ ] Secrets management (no fallback secrets)
- [ ] HTTPS/TLS
- [ ] Environment-gated CORS

### Should-Have (Before Day 30)
- [ ] Prometheus metrics + Grafana dashboards
- [ ] Sentry error tracking
- [ ] Load testing baseline (k6)
- [ ] API documentation (Swagger)
- [ ] Socket.IO Redis adapter
- [ ] S3/R2 for file uploads
- [ ] Connection pooling
- [ ] Audit log table
- [ ] Missing database indexes

---

## 8. SCORECARD

| Dimension | Score | Key Issue |
|-----------|-------|-----------|
| **Technology Choices** | 9/10 | All solid, no major changes needed |
| **Data Model** | 8/10 | Excellent normalization, missing hypertable setup |
| **API Design** | 6/10 | RESTful but no validation, inconsistent errors |
| **Scoring Engine** | 6/10 | Good architecture, critical race conditions |
| **Frontend** | 5.5/10 | Good patterns, untyped API client, no tests |
| **Security** | 4/10 | Auth exists but not wired, CORS wide open |
| **Testing** | 0/10 | Zero test files exist |
| **DevOps** | 1/10 | No CI/CD, no monitoring, no production deploy |
| **Documentation** | 4/10 | context.md excellent, no API docs |
| **Overall** | **4.8/10** | Sound foundation, needs 6-8 weeks hardening |
