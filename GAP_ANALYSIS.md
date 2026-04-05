# Cricket Scoring App - Comprehensive Gap Analysis

*Generated: 2026-04-05 | 5 parallel deep-audit agents*

## Executive Summary

**Phase 1 (Core Scoring): 100% complete** - All 15 tables, 45+ routes, scoring engine working.
**Phase 2 (Social Platform): ~65% complete** - Schemas + routes done, workers/services partially wired.
**Phase 3-5: 0-30%** - Schemas exist, most logic missing.
**Phase 6: Not started.**

**Total E2E Tests Passing: 239** (85 Phase 1 + 112 Phase 2 + 42 Production)

---

## CRITICAL BUGS (Must Fix Before Production)

### 1. Scoring Engine: Free-Hit Detection Unreliable
**File:** `scoring-engine.ts:73-80`
**Issue:** Query fetches "last delivery by undoStackPos" without filtering by over/ball sequence. Could flag wrong deliveries as free-hit after undo operations.
**Impact:** Invalid dismissals could be allowed during free-hit balls.

### 2. Scoring Engine: Bowler Overs Validation Allows Over-Limit
**File:** `scoring-engine.ts:88-99`
**Issue:** Condition `completedOvers >= max && !currentBowlerOver` lets a bowler start a NEW over beyond their limit (because the new over has 0 legal balls, so `currentBowlerOver` exists).
**Fix:** Change to `if (completedOvers >= maxBowlerOvers) throw`.

