CRICKET SCORING APP — AGENT CONTEXT FILE

Version: 1.0 | Date: April 2026
Use this file as system context when prompting an agent to build, extend, or reason about the Cricket Scoring App.


PURPOSE OF THIS DOCUMENT
This file is the canonical context for any AI agent working on the Cricket Scoring App project. It defines the product vision, supported formats, system architecture, data models, APIs, features, technology stack, and development roadmap. An agent MUST read this entire document before taking any action on this codebase or feature set.

1. PRODUCT OVERVIEW
Product Name: Cricket Scoring App (working title)
Type: Full-stack real-time cricket scoring platform
Target Users:

Scorers (ball-by-ball data entry, offline-capable)
Fans / Spectators (live score consumption)
Coaches / Analysts (deep analytics dashboards)
Broadcasters (live data feed / API consumers)
Tournament Administrators (fixture, table, result management)

Core Value Propositions:

Real-time ball-by-ball scoring with <500ms publish latency
Supports ALL recognized cricket formats (Test through club custom)
Auto-generated + manually editable text commentary
Deep analytics: wagon wheel, pitch map, worm chart, partnerships, phase stats
AI-powered win probability, score projections, DLS calculations
Mobile-first PWA with full offline scoring capability
Multi-tenant: supports international, domestic, club, and custom leagues


2. SUPPORTED CRICKET FORMATS
FormatOversInningsSpecial RulesTest MatchUnlimitedUp to 4 (2 per team)Follow-on, Declarations, Session breaks (Lunch/Tea/Stumps), Weather reserve daysODI502Powerplays PP1/PP2/PP3, DLS methodT20202Powerplay, Super Over, Free hit on front-foot no-ballT10102Fast scoring, no mandatory powerplay variationsThe Hundred100 balls25 and 10-ball over sequences, mandatory bowling change every 10 balls, batting pairsFirst-ClassUnlimited2–4Day/session tracking, bonus points, championship tableList-A40–602Format-configurable powerplaysClub / CustomUser-definedUser-definedFully configurable rules, bonus balls, declarations
Rule Engine: Each format is a pluggable configuration profile. Custom formats inherit from a base template and override individual rules. The rule engine governs: over limits, innings count, powerplay windows, free-hit triggers, super over, follow-on threshold, DLS applicability, and session schedules.

3. SYSTEM ARCHITECTURE
Layer Diagram (Top to Bottom)
[CLIENT LAYER — Mobile-First PWA]
  Scorer PWA | Fan Live App | Analytics Dashboard | Admin Portal | Broadcaster API

        ↕ HTTPS / WebSocket (Socket.IO)

[API GATEWAY + REAL-TIME LAYER]
  REST API Gateway | WebSocket Server | CDN / Edge Cache (Cloudflare)

        ↕

[MICROSERVICES LAYER]
  Scoring Service       — ball submission, validation, undo/redo, event emit
  Commentary Service    — NLG template engine, manual override, multi-language
  Analytics Service     — aggregations, chart data, career stats queries
  Prediction Service    — ML models (Python/FastAPI), DLS engine
  Notification Service  — push, email, SMS triggers on match events
  User/Auth Service     — OIDC, JWT, multi-tenant role management
  Media Service         — PDF export, social card generation, object storage

        ↕

[DATA + MESSAGE LAYER]
  TimescaleDB (PG 16)   — primary transactional DB, event source log (TimescaleDB superset)
  Redis 7               — live score cache, WebSocket pub/sub, sessions
  ClickHouse            — analytics OLAP, career stats, billion-row queries (Phase 2)
  Apache Kafka          — event bus, ball event streaming to consumers (Phase 2)
  AWS S3 / R2           — exports, scorecards, media, social graphics (Phase 2+)
Key Architectural Decisions
ConcernDecisionRationaleStatusReal-time syncWebSocket (Socket.IO) + Redis PubSubSub-500ms delivery; fan clients subscribe to match rooms✅ ImplementedOffline scoringPWA + IndexedDB + Service WorkerScorer works offline in ground; sync queue on reconnect✅ ImplementedData integrityImmutable event sourcing (ball event log)Full replay, audit trail, undo/redo without data loss✅ ImplementedPrimary DBTimescaleDB (PG 16) + Drizzle ORMType-safe ORM; TimescaleDB superset enables future time-series analytics✅ ImplementedAnalyticsClickHouse OLAPBillion-row ball data with millisecond aggregation queries🔮 Phase 2API designREST (live scoring) + GraphQL (analytics)REST for simplicity; GraphQL for flexible dashboard queriesREST ✅ / GraphQL 🔮 Phase 2ML predictionPython microservice (FastAPI)Isolated compute; model updates independent of app deploy🔮 Phase 3Multi-tenancyRow-level isolation per league/orgSupports club cricket to international on one platform🔮 Planned

4. TECHNOLOGY STACK
LayerTechnologyNotesStatusFrontend FrameworkReact 18 + TypeScriptComponent model; strong ecosystem✅ ImplementedState ManagementZustand + React QueryLocal state + server-state sync/caching✅ ImplementedReal-Time ClientSocket.IO (client)Auto-reconnect, room subscriptions, fallback polling✅ ImplementedPWAVite PWA Plugin + WorkboxService worker, offline cache, background sync✅ ImplementedData VisualizationRecharts + D3.jsRecharts for standard charts; D3 for wagon wheel/pitch map✅ ImplementedStylingTailwind CSS + CSS ModulesUtility-first for speed; CSS modules for isolation✅ ImplementedBackend APINode.js + FastifyHigh throughput, TypeScript-native✅ ImplementedORMDrizzle ORMType-safe SQL generation, migrations, PostgreSQL driver✅ ImplementedReal-Time ServerSocket.IO (single-instance Phase 1) + Redis Adapter (Phase 2)Single-instance in Phase 1; Redis adapter added in Phase 2 for horizontal scaling✅ Phase 1 (single-instance) / 🔮 Phase 2 (Redis adapter)GraphQLApollo ServerFlexible analytics queries🔮 Planned (Phase 2)Primary DBTimescaleDB (PostgreSQL 16)ACID; JSONB; TimescaleDB superset for time-series extensions✅ ImplementedCache / PubSubRedis 7Live score cache, sessions, WebSocket rooms✅ ImplementedAnalytics DBClickHouseColumnar OLAP; millisecond group-by queries🔮 Planned (Phase 2)Message BusApache KafkaEvent sourcing; replication factor 3🔮 Planned (Phase 2)Prediction ServicePython + FastAPI + XGBoost/scikit-learnIsolated ML workload🔮 Planned (Phase 3)Object StorageAWS S3 / Cloudflare R2Exports, media, social cards🔮 Planned (Phase 2+)AuthSelf-issued JWT (Phase 1) → Auth0/Keycloak OIDC (Phase 2)Phase 1: RS256 JWT, bcrypt passwords, email+password only. Phase 2: OIDC, social login✅ Phase 1 (JWT) / 🔮 Phase 2 (OIDC)InfrastructureKubernetes (EKS/GKE) + TerraformAuto-scaling; GitOps deployment🔮 PlannedMonitoringGrafana + Prometheus + SentryLive metrics, alerting, error tracking🔮 PlannedCDNCloudflareGlobal edge cache; DDoS protection🔮 Planned

