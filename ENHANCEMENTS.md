# CricScore — Enhancement Backlog

> **STATUS: ALL 60 ENHANCEMENTS IMPLEMENTED** (8 sprints completed)
>
> P0 = must-have for launch, P1 = important, P2 = nice-to-have, P3 = future.
> S = <1 day, M = 1-3 days, L = 3-7 days, XL = 1-2 weeks.

---

## 1. Scoring Engine Enhancements

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 1 | Advanced DLS calculation | Full G50 resource table, multi-interruption support, revised targets per ICC rules | P0 | L |
| 2 | Free hit carryover | If a free-hit delivery is itself a no-ball, next ball is also free hit — chain until legal ball | P1 | S |
| 3 | Follow-on complete flow | Captain confirmation UI, innings re-entrance, Test-specific carry-forward | P1 | M |
| 4 | Super over complete flow | Team squad selection, batting pair validation, boundary count tiebreaker, result determination | P1 | L |
| 5 | Substitution rules per format | Concussion sub (1 per team), impact player (IPL), X-Factor — validate per format config | P1 | M |
| 6 | Batting order enforcement | Validate new batsmen follow correct order, track rejoin after sub | P1 | M |
| 7 | Powerplay window enforcement | Validate fielding restrictions per powerplay stage (PP1/PP2/PP3), overs range from format config | P1 | S |
| 8 | Session tracking (Test) | Lunch/Tea/Stumps prompts, daily play boundaries, session-end auto-pause | P1 | M |
| 9 | Bonus points system | First-Class/List-A bonus points calculation for tournament points tables | P1 | M |
| 10 | Dead ball refinement | Integration with umpire signal system, short runs, ball becoming dead mid-play | P2 | M |

---

## 2. UI/UX Improvements

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 11 | Toss & match setup wizard | Guided flow: toss winner → bat/field → playing XI confirmation — block scoring until toss recorded | P1 | M |
| 12 | Sync status indicator | Connection state badge, conflict resolution modal with diff, offline queue counter | P1 | M |
| 13 | Commentary editor in scoring UI | Inline edit modal for auto-generated commentary, closes after next ball or manual save | P1 | S |
| 14 | Live commentary feed page | Auto-scrolling ball-by-ball feed with mode filters and WebSocket real-time updates | P1 | M |
| 15 | Fielder position selector | Visual field diagram in wicket modal for caught/stumped — select fielder by position | P2 | M |
| 16 | Over-by-over breakdown page | Each over's deliveries, extras summary, bowler change, field placements | P2 | M |
| 17 | Match status break screens | Visual differentiation per status (innings break, rain delay) with target display | P2 | M |
| 18 | Undo/correction audit log | Page showing all undone/corrected balls, who did it, timestamps | P2 | M |
| 19 | Gesture & haptic feedback | Haptics on wicket, boundary, undo — long-press for options (mobile) | P2 | S |
| 20 | Partnership visualization in scorecard | Partner timeline bars with runs, balls, duration per partnership | P2 | M |

---

## 3. Analytics & Visualization

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 21 | Worm chart (cumulative runs) | Line chart with par line (DLS if applicable), both innings overlaid, required rate projection | P1 | M |
| 22 | Manhattan chart | Runs per over stacked bars (boundaries vs singles vs extras), both innings overlaid | P1 | M |
| 23 | Live prediction chart | Real-time probability bar animation, score range gauge, smooth update transitions | P1 | M |
| 24 | Wagon wheel renderer | D3.js ball trajectory visualization, phase filtering (PP/middle/death), PNG/SVG export | P2 | M |
| 25 | Pitch map heatmap | Ball landing density visualization, bowler filter, over range filter | P2 | L |
| 26 | Partnership analysis dashboard | Partnership bars with individual batsman contribution split, unbroken partnerships | P2 | M |
| 27 | Phase-wise stats breakdown | PP/Middle/Death overs comparison — run rate, dot %, boundary rate per phase | P2 | S |
| 28 | Head-to-head matchup grid | Historical bowler-vs-batsman stats — balls faced, runs, dismissals, dot % | P3 | M |
| 29 | All-time records database | Highest scores, fastest 50s, most wickets — venue and format filters | P3 | L |
| 30 | Venue-specific statistics | Batting/bowling stats aggregation per venue, fixture history | P3 | L |

---

## 4. Real-time & Social

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 31 | Push notifications | FCM integration, web push via Service Worker, user token collection, wicket/milestone alerts | P1 | L |
| 32 | Live chat per match | WebSocket chat integration, moderation/spam filtering, web UI component | P2 | M |
| 33 | Multi-language commentary | Hindi, Tamil, Bengali, Urdu template expansion for auto-generated commentary | P2 | L |
| 34 | User follows & activity feed | Follow schema wiring, "following" feed page, notification on followed user's match result | P3 | M |
| 35 | Spectator presence count | Real-time "who's watching" indicator, WebSocket room-based presence broadcast | P3 | M |
| 36 | Emoji reactions on deliveries | Fan reactions to deliveries/milestones, WebSocket broadcast, animation overlay | P3 | M |
| 37 | Notification preferences | Per-user notification settings — which events to alert on, quiet hours, channels | P2 | S |