### 3. Partnership Table Missing from Migration
**File:** `partnership.ts` schema exists, but NO SQL migration creates the table.
**Impact:** Partnership tracking silently fails in production (table doesn't exist).

### 4. Undo Doesn't Revert Extras
**File:** `scoring-engine.ts:306-319`
**Issue:** `totalExtras` not reset when undoing a wide/no-ball delivery.
**Impact:** Extras total becomes incorrect after any undo of an extras delivery.

### 5. Batting Scorecard Never Created on First Ball
**File:** `scoring-engine.ts:470-502`
**Issue:** `updateBattingScorecard` only updates existing records, never inserts. If scorecard record doesn't exist for a batsman, their stats are silently lost.

### 6. Innings Route: New Batsman Updates Wrong Records
**File:** `innings.ts:120-127`
**Issue:** Updates ALL batting scorecard entries in the innings instead of the specific player. Missing WHERE clause for playerId.

---

## HIGH PRIORITY ISSUES

### Security
| Issue | File | Impact |
|-------|------|--------|
| 76% of endpoints have NO auth | All route files | Anyone can create/modify matches, score deliveries |
| PATCH /matches/:id accepts any status | matches.ts:280 | Can set invalid match states |
| DELETE /teams/:id is public | teams.ts:51 | Anyone can delete any team |
| Commentary PATCH has no ownership check | commentary.ts:54 | Anyone can edit commentary |
| x-user-id header spoofable | users.ts, social.ts | User impersonation possible |

### Data Integrity
| Issue | File | Impact |
|-------|------|--------|
| No validation homeTeamId != awayTeamId | matches.ts:93 | Match with same team on both sides |
| Team existence not checked on match create | matches.ts:137 | FK violation on insert |
| Follow-on threshold hardcoded to 200 | innings.ts:164 | Wrong for non-Test formats |
| Review count global instead of per-match | reviews.ts:42 | Wrong DRS review count |
| Maiden over SQL comparison in SET | scoring-engine.ts:231 | Fragile boolean logic |

### Performance
| Issue | File | Impact |
|-------|------|--------|
| N+1 queries in match listing | matches.ts:11-47 | 300+ queries for 100 matches |
| N+1 in scorecard enrichment | scorecard.ts:22-91 | 22+ queries per innings |
| Player cache built per-request | commentary.ts:26 | Repeated DB hits |

---

## SCHEMA-MIGRATION MISMATCHES

| Item | Schema | Migration | Status |
|------|--------|-----------|--------|
| partnership table | `partnership.ts` exists | NOT in any migration | MISSING |
| Migration 002 | - | Not in Drizzle `_journal.json` | UNTRACKED |
| emailVerified column | Not in user.ts | Not in migration | MISSING |
| chat_message.reply_to_id | FK defined | No ON DELETE behavior | SHOULD BE SET NULL |

---

## FRONTEND GAPS

### Web App
| Issue | Severity |
|-------|----------|
| API client returns `any` types everywhere | CRITICAL |
| No Authorization header in web API client | CRITICAL |
| No error boundaries | CRITICAL |
| Missing .env.example | HIGH |
| Offline sync queue never syncs back to server | HIGH |
| Socket.IO listeners not cleaned up on unmount | MEDIUM |
| Stale state risk: store vs query data divergence | MEDIUM |

### Mobile App
| Issue | Severity |
|-------|----------|
| Silent error catches throughout | HIGH |
| Score screen missing required field validation | HIGH |
| Profile "Sign In" button doesn't route anywhere | MEDIUM |
| No offline storage (expo-sqlite) | HIGH |

### Shared Package
| Issue | Severity |
|-------|----------|
| Types not properly exported for frontend use | CRITICAL |
| snake_case vs camelCase inconsistency | HIGH |
| Commentary types defined but never used in UI | LOW |

---

## FEATURES: PLAN VS IMPLEMENTATION

### Fully Complete
- Core scoring engine (ball-by-ball, extras, wickets, free-hit)
- Match lifecycle (create, toss, start, interruption, resume, super-over)
- DRS reviews
- Substitutions
- Follow/unfollow system
- Chat rooms + messages (REST)
- Notifications (REST)
- Fantasy contests (CRUD)
- Leaderboards (5 endpoints with filters)
- Trending (3 endpoints with filters)
- GDPR (export + delete)
- Auth (register, login, refresh, logout, forgot-password, verify-email, sessions)
- Rate limiting
- Profile update (PATCH /me)

### Partially Complete
| Feature | Done | Missing |
|---------|------|---------|
| Feed fan-out | BullMQ worker exists | Creator not added to own feed |
| Notifications | REST endpoints | FCM push, Socket.IO broadcast |
| Trending | Schema + routes | Cron job computation incomplete |
| Achievements | Schema + 5 rules | Hat-trick always false, no worker |
| Socket.IO chat | /social namespace added | Room lifecycle events incomplete |
| Mobile app | Expo scaffold, 8 screens | Feature parity with web |
| Auth hardening | Password reset, sessions | OAuth (Google/Apple), email service |
| Avatar upload | Endpoint exists | S3/R2 integration (uses local disk) |
| Analytics | Worm/manhattan routes | Wagon wheel, pitch map, win probability |

### Not Started
| Feature | Phase | Notes |
|---------|-------|-------|
| Team management (roles, invites) | 3A | No team_membership or team_invite tables |
| Player availability polling | 3C | No match_availability table |
| Career stats endpoints | 4A | No /users/:id/stats routes |
| Python prediction service | 4C | No Python code at all |
| Fantasy scoring engine | 5A | Points calculation missing |
| DLS calculation | 1 | Schema exists, no implementation |
| Freemium/monetization | 6 | Future |
| i18n | 6 | Future |
| Multi-region deployment | 6 | Future |

---

## WORKER/SERVICE STATUS

| Service | File | Status |
|---------|------|--------|
| feed-worker.ts | workers/ | IMPLEMENTED - fans out to followers |
| notification-worker.ts | workers/ | IMPLEMENTED - inserts notifications |
| feed-service.ts | services/ | IMPLEMENTED - publishActivity() |
| notification-service.ts | services/ | IMPLEMENTED - sendNotification() |
| trending-service.ts | services/ | IMPLEMENTED - computeTrending() |
| trending-cron.ts | services/ | IMPLEMENTED - hourly via node-cron |
| achievement-service.ts | services/ | PARTIAL - hat-trick placeholder |
| realtime.ts (/social) | services/ | IMPLEMENTED - chat broadcast + typing |

**Missing:** BullMQ retry config, FCM integration, email service.

---

## RECOMMENDED FIX PRIORITY

### P0 - Critical Bugs (Day 1)
1. Fix free-hit detection query (filter by over/sequence)
2. Fix bowler overs validation (remove `!currentBowlerOver` condition)
3. Create partnership migration SQL
4. Fix undo to revert totalExtras
5. Fix batting scorecard to INSERT on first ball
6. Fix innings new-batsman WHERE clause

### P1 - Security (Week 1)
7. Add auth middleware to match/delivery/team/player routes
8. Validate match status transitions
9. Add ownership checks to DELETE/PATCH endpoints
10. Replace x-user-id with JWT subject in all routes

### P2 - Data Integrity (Week 1-2)
11. Add team existence validation on match create
12. Prevent homeTeam == awayTeam
13. Fix review count to filter by match
14. Fix follow-on threshold to use format config
15. Add Drizzle migration journal entry for 002

### P3 - Performance (Week 2)
16. Replace N+1 queries with JOINs in match listing
17. Replace N+1 in scorecard with batch player lookup
18. Add BullMQ retry config to workers

### P4 - Frontend (Week 2-3)
19. Add auth token to web API client
20. Add error boundaries
21. Type the API client with shared types
22. Create .env.example files
23. Fix snake_case/camelCase mismatches

### P5 - Missing Features (Week 3+)
24. Team management (team_membership, invites)
25. Career stats endpoints
26. Fantasy scoring engine
27. OAuth (Google/Apple)
28. Email service integration
29. FCM push notifications
30. Complete mobile feature parity