4.1 DATABASE LAYER SPECIFICATIONS

TimescaleDB (PostgreSQL 16) — Primary Transactional Store
- Hypertable: The `deliveries` table is converted to a TimescaleDB hypertable, partitioned by `created_at` with chunk intervals of 1 day. This enables time-range queries (e.g., "all balls in the last over") and automatic chunk compression after 7 days.
- Continuous Aggregates: Pre-materialized views for innings_summary (total runs, wickets, overs, run_rate) and over_summary (runs per over, extras, wickets). Refreshed on every delivery insert via a trigger.
- Compression Policy: Chunks older than 30 days are compressed with segment_by = match_id and order_by = undo_stack_pos. Compressed data remains queryable for historical match replay.
- Indexes: Composite indexes on (match_id, innings_num, undo_stack_pos) for event replay; (bowler_id, match_id) and (striker_id, match_id) for player stats queries; (match_id, created_at) for the hypertable partition key.
- Connection Pool: PgBouncer in transaction mode; max 50 connections per Fastify instance.

Redis 7 — Live Cache & PubSub
- Live Score Cache: Each active match has a Redis hash at key `match:{id}:live` containing current scorecard snapshot (JSON), updated on every delivery. TTL: none while match is live; 24 hours after match completes.
- Invalidation: Cache is invalidated (rewritten) on every delivery, undo, correction, or status change. The Scoring Service is the sole writer; fan clients and the WebSocket server are readers.
- WebSocket PubSub: Redis PubSub channels per match room (`ws:match:{id}`). Socket.IO adapter publishes delivery/wicket/milestone events; all Socket.IO server instances subscribe.
- Session Store: JWT refresh tokens and scorer session state stored with 7-day TTL.
- Rate Limiting: Sliding window counters at key `ratelimit:{user_id}` with 1-second TTL windows.

ClickHouse — Analytics OLAP (Phase 2)
- Schema: `deliveries_analytics` table (ReplacingMergeTree engine, ordered by match_id, innings_num, undo_stack_pos). Mirrors the Delivery schema with added denormalized columns: player_name, team_name, tournament_name, venue_name.
- `player_career_stats` materialized view: auto-aggregated from deliveries_analytics, grouped by player_id + format. Columns: matches, innings, runs, avg, strike_rate, hundreds, fifties, ducks, wickets, bowling_avg, economy, catches, stumpings, run_outs.
- Sync Strategy: CDC (Change Data Capture) via Debezium from TimescaleDB → Kafka → ClickHouse. In Phase 2 pre-Kafka, a cron job runs every 60 seconds to batch-insert new deliveries from PostgreSQL using the undo_stack_pos watermark.
- Retention: No deletion; all historical data retained indefinitely for career stats and records queries.

Data Retention & Compliance

Data CategoryRetention PeriodStorage TierNotesDeliveries (ball events)IndefiniteTimescaleDB → compressed chunks after 30dCore data for career stats, records, and match replay. Never deletedMatch metadataIndefiniteTimescaleDBHistorical records; searchable via archivesCommentaryIndefiniteTimescaleDBLinked to deliveries; part of match recordPlayer profiles (PII)Until deletion requestedTimescaleDBSubject to GDPR right-to-erasure (see below)User accounts (PII)Until deletion requested + 30d grace periodTimescaleDBSoft-delete with 30-day recovery windowAudit logs (corrections, undo)5 yearsTimescaleDB → S3 cold storageArchived after 5 years; retrievable on requestSession data (Redis)7-day TTLRedisAuto-expired; refresh tokens revocable on logoutLive match cache (Redis)24 hours after match completesRedisAuto-expired via TTLClickHouse analytics dataIndefiniteClickHouseDenormalized copy; re-derivable from source if neededPWA offline queue (IndexedDB)Until syncedClient-sideCleared after successful server sync or manual conflict resolution

GDPR & Privacy:
- Right to erasure: User accounts can be deleted on request. Player profiles are anonymised (name → "Anonymised Player #{id}", email/phone removed) rather than deleted, to preserve aggregate stats integrity.
- Data portability: Users can export their account data via `GET /api/users/me/export` (JSON format).
- Consent: Cookie consent for analytics tracking (Phase 2+). Scoring data is not subject to consent as it is essential to the service.
- Data processing: No personal data is sent to third-party services in Phase 1. Phase 2+ (Auth0, analytics) requires DPA with each provider.
- Backups: Daily automated backups of TimescaleDB with 30-day retention. Point-in-time recovery enabled.

5. DATA MODELS
5.1 Entity Hierarchy
Tournament → Season → Stage → Match
Match       → Innings[]    → Over[]     → Delivery[]
Delivery    → Commentary               (1:1 or 1:N rich entries)
Match       → Team × 2    → Player[]
Player      → BattingStats | BowlingStats | FieldingStats
Match       → DLSState?               (target revision history)
Match       → PowerplayWindow[]
Match       → Partnership[]
5.2 Delivery (Ball) — Central Event Schema
typescriptinterface Delivery {
  id:              string;           // UUID
  version:         number;           // monotonic version counter; incremented on correction
  match_id:        string;
  innings_num:     1 | 2 | 3 | 4;   // Tests: up to 4
  over_num:        number;           // 0-indexed
  ball_num:        number;           // 1-indexed within over; >6 = extras
  legal_ball_num:  number;           // count of legal deliveries

  bowler_id:       string;
  striker_id:      string;
  non_striker_id:  string;

  // Outcome
  runs_batsman:    number;           // 0–6 including overthrows
  runs_extras:     number;
  extra_type:      'wide' | 'noball' | 'bye' | 'legbye' | 'penalty' | null;
  total_runs:      number;           // computed: runs_batsman + runs_extras
  is_free_hit:     boolean;          // true if delivery follows a front-foot no-ball

  // Dismissal
  is_wicket:       boolean;
  wicket_type:     'bowled' | 'caught' | 'lbw' | 'run_out' | 'stumped'
                 | 'hit_wicket' | 'obstructing' | 'timed_out' | 'handled_ball' | null;
  dismissed_id:    string | null;    // may differ from striker (run out)
  fielder_ids:     string[];         // catcher, run-out thrower, etc.
  is_retired_hurt: boolean;

  // Correction & Event Sourcing
  correction_id:   string | null;    // UUID of the original delivery this corrects (null if original)
  is_superseded:   boolean;          // true if a newer correction replaces this delivery

  // Shot & Pitch Tracking (optional, for analytics)
  // Coordinates are entered manually by the scorer via a tap-on-field UI;
  // auto-population from ball-tracking hardware is a Phase 4 integration.
  shot_type:       string | null;    // cut, pull, drive, sweep, etc.
  landing_x:       number | null;    // pitch map coordinates (0–100 normalised)
  landing_y:       number | null;
  wagon_x:         number | null;    // wagon wheel endpoint (0–100 normalised)
  wagon_y:         number | null;
  pace_kmh:        number | null;
  swing_type:      string | null;

  // State snapshot (for fast reads without replay)
  innings_score:   number;           // cumulative score AFTER this ball
  innings_wickets: number;
  innings_overs:   string;           // e.g. "12.4"
  run_rate:        number;

  commentary_id:   string;
  created_at:      string;           // ISO 8601; immutable creation timestamp
  timestamp:       string;           // ISO 8601; logical match time of delivery
  undo_stack_pos:  number;           // per-innings monotonic ordering position for event replay & undo
}