---

## 5. Mobile App (Expo/React Native)

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 38 | Complete mobile app | Finish all tab pages (stubs → functional), styling, navigation, auth flow | P1 | XL |
| 39 | Mobile offline scoring | Local SQLite mirror, background sync on reconnect, conflict resolution UI | P1 | L |
| 40 | Mobile live match ticker | Real-time delivery notification overlay, swipe to dismiss, landscape mode | P2 | M |
| 41 | App store submission prep | iOS/Android signing, privacy policy, analytics SDK (Firebase), crash reporting (Sentry) | P2 | M |

---

## 6. Infrastructure & DevOps

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 42 | Secrets management | Replace .env files with Vault/AWS Secrets Manager, env-specific configs (dev/staging/prod) | P0 | S |
| 43 | Load testing suite | k6/Artillery for concurrent fans (100K target), delivery throughput, WebSocket limits | P0 | L |
| 44 | CI/CD pipeline | GitHub Actions: lint → test → build → deploy stages, Turbo cache, preview deploys | P1 | M |
| 45 | Docker & container setup | API/web Dockerfiles, production Docker Compose, Kubernetes manifests | P1 | M |
| 46 | Database monitoring | TimescaleDB query performance, connection pool saturation, Prometheus metrics | P1 | M |
| 47 | Error tracking (Sentry) | API + web Sentry integration, centralized error logs, stack trace capture | P1 | S |
| 48 | APM & performance profiling | New Relic/DataDog instrumentation for hot paths (delivery submission <500ms target) | P2 | M |

---

## 7. Data & ML

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 49 | Win probability heuristic | DLS-resource-based model, team form weighting, venue impact — replace current simple RRR/CRR | P1 | M |
| 50 | Career stats aggregation | ClickHouse materialized views, CDC/Kafka sync pipeline, fallback cron job | P1 | L |
| 51 | Score projection engine | Time-series regression model for low/mid/high range projections | P2 | L |
| 52 | Player form tracking | Recent innings average, SR trend, form index score — ridge regression forecast | P3 | M |
| 53 | Next-over Markov prediction | Markov chain model for next-over run distribution — requires 200+ encounters data | P3 | L |

---

## 8. Business Features

| # | Enhancement | Description | Priority | Size |
|---|-------------|-------------|----------|------|
| 54 | Tournament management UI | Create/edit tournaments, points table, fixture scheduler, qualification logic | P1 | L |
| 55 | Scorer role assignment UI | Tournament admin assigns/revokes scorer permissions per match, dual-scorer support | P1 | M |
| 56 | Tournament tiebreaker rules | Net run rate calculation, apply format-specific tiebreaker logic to points tables | P1 | M |
| 57 | GDPR export & deletion flow | Graceful UI, 30-day grace period, player anonymization, JSON portability format | P1 | M |
| 58 | Fantasy cricket completion | Scoring logic, user team builder UI, leaderboard rendering, prize distribution | P2 | L |
| 59 | PDF scorecard export | Template design, jsPDF/Puppeteer rendering, branded layout, multi-language | P2 | M |
| 60 | Broadcaster API & feed | Raw event stream endpoint, overlay-ready data panels, API key management | P2 | M |

---

## Priority Summary

| Priority | Count | Description |
|----------|-------|-------------|
| **P0** | 3 | DLS calculation, secrets management, load testing |
| **P1** | 28 | Core features for tournament operations and production launch |
| **P2** | 22 | Enhanced analytics, social features, polish |
| **P3** | 7 | Future ML models, advanced social, records database |

## Suggested Sprint Plan

**Sprint 1 (Launch Blockers — P0):** DLS calculation, secrets management, load testing — 2 weeks

**Sprint 2 (Tournament Ready — P1 Engine):** Follow-on, super over, substitution rules, powerplay, batting order — 2 weeks

**Sprint 3 (Production UI — P1 UI/UX):** Toss wizard, sync indicator, commentary editor, live feed — 1 week

**Sprint 4 (Analytics — P1 Viz):** Worm chart, Manhattan, prediction chart — 1 week

**Sprint 5 (Infrastructure — P1 DevOps):** CI/CD, Docker, Sentry, DB monitoring — 1 week

**Sprint 6 (Business — P1):** Tournament UI, scorer assignment, tiebreakers, GDPR — 2 weeks

**Sprint 7 (Social — P1):** Push notifications, career stats aggregation — 1 week

**Sprint 8+ (P2/P3):** Mobile app, fantasy, analytics charts, ML models — ongoing