// Input schema for POST /api/matches/:id/deliveries
interface DeliveryInput {
  innings_num:     1 | 2 | 3 | 4;
  bowler_id:       string;
  striker_id:      string;
  non_striker_id:  string;
  runs_batsman:    number;
  runs_extras:     number;
  extra_type:      'wide' | 'noball' | 'bye' | 'legbye' | 'penalty' | null;
  is_wicket:       boolean;
  wicket_type:     string | null;
  dismissed_id:    string | null;
  fielder_ids:     string[];
  is_retired_hurt: boolean;
  // Optional analytics fields (scorer taps on field diagram)
  shot_type:       string | null;
  landing_x:       number | null;
  landing_y:       number | null;
  wagon_x:         number | null;
  wagon_y:         number | null;
  pace_kmh:        number | null;
  swing_type:      string | null;
  // Offline sync
  client_id:       string;           // idempotency key from PWA; prevents duplicate submissions on reconnect
  client_timestamp: string;          // ISO 8601; when the scorer tapped the button (for offline ordering)
}
5.3 Match Schema (Key Fields)
typescriptinterface Match {
  id:                  string;
  format:              'test' | 'odi' | 't20' | 't10' | 'hundred' | 'firstclass' | 'lista' | 'custom';
  format_config_id:    string;        // links to format rule profile
  tenant_id:           string;        // organisation / league; used for row-level multi-tenant isolation
  team_a_id:           string;
  team_b_id:           string;
  toss_winner_id:      string | null; // null until toss is performed
  toss_decision:       'bat' | 'field' | null;
  venue:               string;
  venue_id:            string;
  weather:             string | null;
  playing_conditions:  object;        // pitch report, expected swing, etc.
  dls_active:          boolean;
  super_over_id:       string | null;
  result:              MatchResult | null;
  status:              'scheduled' | 'toss_pending' | 'live' | 'innings_break'
                     | 'rain_delay' | 'super_over' | 'completed' | 'abandoned' | 'no_result';
  scorer_count:        1 | 2;         // 1 = single scorer (default); 2 = dual scorer (conflicts resolved by primary)
  scheduled_at:        string;
  tournament_id:       string | null;
  created_at:          string;        // ISO 8601
  updated_at:          string;        // ISO 8601
}

typescriptinterface MatchResult {
  winner_id:           string | null;    // null for tie, no_result, abandoned
  result_type:         'by_runs' | 'by_wickets' | 'by_innings' | 'by_dls' | 'tie' | 'super_over'
                     | 'no_result' | 'abandoned' | 'draw';
  winning_margin:      number | null;    // e.g. 45 (runs), 6 (wickets), null for ties/NR
  winning_margin_type: 'runs' | 'wickets' | 'innings_and_runs' | null;
  player_of_match_id:  string | null;
  summary:             string;           // e.g. "India won by 6 wickets"
}

// Input schema for POST /api/matches
typescriptinterface MatchCreateInput {
  format:              'test' | 'odi' | 't20' | 't10' | 'hundred' | 'firstclass' | 'lista' | 'custom';
  format_config_id:    string | null;    // null = use default config for format
  team_a_id:           string;
  team_b_id:           string;
  venue:               string;
  venue_id:            string;
  scheduled_at:        string;           // ISO 8601
  tournament_id:       string | null;    // null = standalone match
  playing_conditions:  object | null;    // optional pitch report, weather
  scorer_count:        1 | 2;            // default: 1
}

5.4 Commentary Schema
typescriptinterface Commentary {
  id:              string;
  delivery_id:     string;
  match_id:        string;
  innings_num:     number;
  over_ball:       string;           // "14.3"
  text:            string;           // primary commentary text
  text_short:      string;           // 1-line summary for ticker
  emoji_text:      string | null;    // emoji-enhanced version
  mode:            'auto' | 'manual' | 'assisted';
  language:        string;           // ISO 639-1 code, e.g. 'en', 'hi'
  milestone:       string | null;    // 'fifty' | 'hundred' | 'five_wickets' | etc.
  drama_level:     1 | 2 | 3;       // 1=routine, 2=notable, 3=high-drama
  published_at:    string;
}
5.5 Innings Schema
typescriptinterface Innings {
  id:                string;
  match_id:          string;
  innings_num:       1 | 2 | 3 | 4;
  batting_team_id:   string;
  bowling_team_id:   string;
  status:            'pending' | 'live' | 'declared' | 'all_out' | 'target_reached' | 'completed';
  target:            number | null;       // target score (2nd+ innings); null for 1st innings
  dls_par:           number | null;       // DLS par score at current point; null if DLS inactive
  dls_revised_target: number | null;      // revised target after interruption(s)
  powerplay_state:   'pp1' | 'pp2' | 'pp3' | 'none';
  declared:          boolean;             // true if batting team declared
  follow_on:         boolean;             // true if this innings is a follow-on enforcement
  enforced_by:       string | null;       // team_id that enforced the follow-on
  total_runs:        number;
  total_wickets:     number;
  total_overs:       string;              // e.g. "45.3"
  total_extras:      number;
  extras_breakdown:  { wides: number; noballs: number; byes: number; legbyes: number; penalties: number };
  run_rate:          number;
  required_rate:     number | null;       // null for 1st innings
  created_at:        string;
  updated_at:        string;
}

5.6 Partnership Schema
typescriptinterface Partnership {
  id:                string;
  match_id:          string;
  innings_num:       number;
  batsman_1_id:      string;
  batsman_2_id:      string;
  runs:              number;
  balls:             number;
  batsman_1_runs:    number;             // individual contribution
  batsman_2_runs:    number;
  extras:            number;
  wicket_num_start:  number;             // partnership started after this wicket (0 = opening)
  wicket_num_end:    number | null;      // null = unbroken / not-out partnership
  is_unbroken:       boolean;
  start_delivery_id: string;
  end_delivery_id:   string | null;
}

5.7 Other Key Entities

PlayerCareerStats (ClickHouse): matches, innings, runs, avg, strike_rate, hundreds, fifties, ducks, wickets, bowling_avg, economy, catches, stumpings, run_outs
Tournament: format, stage_type (group/knockout/round-robin), points_rules, NRR_formula, DLS_method, tiebreaker_rules, tenant_id
PowerplayWindow: match_id, innings_num, pp_num (1/2/3), start_over, end_over, runs, wickets, type ('mandatory' | 'batting_choice' | 'fielding_choice')

5.8 Format Config Profile
typescriptinterface FormatConfig {
  id:                  string;
  name:                string;            // e.g. 'T20 International', 'Club 35-over'
  base_format:         'test' | 'odi' | 't20' | 't10' | 'hundred' | 'firstclass' | 'lista' | 'custom';
  max_overs:           number | null;     // null = unlimited (Test/First-Class)
  innings_count:       1 | 2 | 3 | 4;
  powerplay_windows:   { pp_num: number; start_over: number; end_over: number; type: string }[];
  free_hit_on_noball:  boolean;           // T20/ODI: true; Test: false
  super_over_enabled:  boolean;
  follow_on_threshold: number | null;     // e.g. 200 for Tests; null if not applicable
  dls_applicable:      boolean;
  session_schedule:    { name: string; start: string; end: string }[] | null;  // Test: Lunch/Tea/Stumps
  max_overs_per_bowler: number | null;    // e.g. 4 for T20, 10 for ODI, null for Tests
  bonus_ball_rules:    object | null;     // custom formats only
  declaration_allowed: boolean;
}

5.9 Review (DRS) Schema
typescriptinterface Review {
  id:                string;           // UUID
  match_id:          string;
  delivery_id:       string;           // the delivery under review
  innings_num:       number;
  reviewing_team_id: string;
  review_number:     number;           // nth review for this team in this innings (1-indexed)
  status:            'pending' | 'upheld' | 'overturned' | 'umpires_call';
  original_decision: {                 // snapshot of umpire's on-field decision
    is_wicket:       boolean;
    wicket_type:     string | null;
    runs_awarded:    number;
  };
  revised_decision:  {                 // populated when status != 'pending'
    is_wicket:       boolean;
    wicket_type:     string | null;
    runs_awarded:    number;
  } | null;
  wicket_reversed:   boolean;          // true if a wicket was overturned
  runs_changed:      boolean;          // true if runs were re-credited or removed
  unsuccessful:      boolean;          // true if review was unsuccessful (counts against team's review quota)
  requested_at:      string;           // ISO 8601
  resolved_at:       string | null;    // ISO 8601; null while pending
}

Review limits per innings (configurable per FormatConfig; defaults):
- International matches: 2 unsuccessful reviews per team per innings
- Domestic / Club: configurable (0 = DRS disabled)
- Reviews reset at start of each innings
- "Umpire's call" does NOT count as unsuccessful

5.10 Concurrency & Scoring Validation Rules

Scorer concurrency: Each match has a designated primary scorer. If scorer_count = 2 (dual scoring), the primary scorer's submissions take precedence on conflict. Conflicts are detected by comparing client_id and undo_stack_pos.

Offline Sync & Conflict Resolution:
When a scorer reconnects after offline entry, the PWA calls `socket.emit('sync_offline_queue', { match_id, deliveries: DeliveryInput[] })`. The server replays deliveries in client_timestamp order. For each delivery:
1. If client_id already exists in the database → skip (idempotent; already processed)
2. If undo_stack_pos matches server expectation → accept and process normally
3. If undo_stack_pos conflicts (another scorer or correction advanced the match) → reject with 409 SYNC_CONFLICT

sync_conflict WebSocket event payload:
typescriptinterface SyncConflictPayload {
  scorer_id:        string;
  conflict_type:    'stack_position_mismatch' | 'innings_completed' | 'match_ended';
  server_state: {
    current_undo_stack_pos: number;    // server's current position
    innings_status:         string;    // current innings status
    innings_score:          number;    // current score
    innings_wickets:        number;    // current wickets
    innings_overs:          string;    // current overs (e.g. "14.3")
    last_delivery_id:       string;    // UUID of last accepted delivery
  };
  rejected_deliveries: DeliveryInput[];  // the deliveries that could not be applied
}

PWA retry strategy:
1. On receiving sync_conflict, display the conflict to the scorer with server state vs. offline state side-by-side
2. Scorer can choose: (a) discard offline deliveries and accept server state, or (b) re-submit individual deliveries manually after reviewing
3. No automatic retry — human decision required because ball-by-ball cricket data is authoritative and cannot be silently merged
4. After resolution, PWA clears the IndexedDB offline queue and resumes live mode
Validation rules enforced server-side:
- Over limit: Cannot exceed max_overs from FormatConfig
- Bowler over limit: Cannot exceed max_overs_per_bowler from FormatConfig
- Legal balls per over: Exactly 6 legal deliveries per over (extras do not count)
- Batting order: Cannot have more than 2 batsmen at the crease; new batsman required after wicket
- Innings progression: Cannot start next innings until current is completed/declared
- Free hit: After a front-foot no-ball in formats where free_hit_on_noball = true, next legal delivery is auto-flagged is_free_hit = true; dismissals limited to run-out only


6. API REFERENCE

All endpoints require Authorization: Bearer <JWT> header (see section 6.5 for auth spec).
Pagination: list endpoints accept ?limit=<n>&cursor=<id> (cursor-based, default limit=50, max 200).
Rate limiting: 100 req/s per authenticated user; 20 req/s for unauthenticated (read-only) endpoints.

6.1 REST Endpoints
# Match Management
GET    /api/matches/:id                    — full match state snapshot
GET    /api/matches/:id/state              — partial state (?fields=scorecard,innings,current_over — selective load for mobile)
POST   /api/matches                        — create match (body: MatchCreateInput)
PATCH  /api/matches/:id                    — update match state (status, weather, etc.)
POST   /api/matches/:id/toss              — record toss result (body: { winner_id, decision: 'bat'|'field' })
POST   /api/matches/:id/super-over        — initiate super over (body: { team_a_batsmen, team_b_batsmen, bowlers })
POST   /api/matches/:id/interruption      — record rain/bad-light interruption (body: { reason, timestamp }); triggers DLS recalc
POST   /api/matches/:id/resume            — resume match after interruption (body: { timestamp, revised_overs? })

# Scoring
POST   /api/matches/:id/deliveries         — submit ball (body: DeliveryInput); returns 409 on sync conflict
PATCH  /api/matches/:id/deliveries/:ballId — correct a past delivery (creates correction record, original preserved)
DELETE /api/matches/:id/deliveries/last    — undo last ball
DELETE /api/matches/:id/deliveries/batch   — undo multiple balls (?from_stack_pos=<n> — undoes all deliveries from position n onward)

# Innings Management
GET    /api/matches/:id/innings/:num       — innings summary
GET    /api/matches/:id/innings/:num/overs — over-by-over breakdown
POST   /api/matches/:id/innings/:num/declare — declare innings (Test/First-Class only; validates format allows declarations)
POST   /api/matches/:id/innings/:num/follow-on — enforce follow-on (validates deficit meets threshold from FormatConfig)

# Scorecard & Commentary
GET    /api/matches/:id/scorecard          — formatted batting/bowling scorecard
GET    /api/matches/:id/commentary         — commentary feed (paginated: ?limit=&cursor=&lang=&mode=auto|manual|all)
GET    /api/matches/:id/commentary/:ballId — single ball commentary
PATCH  /api/matches/:id/commentary/:id     — manually edit commentary (allowed until next ball is submitted)

# Substitutions & Reviews
POST   /api/matches/:id/substitutions      — register substitution (body: { type: 'concussion'|'impact'|'tactical', player_out_id, player_in_id })
POST   /api/matches/:id/reviews            — mark DRS review (body: { delivery_id, reviewing_team_id })
PATCH  /api/matches/:id/reviews/:id        — update DRS outcome (body: { decision: 'upheld'|'overturned'|'umpires_call', wicket_reversed?, runs_changed? })

# DLS & Predictions
GET    /api/matches/:id/dls                — current DLS state: { par_score, revised_target, resources_remaining_pct, interruptions: [...], g50_resource_table_version }
GET    /api/matches/:id/predictions        — win probability + score projection

# Authentication (see section 6.4 for full spec)
POST   /api/auth/register                  — register new user (body: { email, password, name })
POST   /api/auth/login                     — login (body: { email, password }) → { access_token, refresh_token, expires_in }
POST   /api/auth/refresh                   — refresh access token (body: { refresh_token }) → { access_token, refresh_token }
POST   /api/auth/logout                    — revoke refresh token (body: { refresh_token })
POST   /api/auth/forgot-password           — request password reset email (body: { email })
POST   /api/auth/reset-password            — reset password (body: { token, new_password })
GET    /api/auth/.well-known/jwks.json     — public keys for JWT verification (JWKS format)

# Format Config
GET    /api/formats                        — list all format config profiles
GET    /api/formats/:id                    — single format config profile (FormatConfig schema)
POST   /api/formats                        — create custom format config (inherits from base_format)
PATCH  /api/formats/:id                    — update custom format config

# Users (GDPR)
GET    /api/users/me/export                — export user's personal data (JSON; GDPR data portability)
DELETE /api/users/me                       — request account deletion (soft-delete with 30-day grace period)

# Players
GET    /api/players/:id                    — player profile
GET    /api/players/:id/stats              — career stats (query: ?format=t20&season=2025)
GET    /api/players/:id/innings            — innings history (paginated)

# Tournaments
GET    /api/tournaments/:id/table          — points table with NRR
GET    /api/tournaments/:id/fixtures       — fixture list
GET    /api/tournaments/:id/stats/batting  — top run scorers
GET    /api/tournaments/:id/stats/bowling  — top wicket takers

# Analytics
GET    /api/analytics/matches/:id/wagon-wheel?innings=1&player_id=...&phase=powerplay|middle|death
GET    /api/analytics/matches/:id/worm-chart?innings=1,2 (overlays both innings; par line included if DLS active)
GET    /api/analytics/matches/:id/manhattan
GET    /api/analytics/matches/:id/pitch-map?bowler_id=...&over_range=1-6
GET    /api/analytics/matches/:id/partnerships
GET    /api/analytics/players/:id/head-to-head?vs_player_id=...
GET    /api/analytics/players/:id/phase-stats?phase=powerplay
6.2 WebSocket Events
// Client subscribes to a match room
socket.emit('join_match', { match_id: 'uuid' });

// Server → Client events
match:{id}:delivery          → { delivery, scorecard_snapshot, commentary }
match:{id}:wicket            → { delivery, wicket_detail, commentary, partnership_ended }
match:{id}:over              → { over_summary, bowler_stats, run_rate }
match:{id}:milestone         → { type: 'fifty'|'hundred'|'five_wickets'|..., player, text }
match:{id}:prediction        → { win_prob_a, win_prob_b, projected_score_low, projected_score_high, model_version }
match:{id}:dls_update        → { par_score, revised_target, resources_remaining, interruption_count }
match:{id}:status            → { status, reason }  // rain delay, innings break, etc.
match:{id}:ball_corrected    → { original_delivery, corrected_delivery, scorecard_snapshot }  // fired when scorer corrects a past ball
match:{id}:undo              → { undone_delivery, scorecard_snapshot }  // fired when scorer undoes last ball
match:{id}:resumed           → { status: 'live', dls_state?, revised_overs?, timestamp }  // after rain/bad-light resumption
match:{id}:commentary        → { commentary, delivery_id }  // real-time commentary broadcast (separate from delivery event for late/manual edits)
match:{id}:review            → { delivery_id, reviewing_team, status: 'pending'|'upheld'|'overturned'|'umpires_call' }
match:{id}:substitution      → { type, player_out, player_in, team_id }
match:{id}:declaration       → { innings_num, team_id, total_runs, total_wickets, total_overs }
match:{id}:sync_conflict     → { scorer_id, conflict_type, server_state }  // sent to reconnecting scorer when offline queue conflicts

// Client → Server (scorer only, authenticated via JWT)
socket.emit('submit_delivery', DeliveryInput);
socket.emit('undo_last_ball', { match_id });
socket.emit('sync_offline_queue', { match_id, deliveries: DeliveryInput[] });  // bulk replay from PWA offline queue
6.3 GraphQL (Analytics Queries)
graphqlquery PlayerMatchup($batsman: ID!, $bowler: ID!, $format: Format) {
  headToHead(batsmanId: $batsman, bowlerId: $bowler, format: $format) {
    balls, runs, dismissals, dotBallPct, boundaryPct, avgRunsPerBall
  }
}

query TournamentTopStats($tournamentId: ID!) {
  topBatsmen(tournamentId: $tournamentId, limit: 10) {
    player { name, country } runs avg strikeRate hundreds fifties
  }
  topBowlers(tournamentId: $tournamentId, limit: 10) {
    player { name, country } wickets economy avg bestFigures
  }
}

query PhaseAnalysis($matchId: ID!, $phase: Phase!) {
  phaseStats(matchId: $matchId, phase: $phase) {
    runs, wickets, runRate, dotBallPct, boundaryCount, extras
  }
}

6.4 Authentication & Authorization

JWT Structure:
typescriptinterface JWTPayload {
  sub:         string;         // user ID
  email:       string;
  roles:       string[];       // e.g. ['scorer', 'analyst']
  tenant_id:   string;         // organisation / league scope
  permissions: string[];       // e.g. ['match:score', 'match:read', 'analytics:read']
  iat:         number;
  exp:         number;         // 1-hour access token; 7-day refresh token
}

Phase 1 — Self-Issued JWT:
- Signing: RS256 asymmetric key pair (2048-bit minimum). Public key served at `GET /api/auth/.well-known/jwks.json` for future OIDC compatibility.
- Key rotation: Generate new key pair every 90 days. Old keys remain valid for verification (listed in JWKS) until all tokens signed with them expire. Rotation is a manual ops task in Phase 1; automated via Keycloak in Phase 2.
- Access token TTL: 1 hour. Refresh token TTL: 7 days (stored in Redis, revocable).
- Password hashing: bcrypt with cost factor 12. Minimum password length: 8 characters.
- Registration: email + password only. Email verification via one-time link (24-hour expiry).
- Login: `POST /api/auth/login` → returns { access_token, refresh_token, expires_in }.
- Token refresh: `POST /api/auth/refresh` → accepts { refresh_token } → returns new { access_token, refresh_token }. Old refresh token is invalidated (rotation).
- Logout: `POST /api/auth/logout` → revokes refresh token in Redis.
- Password reset: `POST /api/auth/forgot-password` → sends reset email. `POST /api/auth/reset-password` → accepts { token, new_password }.

Phase 2 — Auth0/Keycloak OIDC:
- OIDC discovery at `/.well-known/openid-configuration`.
- Social login: Google, Apple. Additional providers configurable per tenant.
- JWT validation via external JWKS endpoint (replaces self-issued keys).
- Multi-tenant realm isolation in Keycloak.

Per-Endpoint Permission Matrix:
EndpointRequired PermissionNotesGET /api/matches/:idmatch:readPublic (no auth required for live matches)POST /api/matches/:id/deliveriesmatch:scoreScorer onlyPATCH /api/matches/:id/deliveries/:ballIdmatch:scoreScorer only; same match assignmentDELETE /api/matches/:id/deliveries/lastmatch:scoreScorer onlyPOST /api/matches/:id/tossmatch:adminTournament Admin or Super AdminPOST /api/matchesmatch:createTournament Admin or Super AdminPATCH /api/matches/:idmatch:adminTournament Admin or Super AdminGET /api/analytics/*analytics:readAnalyst, Coach, or higher rolesGET /api/players/:id/statsmatch:readPublic readPOST /api/formatsmatch:adminSuper Admin onlyPOST /api/matches/:id/substitutionsmatch:scoreScorer or Team ManagerPOST /api/matches/:id/reviewsmatch:scoreScorer only

WebSocket Authentication: Clients must pass JWT as a query parameter on connection (`io(url, { auth: { token } })`). Server validates JWT on `connection` event. Invalid/expired tokens receive `auth_error` event and are disconnected. Scorer-only emit events (`submit_delivery`, `undo_last_ball`) validate `match:score` permission and match assignment.

GraphQL Authentication: All GraphQL queries require valid JWT in Authorization header. Field-level authorization enforced via Apollo Shield directives (e.g., `@auth(requires: ANALYST)` on coach-only fields).

Rate Limiting:
- Authenticated users: 100 requests/second (sliding window, tracked in Redis)
- Unauthenticated (read-only): 20 requests/second
- Scorer WebSocket submits: 10 deliveries/second (prevents accidental rapid-fire)
- GraphQL: query depth limit of 10, query complexity limit of 1000

6.5 Error Response Format
typescriptinterface APIError {
  error: {
    code:    string;       // e.g. 'VALIDATION_ERROR', 'SYNC_CONFLICT', 'UNAUTHORIZED'
    message: string;       // human-readable
    details: object | null; // field-level errors or conflict state
  };
  status: number;          // HTTP status code
}

Key error codes:
- 400 VALIDATION_ERROR: Invalid delivery input (e.g., 8th ball in over, bowler over limit exceeded)
- 401 UNAUTHORIZED: Missing or invalid JWT
- 403 FORBIDDEN: Valid JWT but insufficient permissions
- 404 NOT_FOUND: Match/player/tournament not found
- 409 SYNC_CONFLICT: Offline delivery queue conflicts with server state (includes current server state for resolution)
- 422 FORMAT_RULE_VIOLATION: Action violates format config rules (e.g., declaration in T20)
- 429 RATE_LIMITED: Too many requests

7. FEATURE SPECIFICATIONS
7.1 Scoring Features

Ball Entry: 1-tap for 0–6 runs; dedicated W (wicket) button; extras row (Wide, No-Ball, Bye, Leg-Bye, Penalty)
Wicket Modal: On W tap → select dismissal type → select fielder(s) → confirm dismissed batsman (for run outs)
Extras Combos: Wide + 4 runs; No-Ball + runs scored; Bye + runs (not credited to batsman)
Free Hit: After a front-foot no-ball (in formats where free_hit_on_noball = true in FormatConfig), the next legal delivery is auto-flagged as a free hit. UI shows a prominent "FREE HIT" indicator. During a free hit, only run-out dismissals are valid; all other wicket types are blocked by validation. The free hit carries over if the free-hit delivery itself is a no-ball.
Undo Stack: Full event-source stack (per-innings scope); undo reverses last ball completely including scorecard state. Batch undo available for correcting multiple balls.
Correction: Any past ball in current innings can be corrected with full audit log. Original delivery is marked is_superseded = true; new delivery links via correction_id. Correction fires match:{id}:ball_corrected WebSocket event.
Over Management: Auto-prompt for new bowler at over end; mandatory end-over validation (6 legal balls). Server validates bowler has not exceeded max_overs_per_bowler from FormatConfig.
Innings Break: Target announcement; DLS check if rain interrupted
Innings Declaration: Test/First-Class only (validated against FormatConfig.declaration_allowed). Batting captain declares via UI button; fires match:{id}:declaration WebSocket event.
Follow-On: After first innings, if deficit meets FormatConfig.follow_on_threshold, fielding captain is prompted with follow-on option.
DRS / Review: Mark ball under review; tracks review count per innings (max 2 unsuccessful reviews per team in internationals, configurable per format). Can reverse wicket decision or re-credit runs. Fires match:{id}:review WebSocket event.
Substitutions: Concussion sub, impact player, X-Factor — format-aware rule application. All substitutions recorded with type and timestamp; fire match:{id}:substitution WebSocket event.
Interruptions: Rain/bad light pause with timestamp; DLS recalculation trigger. Fires match:{id}:status event on pause and match:{id}:resumed on resumption.

7.2 Commentary Engine
Pipeline: Delivery Event → Context Builder → Template Selector → NLG Engine → Milestone Detector → Commentary Record → WebSocket Broadcast
Context Builder enriches with: match state (score, wickets, overs), batsman stats (SR, avg, recent form), bowler stats (economy, wickets in match), partnership info, required runs/rate, venue history.

Template Storage & Format:
Phase 1 (code-based): Templates are TypeScript string-template functions in `packages/commentary/templates/`. Each template is a function that receives a CommentaryContext object and returns { text, text_short, emoji_text }. Templates are organized by category in separate files.
Phase 3 (database-driven): Templates migrate to a `commentary_templates` database table for multi-language support without redeployment. Schema: { id, category, language, template_text, template_short, template_emoji, variables: string[], drama_level, weight }.

Template categories and minimum counts (Phase 1):

Normal delivery (dot ball): 8 variants (pitch, shot played, fielding position)
Normal delivery (1 run): 6 variants
Normal delivery (2 runs): 5 variants
Normal delivery (3 runs): 4 variants
Boundary (4): 8 variants (by shot type: drive, cut, pull, sweep, edge, etc.)
Boundary (6): 8 variants (by shot type: loft, slog, upper-cut, etc.)
Wicket — bowled: 4 variants
Wicket — caught: 6 variants (caught at slip, gully, mid-off, boundary, keeper, etc.)
Wicket — LBW: 4 variants
Wicket — run out: 4 variants (direct hit, fielder throw, backing up)
Wicket — stumped: 3 variants
Wicket — other (hit wicket, obstructing, timed out, handled ball): 1 variant each
Extras — wide: 4 variants (down leg, outside off, bouncer, full toss)
Extras — no-ball: 4 variants (overstepping, height, bouncer)
Extras — bye/leg-bye: 3 variants each
Milestones — fifty: 4 variants
Milestones — hundred: 4 variants
Milestones — five-wicket haul: 3 variants
Milestones — hat-trick ball: 2 variants
Milestones — last-ball drama: 3 variants
Match situations — DLS par: 2 variants
Match situations — last over chase: 3 variants
Match situations — required rate critical: 3 variants
Match situations — match won: 4 variants (by runs, by wickets, by DLS, tie + super over)
TOTAL: ~100 minimum templates for Phase 1 English coverage

emoji_text generation: Each template function returns an emoji_text field alongside text and text_short. The emoji_text is a condensed 3–8 emoji sequence representing the delivery outcome (e.g., "🏏💥6️⃣🎉" for a six, "🏏❌🏠" for bowled). emoji_text is stored in the Commentary record's emoji_text field (section 5.4) and served via the ?mode=emoji query filter on the commentary endpoint.

Modes:

auto: fully generated from templates, published immediately via match:{id}:commentary WebSocket event
assisted: generated as draft; scorer can edit until the next ball is submitted (not clock-based — avoids connectivity-dependent race conditions). Both auto-generated and scorer-edited versions stored; edited version is published.
manual: scorer writes from scratch; auto commentary stored as secondary record (mode='auto') for analytics/comparison
emoji: condensed emoji stream for mobile overlays (uses emoji_text field from Commentary schema)
rich: inline stats embedded in commentary text (e.g., "Kohli drives for 4, moves to 67*(42), SR 159.52")

7.3 Analytics Visualizations
ChartData SourceUpdate FrequencyCalculation NotesWorm ChartCumulative runs per over vs. par/targetEvery deliveryPar line: 2nd innings uses DLS par if active, else first-innings total. Tests: par = 1st innings total. Both innings overlaid when availableRun Rate GraphCRR + RRR over timeEvery overCRR = total_runs / overs_bowled; RRR = (target - total_runs) / overs_remainingWagon WheelShot direction radial mapEvery boundary/shot with coordsCoordinates from manual scorer tap on field diagram (wagon_x, wagon_y, normalised 0–100). Filterable by phase (powerplay/middle/death)Pitch MapBall landing position heat mapEvery delivery with coordsCoordinates from manual scorer tap on pitch diagram (landing_x, landing_y, normalised 0–100). Filterable by bowler and over rangPartnership BarStacked runs per wicket partnershipOn wicketShows individual contributions per batsman; unbroken partnerships shown with dashed borderManhattanRuns per over bar chart (both innings overlaid)End of overColour-coded: boundaries vs. singles vs. extras per overPowerplay BreakdownRuns/wickets/RR within each PP windowOn PP boundaryPer-powerplay totals from PowerplayWindow entityDot Ball %Real-time pressure metric per bowlerEvery deliveryDot balls / total legal deliveries per bowlerPhase StatsPP / Middle / Death overs comparisonPer phase boundaryPP = overs 1-6 (configurable per format), Middle = 7-15, Death = 16-20 (T20 defaults)Head-to-Head GridBatsman vs. bowler historical matchupStatic / on demandQueried from ClickHouse player_career_stats; requires historical data
7.4 Prediction Features

Phase 2 (heuristic — no ML dependency):
Win Probability (Heuristic): DLS-resource-based probability model. Uses remaining resources (overs × wickets) vs. target to compute win %. No training data required. Ships in Phase 2 alongside DLS calculator.
DLS: Full G50 resource table implementation; revised target on multiple interruptions. Supports up to 5 interruptions per innings with cumulative resource recalculation.
Key Moment Alerts: Heuristic event detection — sends push alert on decisive phases (e.g., required rate > 12, last over with >10 needed, hat-trick ball).

Phase 3 (ML-powered — requires training data):
Win Probability (ML): XGBoost model; inputs: runs scored, wickets, overs, target, venue avg, team form, head-to-head; output: % per team with 90% CI. Training data: requires 500+ completed matches (imported historical datasets or accumulated from Phase 1-2 usage). Model version metadata included in prediction events.
Score Projection: Time-series regression; output: low / mid / high range (e.g., "158–172")
Player Forecast: Ridge regression on recent form + bowler/batsman matchup
Next-Over Prediction: Markov chain on bowler's historical run distribution vs. current batsman. Requires sufficient bowler-batsman encounter data; ships as "beta" indicator until confidence threshold met. Fallback: format-average run distribution when insufficient data.

7.5 Tournament Features

Create groups, round-robin, single/double knockout stages
Auto points table computation (win/loss/tie/NR points)
NRR formula: (runs scored / overs faced) − (runs conceded / overs bowled)
Tiebreaker rules: NRR → head-to-head → lots
Fixture generator (round-robin schedule algorithm)
Qualification tracking across stages
DLS method selection per tournament
Export: tournament PDF report, CSV points table


8. DASHBOARD DEFINITIONS
DashboardPrimary AudienceKey WidgetsLive Match CentreFansScoreboard hero, ball-by-ball commentary feed, worm chart, win probability bar, current over tiles, milestone tickerScorecard ViewAllTraditional batting/bowling tables, FOW, extras breakdown, over summary gridPlayer ProfileFans, AnalystsCareer stats, form chart, head-to-head records, wagon wheel, recent innings listTournament HubFans, AdminsPoints table, NRR, upcoming fixtures, top scorers/wicket-takers, knockout bracketCoach AnalyticsCoaches, AnalystsOpposition weakness map, bowler-batsman matchup grid, phase-wise economy, fielding heat mapScorer Control PanelScorerActive scoring UI, undo log, match state panel, sync status indicator, commentary editorBroadcaster FeedBroadcastersRaw event stream, overlay-ready data panels, API key management, commentary approval queueHistorical RecordsFans, AnalystsAll-time records, season leaderboards, venue records, head-to-head archives, match search

9. USER ROLES & PERMISSIONS
RolePermissionsSuper AdminFull platform management, tenant creation, global analyticsTournament AdminCreate/manage tournaments, approve scorers, publish resultsScorerBall-by-ball entry, corrections within match, commentary editingTeam ManagerManage squad, substitutions, declare playing XIAnalystFull analytics suite access, data export, report creationSpectatorRead-only: live scores, analytics, commentaryBroadcasterRead-only + event feed API access

10. MOBILE-FIRST DESIGN SYSTEM
Breakpoints
NameWidthLayoutMobile S< 360pxSingle column; simplified scoring padMobile L360–767pxSingle column; tabbed (Score / Card / Stats / Commentary)Tablet768–1023pxTwo-column: score + commentary; bottom sheet for scorecardDesktop1024–1279pxThree-panel: scoreWide≥ 1280pxFull dashboard with widgets; multi-match view
PWA Capabilities

Installable (Add to Home Screen, iOS + Android)
Background Sync (offline balls auto-sync on reconnect)
Web Push Notifications (wickets, milestones, match alerts)
Web Share API (native share for scorecards and stats)
IndexedDB (offline delivery queue, local scorecard cache)
Haptic feedback on wicket entry and boundary confirmation

Design Tokens

Primary green: #1A7C3E
Accent gold: #C8991A (milestones, highlights)
Alert red: #B22222 (wickets, danger)
Neutral blue: #1A4D7C (analytics, info)
Font stack: "SF Pro" (iOS), "Roboto" (Android), "Segoe UI" (Windows), Arial fallback
Min tap target: 44×44px
Accessibility: WCAG 2.1 AA; pattern fills as colorblind fallback on all charts


11. PERFORMANCE & RELIABILITY TARGETS
MetricTargetBall-to-publish latency< 500ms end-to-endScorecard load time< 800ms on 3GFirst Contentful Paint (mobile)< 1.5s on 3GConcurrent fans per match100,000 (horizontal scaling)Uptime SLA99.9%Offline scoring supportFull (no connectivity required)Analytics query response< 200ms (ClickHouse OLAP)ML prediction refreshEvery 3 balls (live match)

12. DEVELOPMENT ROADMAP

Architecture Note: Phase 1 is built as a modular monolith (all services in one Fastify process, separated by module boundaries). Microservice extraction begins in Phase 2 (Analytics Service → ClickHouse) and continues through Phase 4. The module boundaries in Phase 1 must mirror the future service boundaries defined in section 3.

Phase 1 — MVP Core Scoring (Weeks 1–12)
Core formats only (Test, ODI, T20); remaining formats (T10, Hundred, First-Class, List-A, Custom) deferred to Phase 1.5.
Match setup and format config system, ball-by-ball scoring (mobile-first PWA), live scorecard via WebSocket, traditional scorecard view, auto text commentary (English, code-based templates — ~100 templates across all categories; see section 7.2 for breakdown), extras handling (wide, no-ball, bye, leg-bye, penalty), free-hit tracking, wicket modal with all dismissal types, undo/correction workflow with event sourcing, toss recording, innings declaration (Test), follow-on enforcement, DRS review recording, basic substitutions (like-for-like), partnership tracking.
Auth: JWT-based auth with role system (Super Admin, Scorer, Spectator). Auth0/Keycloak OIDC integration deferred to Phase 2.
PWA offline mode with IndexedDB queue and conflict resolution on reconnect.
Basic player and team profiles.
Server-side validation rules (over limits, bowler limits, legal balls per over).
Phase 1.5 — Extended Formats (Weeks 13–15)
T10, The Hundred (10-ball over sequences, batting pairs), First-Class (day/session tracking, bonus points), List-A (configurable powerplays), Custom format builder (inherits base template, override individual rules).
Concussion substitution, impact player, X-Factor — format-aware rule application.
Phase 2 — Analytics & Tournaments (Weeks 16–26)
Worm chart (cumulative runs vs. par/target; for Tests, par = first-innings total), Manhattan, wagon wheel, pitch map, partnership analysis.
Career stats aggregation: ClickHouse setup with CDC sync from TimescaleDB (cron-based initially; upgraded to Kafka in Phase 4).
Tournament manager (groups/knockout), points table and NRR calculator, fixture generator.
Push notifications (wickets, milestones, match alerts).
PDF scorecard export.
DLS par score calculator (full G50 resource table implementation, multi-interruption support).
Auth0/Keycloak OIDC integration, social login.
GraphQL API for analytics queries (Apollo Server).
Phase 3 — Predictions & Advanced Analytics (Weeks 27–36)
Win probability — heuristic (Weeks 27–29): DLS-resource-based probability model; no ML dependency, no training data required. Ships early in Phase 3.
Win probability — ML (Weeks 30–33): XGBoost model (requires 500+ completed matches of training data from Phase 1–2 usage or imported historical datasets). Runs alongside heuristic model; ML result shown when confidence > 70%, heuristic used as fallback.
Score projection engine (time-series regression).
Player performance forecast (ridge regression on recent form).
Head-to-head matchup analytics, phase-wise stats.
Coach analytics dashboard, shot zone and weak area detection.
Multi-language commentary: migrate from code-based templates (Phase 1) to database-driven `commentary_templates` table. Add Hindi, Tamil, Bengali, Urdu as first expansion languages.
Social share graphic cards, broadcaster API and feed.
Next-over prediction (Markov chain — requires sufficient bowler-batsman data; ships as "beta" indicator until 200+ bowler-batsman encounters recorded. Fallback: format-average run distribution).
Phase 4 — Scale, Ecosystem & Monetisation (Weeks 37–50)
Multi-tenant / white-label platform (tenant_id enforcement across all entities).
Microservice extraction (Scoring, Commentary, Analytics, Prediction as independent services).
Kubernetes deployment (EKS/GKE) + Terraform.
Apache Kafka event bus (replaces cron-based ClickHouse sync).
Native iOS and Android app shell, lock-screen and home-screen widgets.
Tournament admin marketplace, fantasy integration API.
Video highlight tagging, historical records and archives.
Subscription/freemium tier system.
Offline-first club scoring app (standalone mode).
AI narrative commentary mode (LLM-powered).
Ball-tracking hardware integration for auto-populating wagon_x/y and landing_x/y coordinates.

13. AGENT OPERATING INSTRUCTIONS
When working on this project, an agent MUST:

Refer to section 5 (Data Models) before writing any database schema, query, or migration. Pay special attention to DeliveryInput vs Delivery distinction.
Refer to section 6 (API Reference) before adding or modifying any endpoint or WebSocket event. Respect the permission matrix in section 6.4.
Refer to section 5.8 (FormatConfig) before implementing any format-specific logic. Never hardcode format rules — always read from FormatConfig.
Refer to section 5.10 (Validation Rules) before implementing delivery submission logic. All validation rules listed there must be enforced server-side.
Preserve event sourcing integrity — Delivery records are immutable. Corrections create override records (correction_id link, is_superseded flag); they never mutate the original event.
Use the Commentary pipeline — auto commentary must pass through Context Builder → Template Selector → NLG Engine → Milestone Detector before storage.
Follow mobile-first design tokens — use defined colour tokens, breakpoints, and tap target minimums.
Use ClickHouse for analytics/aggregate queries, NOT PostgreSQL (Phase 2+). In Phase 1, use TimescaleDB continuous aggregates as a stopgap.
Use Redis for all live score cache reads — never query PostgreSQL for the current match state on the hot path. Respect the TTL and invalidation strategy defined in section 4.1.
DLS calculations must use the official G50 resource table — never approximate. Support multi-interruption scenarios.
Never break the Delivery schema — the undo_stack_pos, legal_ball_num, version, and correction_id fields are critical for scoring integrity.
Include client_id in all DeliveryInput submissions for idempotency. Handle 409 SYNC_CONFLICT responses gracefully in the PWA.
Include tenant_id on all new entities for multi-tenant isolation readiness.
Use the error response format defined in section 6.5 for all API errors.
Phase 1 is a modular monolith — keep module boundaries clean so services can be extracted in Phase 4.