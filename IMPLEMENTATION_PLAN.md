# CricScore — Master Implementation Plan

> **Version**: 1.0 (Draft for Review)
> **Date**: 2026-04-05
> **Status**: Awaiting Review

---

## Table of Contents

1. [Vision](#vision)
2. [Research Summary](#research-summary)
3. [Decision Log](#decision-log)
4. [Phase 1 Status](#phase-1-status)
5. [Phase 2: Social Foundation + Mobile](#phase-2-social-foundation--mobile)
6. [Phase 3: Team Ops & Chat](#phase-3-team-ops--chat)
7. [Phase 4: Stats, Predictions & Trending](#phase-4-stats-predictions--trending)
8. [Phase 5: Fantasy & Gamification](#phase-5-fantasy--gamification)
9. [Phase 6: Scale & Monetize](#phase-6-scale--monetize)
10. [Architecture Overview](#architecture-overview)
11. [File Structure](#file-structure)
12. [New Database Schema](#new-database-schema)
13. [API Routes Map](#api-routes-map)
14. [Tech Stack Additions](#tech-stack-additions)
15. [Open Questions](#open-questions)

---

## Vision

**CricScore** is a social cricket platform that bridges casual/gully cricket to organized leagues. Think **"Strava for Cricket"** — if it's not on CricScore, it didn't happen.

The platform serves:
- **Gully cricket players** — tape-ball, tennis ball matches with friends
- **Club/league cricketers** — organized fixtures with proper stats
- **Fantasy enthusiasts** — fantasy leagues for both local and international matches (IPL, ICC, BBL, SA20, CPL, PSL)
- **Cricket fans** — follow trending players, teams, and leagues worldwide

### The Big Opportunity

No platform bridges casual/gully cricket to organized leagues with a social layer. CricHeroes (40M users) dominates scoring but has weak social features and no player marketplace. The WhatsApp+Sheets+Calendar stack that 90% of amateur cricket teams use is begging to be replaced.

### Key Competitive Gaps We Can Own

1. **Unified player identity** — portable career profile across gully, club, league, tournament cricket
2. **Ball type & cricket type classification** — tape-ball, light tennis ball, hard tennis ball, leather ball
3. **Strava-style social** — match feed, kudos, shareable scorecards, local leaderboards
4. **Predictive engine** — live win probability, player matchup insights
5. **Fantasy for all levels** — fantasy on local matches AND international tournaments
6. **Trending discovery** — trending players, teams, leagues by city/country/global
7. **Offline-first** — critical for rural areas with poor connectivity

---

## Research Summary

### Competitor Analysis

| App | Users | Strengths | Weaknesses |
|-----|-------|-----------|------------|
| **CricHeroes** | 40M+ | Polished analytics, tournament management, AI highlights | Weak social, phone-only registration, aggressive ads, no marketplace |
| **CricClubs** | Unknown | Free league management, strong in US organized cricket | Complex onboarding, frequent crashes, poor error correction |
| **PlayCricket/MyCricket** | Official | Trusted by governing bodies (ECB, Cricket Australia) | Walled garden, no casual cricket support |
| **CricketStatz** | Niche | 230+ statistical reports, multi-source import | No mobile app, no real-time scoring, no social |

### Social Sports App Patterns (What Works)

- **Strava**: Activity feed with "kudos" (14B+ given), Clubs (1M+), shareable 3D replays, segment leaderboards
- **GameChanger**: Team messaging, scheduling, auto-generated highlight reels, career profiles
- **Hudl**: Integrated chat + performance analysis in one platform drives retention

### Amateur Cricket Pain Points

- Fragmented tools (WhatsApp + Google Calendar + spreadsheets)
- Late availability confirmations before matches
- No way to find substitute players when someone drops out
- Casual match scores go unrecorded — no persistent career record
- WhatsApp group overload (6,600+ cricket groups indexed)

### Predictive Scoring Technology

- **Win probability**: XGBoost/LightGBM outperform logistic regression by 2-5%; key features are wickets in hand, required rate, pitch conditions
- **Player prediction**: 60-65% directional accuracy for above/below median performance
- **Ball-by-ball**: 45-55% accuracy for outcome classification (dot, 1, 2, 4, 6, wicket)
- **Training data**: Cricsheet provides 500K+ open ball-by-ball deliveries
- **Inference**: ONNX Runtime for sub-50ms latency; Redis for state caching

---

## Decision Log

| # | Decision | Choice | Rationale |
|---|----------|--------|-----------|
| 1 | Phase order | Phase 2 (social) first | Foundation everything else builds on |
| 2 | Target audience | Both gully + organized equally | Ball type selection (tape, tennis, leather) differentiates play levels |
| 3 | Platform | Mobile-first (Expo/React Native) + web with feature parity | Portability and ease of use; Expo shares 90%+ code with web |
| 4 | Chat approach | Custom Socket.IO (free) | Cost-efficient, leverage existing infra, ready for future swap |
| 5 | ML engine | Python sidecar (FastAPI + ONNX) | Full ML ecosystem; train in Python, serve via ONNX |
| 6 | Graph database | PostgreSQL junction tables now | Avoid premature complexity; optimize later if needed |
| 7 | Monetization | Freemium — basic scoring free, premium later | Growth-first approach |
| 8 | Match data visibility | Public by default (toggle to private) | Powers trending, leaderboards, virality |
| 9 | Player marketplace | Later feature | Start with trending players/teams/leagues first |
| 10 | Fantasy | Yes — local matches + international (IPL, ICC, BBL, SA20, CPL, PSL) | Major engagement driver |

---

## Phase 1 Status

**Status: COMPLETE** (as of 2026-04-05)

All Phase 1 features implemented and verified with 85/85 E2E tests passing:

- Ball-by-ball scoring engine (immutable event sourcing)
- Free-hit detection and enforcement
- Bowler overs limit validation
- Partnership tracking
- All delivery types (dot, runs, fours, sixes, wides, no-balls, byes, leg byes)
- Wicket handling (bowled, caught, LBW, run out, stumped, hit wicket)
- Undo (marks as overridden, never deletes)
- Batch undo
- Sync conflict detection (409 with server state)
- Scorecard with player names, team names, fall of wickets
- Commentary engine (auto-generated, 8 categories)
- JWT auth (register, login, refresh, logout)
- Team & player CRUD
- Format config management (T20, ODI, Test, T10, Hundred, custom)
- Match lifecycle (create → toss → start → live → interruption → resume)
- DRS review system (create, update outcome, overturn)
- Substitutions (tactical, concussion, impact)
- Super over initiation
- Follow-on enforcement endpoint
- Partial match state endpoint
- GDPR data export & account deletion
- Real-time WebSocket broadcasting (delivery, wicket, over, status events)

---

## Phase 2: Social Foundation + Mobile (6-8 weeks)

### Phase 2A: Mobile Migration (2 weeks)

**Goal**: Launch an Expo (React Native) mobile app with feature parity to the web app.

#### New Project Structure
```
apps/
  mobile/                  ← NEW: Expo (React Native)
    app/                   ← expo-router (file-based routing)
      (tabs)/
        index.tsx          ← Home / Feed
        scoring.tsx        ← Live scoring
        matches.tsx        ← Match list
        profile.tsx        ← User profile
      matches/[id]/
        score.tsx          ← Scoring page
        scorecard.tsx      ← Scorecard page
    components/            ← Mobile-specific components
    lib/                   ← API client, stores (reuse from web)
  web/                     ← Existing React app (keep working)
  api/                     ← Existing Fastify API (unchanged)
packages/
  shared/                  ← Types (already shared)
  ui/                      ← NEW: Shared component library
```

#### Technical Approach
- **Expo SDK 52+** with `expo-router` for file-based navigation
- **Shared UI package** (`packages/ui`) using `nativewind` (Tailwind CSS for React Native)
- **Shared business logic**: API client, Zustand stores, type definitions from `packages/shared`
- **Offline-first**: `expo-sqlite` for local storage + sync queue (replaces web IndexedDB)
- **Push notifications**: `expo-notifications` + Firebase Cloud Messaging

#### Deliverables
- [ ] Expo app scaffolding with expo-router
- [ ] Shared UI component library (buttons, cards, badges, inputs)
- [ ] All existing pages ported: Home, Create Match, Scoring, Scorecard
- [ ] Offline scoring queue with background sync
- [ ] Push notification setup (FCM)
- [ ] App Store / Play Store submission pipeline (EAS Build)

---

### Phase 2B: Auth Hardening (1 week)

**Goal**: Production-ready authentication with social login.

#### Changes
- Wire JWT middleware on all protected routes (partially done — needs thorough testing)
- OAuth2 providers: Google Sign-In + Apple Sign-In (via `expo-auth-session`)
- Email verification flow (send verification code → confirm)
- Password reset flow (forgot password → email code → reset)
- Device session management (list active sessions, revoke others)
- Rate limiting on auth endpoints (fastify-rate-limit)

#### New API Routes
```
POST   /api/v1/auth/verify-email        ← send verification code
POST   /api/v1/auth/confirm-email       ← confirm verification code
POST   /api/v1/auth/forgot-password     ← send reset code
POST   /api/v1/auth/reset-password      ← reset with code
GET    /api/v1/auth/sessions            ← list active sessions
DELETE /api/v1/auth/sessions/:id        ← revoke a session
POST   /api/v1/auth/google              ← Google OAuth callback
POST   /api/v1/auth/apple               ← Apple OAuth callback
```

#### Deliverables
- [ ] JWT middleware tested on all protected routes
- [ ] Google Sign-In integration
- [ ] Apple Sign-In integration
- [ ] Email verification flow
- [ ] Password reset flow
- [ ] Session management
- [ ] Rate limiting

---

### Phase 2C: User Profiles (1.5 weeks)

**Goal**: Rich player profiles with cricket-specific attributes and ball type preferences.

#### Schema Changes
```sql
-- Extend app_user table
ALTER TABLE app_user ADD COLUMN bio TEXT;
ALTER TABLE app_user ADD COLUMN avatar_url VARCHAR(500);
ALTER TABLE app_user ADD COLUMN city VARCHAR(100);
ALTER TABLE app_user ADD COLUMN country VARCHAR(100);
ALTER TABLE app_user ADD COLUMN batting_style VARCHAR(20);
  -- 'right_hand_bat', 'left_hand_bat'
ALTER TABLE app_user ADD COLUMN bowling_style VARCHAR(30);
  -- 'right_arm_fast', 'right_arm_medium', 'left_arm_fast',
  -- 'left_arm_medium', 'right_arm_offspin', 'right_arm_legspin',
  -- 'left_arm_orthodox', 'left_arm_chinaman', 'none'
ALTER TABLE app_user ADD COLUMN preferred_formats TEXT[];
  -- ['t20', 'odi', 'test', 'gully', 't10', 'hundred']
ALTER TABLE app_user ADD COLUMN ball_type_preference TEXT[];
  -- ['leather', 'hard_tennis', 'light_tennis', 'tape', 'other']
ALTER TABLE app_user ADD COLUMN primary_role VARCHAR(20);
  -- 'batsman', 'bowler', 'all_rounder', 'wicket_keeper'
ALTER TABLE app_user ADD COLUMN is_public BOOLEAN DEFAULT true;
ALTER TABLE app_user ADD COLUMN location_lat DECIMAL(10, 8);
ALTER TABLE app_user ADD COLUMN location_lng DECIMAL(11, 8);

-- Add ball type and cricket type to matches
ALTER TABLE match ADD COLUMN ball_type VARCHAR(20);
  -- 'leather', 'hard_tennis', 'light_tennis', 'tape', 'other'
ALTER TABLE match ADD COLUMN cricket_type VARCHAR(30);
  -- 'professional', 'club', 'league', 'gully', 'corporate',
  -- 'school', 'university', 'friendly'
```

#### New API Routes
```
GET    /api/v1/users/me                 ← get own profile
PATCH  /api/v1/users/me                 ← update own profile
GET    /api/v1/users/:id                ← get public profile
POST   /api/v1/users/me/avatar          ← upload avatar (S3/R2)
GET    /api/v1/users/:id/stats          ← career stats summary
GET    /api/v1/users/:id/matches        ← match history
```

#### Deliverables
- [ ] Profile schema migration
- [ ] Profile CRUD API routes
- [ ] Avatar upload (Cloudflare R2 or S3)
- [ ] Profile page (mobile + web)
- [ ] Career stats summary on profile
- [ ] Match history on profile
- [ ] Ball type / cricket type on match creation

---

### Phase 2D: Follow System (1 week)

**Goal**: Player-to-player and player-to-team following.

#### New Tables
```sql
CREATE TABLE follow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  following_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(follower_id, following_id),
  CHECK(follower_id != following_id)
);
CREATE INDEX idx_follow_follower ON follow(follower_id);
CREATE INDEX idx_follow_following ON follow(following_id);

CREATE TABLE team_follow (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(user_id, team_id)
);
CREATE INDEX idx_team_follow_user ON team_follow(user_id);
CREATE INDEX idx_team_follow_team ON team_follow(team_id);
```

#### New API Routes
```
POST   /api/v1/users/:id/follow         ← follow a player
DELETE /api/v1/users/:id/follow         ← unfollow a player
GET    /api/v1/users/:id/followers      ← list followers (paginated)
GET    /api/v1/users/:id/following      ← list following (paginated)
GET    /api/v1/users/:id/mutual         ← mutual connections
POST   /api/v1/teams/:id/follow         ← follow a team
DELETE /api/v1/teams/:id/follow         ← unfollow a team
GET    /api/v1/users/suggestions        ← friend suggestions
  -- algorithm: mutual teams, same city, similar ball type preference
```

#### Deliverables
- [ ] Follow schema + migration
- [ ] Follow/unfollow API routes
- [ ] Follower/following lists
- [ ] Friend suggestion algorithm (mutual teams, same city, similar preferences)
- [ ] Follow button on profile page
- [ ] Follower/following counts on profile

---

### Phase 2E: Activity Feed (1.5 weeks)

**Goal**: Personalized feed showing match results, milestones, and achievements from followed players.

#### New Tables
```sql
CREATE TABLE activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  activity_type VARCHAR(30) NOT NULL,
    -- 'match_completed', 'milestone_scored', 'achievement_earned',
    -- 'joined_team', 'century', 'five_wicket_haul', 'hat_trick',
    -- 'tournament_won', 'new_high_score'
  entity_type VARCHAR(20),  -- 'match', 'player', 'team', 'tournament'
  entity_id UUID,
  metadata JSONB,
    -- examples:
    -- {runs: 102, format: 't20', ball_type: 'leather', team: 'Mumbai XI'}
    -- {wickets: 5, overs: '4.0', runs_conceded: 22}
  is_public BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_activity_user ON activity(user_id);
CREATE INDEX idx_activity_type ON activity(activity_type);
CREATE INDEX idx_activity_created ON activity(created_at DESC);

CREATE TABLE feed_item (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  activity_id UUID NOT NULL REFERENCES activity(id) ON DELETE CASCADE,
  seen BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_feed_user_time ON feed_item(user_id, created_at DESC);
CREATE INDEX idx_feed_unseen ON feed_item(user_id, seen) WHERE seen = false;
```

#### Feed Architecture
- **Fan-out-on-write** for users with < 5,000 followers
  - Match completes → create `activity` record → BullMQ job fans out `feed_item` to all followers
- **Fan-out-on-read** for users with 5,000+ followers
  - Merge their activities at query time to avoid millions of writes
- **Redis sorted sets** for hot feed cache (last 100 items per user, TTL 24h)
- **PostgreSQL** as durable store for full feed history

#### New API Routes
```
GET    /api/v1/feed                     ← personalized feed (paginated)
GET    /api/v1/feed/trending            ← trending matches/players
  -- query params: ?city=Mumbai&country=India&period=weekly
POST   /api/v1/feed/:activityId/like    ← like/kudos an activity
DELETE /api/v1/feed/:activityId/like    ← unlike
GET    /api/v1/feed/:activityId/likes   ← who liked this
```

#### Deliverables
- [ ] Activity + feed_item schema + migration
- [ ] Fan-out worker (BullMQ)
- [ ] Feed API with pagination
- [ ] Trending endpoint (by city, country, global)
- [ ] Like/kudos system
- [ ] Feed page (mobile + web)
- [ ] Activity cards (match summary, milestone, achievement)
- [ ] Redis feed cache

---

### Phase 2F: Notifications (1 week)

**Goal**: Push + in-app notification system.

#### New Table
```sql
CREATE TABLE notification (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  type VARCHAR(30) NOT NULL,
    -- 'new_follower', 'match_invite', 'match_completed',
    -- 'milestone', 'achievement', 'chat_message',
    -- 'team_invite', 'availability_request'
  title VARCHAR(200) NOT NULL,
  body TEXT,
  data JSONB,  -- {match_id: '...', from_user_id: '...', deep_link: '/matches/abc'}
  read BOOLEAN NOT NULL DEFAULT false,
  push_sent BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_notification_user ON notification(user_id, created_at DESC);
CREATE INDEX idx_notification_unread ON notification(user_id, read) WHERE read = false;
```

#### Architecture
- **BullMQ** job queue for async notification processing
- **Firebase Cloud Messaging** for push notifications (iOS + Android)
- **Expo push tokens** registered on app startup
- **In-app notification center** with unread badge count
- **Socket.IO** real-time delivery for in-app notifications

#### New API Routes
```
GET    /api/v1/notifications            ← list notifications (paginated)
PATCH  /api/v1/notifications/:id/read   ← mark as read
POST   /api/v1/notifications/read-all   ← mark all as read
GET    /api/v1/notifications/unread-count ← badge count
POST   /api/v1/devices/register         ← register FCM push token
```

#### Deliverables
- [ ] Notification schema + migration
- [ ] BullMQ notification worker
- [ ] FCM integration
- [ ] Push token registration
- [ ] Notification center UI (mobile + web)
- [ ] Unread badge on tab bar
- [ ] Real-time notification via Socket.IO

---

## Phase 3: Team Ops & Chat (4-5 weeks)

### Phase 3A: Enhanced Team Management (1.5 weeks)

#### New Schema
```sql
CREATE TABLE team_membership (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role VARCHAR(20) NOT NULL DEFAULT 'player',
    -- 'owner', 'captain', 'vice_captain', 'manager', 'player'
  status VARCHAR(20) NOT NULL DEFAULT 'active',
    -- 'active', 'pending_invite', 'pending_request', 'inactive'
  joined_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(team_id, user_id)
);

CREATE TABLE team_invite (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id UUID NOT NULL REFERENCES team(id) ON DELETE CASCADE,
  invited_by UUID NOT NULL REFERENCES app_user(id),
  invited_user_id UUID REFERENCES app_user(id),
  invite_code VARCHAR(20) UNIQUE,  -- shareable join code
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  expires_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
```

#### Features
- Team roles (owner, captain, vice_captain, manager, player)
- Join via invite link (shareable code)
- Join request + approval flow
- Roster management
- Team stats dashboard (aggregate batting/bowling averages across all matches)

---

### Phase 3B: Custom Chat on Socket.IO (2 weeks)

#### New Schema
```sql
CREATE TABLE chat_room (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  type VARCHAR(20) NOT NULL,
    -- 'team', 'direct', 'tournament', 'match'
  name VARCHAR(100),
  team_id UUID REFERENCES team(id),
  match_id UUID REFERENCES match(id),
  created_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE chat_message (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id UUID NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  sender_id UUID NOT NULL REFERENCES app_user(id),
  content TEXT NOT NULL,
  message_type VARCHAR(20) NOT NULL DEFAULT 'text',
    -- 'text', 'image', 'scorecard_share', 'match_invite',
    -- 'availability_poll', 'system'
  reply_to_id UUID REFERENCES chat_message(id),
  metadata JSONB,  -- {image_url: '...', match_id: '...', poll_options: [...]}
  edited_at TIMESTAMPTZ,
  deleted_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_chat_msg_room ON chat_message(room_id, created_at DESC);

CREATE TABLE chat_member (
  room_id UUID NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role VARCHAR(20) DEFAULT 'member',  -- 'admin', 'member'
  last_read_at TIMESTAMPTZ,
  muted_until TIMESTAMPTZ,
  PRIMARY KEY (room_id, user_id)
);
```

#### Socket.IO Namespace: `/social`
```
Events:
  chat:join_room     ← join a chat room
  chat:leave_room    ← leave a chat room
  chat:message       ← send a message
  chat:typing        ← typing indicator
  chat:read          ← mark messages as read
  chat:message:new   → receive new message (server→client)
  chat:typing:show   → show typing indicator (server→client)
```

#### Features
- Team group chats (auto-created when team is formed)
- 1:1 direct messages
- Match chat rooms (live discussion during scoring)
- Typing indicators + read receipts
- Unread counts per room
- Share scorecards in chat
- Reply to messages
- Image sharing

---

### Phase 3C: Availability & Scheduling (1 week)

#### New Schema
```sql
CREATE TABLE match_availability (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  match_id UUID REFERENCES match(id) ON DELETE CASCADE,
  team_id UUID NOT NULL REFERENCES team(id),
  player_id UUID NOT NULL REFERENCES app_user(id),
  status VARCHAR(20) NOT NULL,  -- 'available', 'unavailable', 'maybe'
  note TEXT,
  responded_at TIMESTAMPTZ DEFAULT NOW(),
  UNIQUE(match_id, player_id)
);
```

#### Features
- Captain creates match → all team members get push notification
- Respond: available / unavailable / maybe (with optional note)
- Dashboard shows availability grid
- Auto-remind players who haven't responded (24h before match)

---

## Phase 4: Stats, Predictions & Trending (5-7 weeks)

### Phase 4A: Multi-Format Career Stats (2 weeks)

#### Features
- Aggregate batting stats: innings, runs, average, strike rate, 50s, 100s, highest score
- Aggregate bowling stats: overs, wickets, average, economy, best figures, 5-wicket hauls
- Aggregate fielding stats: catches, run outs, stumpings
- **Split by**: format (T20/ODI/Test/Gully), ball type (leather/tennis/tape), cricket type
- **Venue stats**: performance at specific grounds
- **Head-to-head**: batter vs. bowler across all encounters
- **Form graph**: last 10 innings trend line
- **Comparison**: compare two players side by side

#### New API Routes
```
GET    /api/v1/users/:id/stats                    ← career summary
GET    /api/v1/users/:id/stats/batting             ← detailed batting
GET    /api/v1/users/:id/stats/bowling             ← detailed bowling
GET    /api/v1/users/:id/stats/fielding            ← detailed fielding
GET    /api/v1/users/:id/stats/head-to-head/:oppId ← h2h matchup
GET    /api/v1/users/:id/stats/by-venue            ← venue splits
GET    /api/v1/users/:id/stats/form                ← recent form
GET    /api/v1/stats/compare?players=id1,id2       ← player comparison
```

---

### Phase 4B: Trending Engine (1.5 weeks)

#### New Schema
```sql
CREATE TABLE trending_snapshot (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type VARCHAR(20) NOT NULL,
    -- 'player', 'team', 'league', 'match'
  entity_id UUID NOT NULL,
  score FLOAT NOT NULL,
  period VARCHAR(20) NOT NULL,  -- 'daily', 'weekly', 'monthly'
  city VARCHAR(100),
  country VARCHAR(100),
  ball_type VARCHAR(20),
  computed_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_trending_lookup ON trending_snapshot(entity_type, period, computed_at DESC);
CREATE INDEX idx_trending_city ON trending_snapshot(city, entity_type, period);
```

#### Trending Algorithm
Weighted score combining:
- Recent match activity (matches played in period): 30%
- Performance (runs scored, wickets taken, wins): 25%
- Social engagement (followers gained, feed likes): 20%
- Match views / scorecard views: 15%
- Momentum (week-over-week growth): 10%

#### Features
- Trending players, teams, leagues
- Scoped: by city, country, globally
- Filtered: by ball type, format
- "Rising star" designation for players with rapid upward trend
- Computed via BullMQ cron job (hourly for daily, daily for weekly/monthly)

#### New API Routes
```
GET    /api/v1/trending/players    ?city=&country=&period=&ball_type=
GET    /api/v1/trending/teams      ?city=&country=&period=
GET    /api/v1/trending/matches    ?city=&country=&period=
GET    /api/v1/trending/leagues    ?country=&period=
```

---

### Phase 4C: Predictive Engine — Python Sidecar (2 weeks)

#### New Service
```
services/
  prediction/
    models/
      win_probability.py       ← XGBoost model
      player_rating.py         ← ELO-style rating system
      match_simulation.py      ← Monte Carlo simulation
      ball_prediction.py       ← Next ball outcome probability
    training/
      train_win_prob.py        ← Training script (Cricsheet data)
      train_player_rating.py
      feature_engineering.py
    api.py                     ← FastAPI endpoints
    config.py
    Dockerfile
    requirements.txt
```

#### Technology
- **Training**: Python + XGBoost/LightGBM + scikit-learn
- **Data**: Cricsheet open data (500K+ deliveries) + CricScore's own match data
- **Serving**: FastAPI on port 3002, accessed internally by Node.js API
- **Inference**: ONNX Runtime for production, < 50ms per prediction
- **Caching**: Redis for current match state + pre-computed features

#### API (Internal)
```
POST   /predict/win-probability        ← live win % given match state
POST   /predict/next-ball              ← outcome probabilities for next delivery
POST   /predict/player-performance     ← expected performance for a player
GET    /ratings/player/:id             ← player ELO rating
POST   /simulate/match                 ← Monte Carlo match simulation
GET    /par-score/:matchId             ← par score at current stage
```

#### Integration
- After each delivery, Node.js API calls prediction service
- Updated win probability pushed via WebSocket to all clients
- Player ratings updated nightly via batch job

---

### Phase 4D: Visualizations (1.5 weeks)

#### Features
- **Wagon wheel**: Shot direction map per batter (D3.js / react-native-svg)
- **Pitch map**: Bowler accuracy visualization (line + length)
- **Manhattan chart**: Runs per over bar chart
- **Worm chart**: Running score comparison between innings
- **Win probability graph**: Real-time line chart during match
- **Scoring zones heatmap**: Where runs are scored on the field
- **Player comparison charts**: Radar charts for side-by-side comparison

#### Technical
- D3.js for web
- `react-native-svg` + `victory-native` for mobile
- Shared data transformation logic in `packages/shared`

---

## Phase 5: Fantasy & Gamification (5-6 weeks)

### Phase 5A: Fantasy Engine (3 weeks)

#### New Schema
```sql
CREATE TABLE fantasy_contest (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name VARCHAR(200) NOT NULL,
  description TEXT,
  match_id UUID REFERENCES match(id),           -- for local CricScore matches
  external_match_ref VARCHAR(100),               -- for international matches
  match_source VARCHAR(30) NOT NULL,
    -- 'local', 'ipl', 'icc_odi', 'icc_t20', 'icc_test',
    -- 'bbl', 'sa20', 'cpl', 'psl', 'the_hundred'
  entry_fee INTEGER NOT NULL DEFAULT 0,          -- 0 = free
  prize_pool JSONB,
    -- {type: 'points', distribution: [{rank: 1, amount: 1000}, ...]}
  max_entries INTEGER,
  scoring_rules JSONB NOT NULL,
    -- {run: 1, four_bonus: 1, six_bonus: 2, wicket: 25, catch: 8, ...}
  status VARCHAR(20) NOT NULL DEFAULT 'open',
    -- 'open', 'locked', 'live', 'completed', 'cancelled'
  lock_time TIMESTAMPTZ,                         -- when team selection locks
  starts_at TIMESTAMPTZ,
  created_by UUID REFERENCES app_user(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE fantasy_team (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES fantasy_contest(id) ON DELETE CASCADE,
  user_id UUID NOT NULL REFERENCES app_user(id),
  team_name VARCHAR(100),
  players JSONB NOT NULL,
    -- [{player_id, role, is_captain, is_vice_captain}]
  total_points FLOAT NOT NULL DEFAULT 0,
  rank INTEGER,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(contest_id, user_id)
);

CREATE TABLE fantasy_points_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id UUID NOT NULL REFERENCES fantasy_contest(id),
  player_id UUID NOT NULL,
  delivery_id UUID,                              -- link to actual delivery
  points FLOAT NOT NULL,
  reason VARCHAR(50) NOT NULL,
    -- 'run', 'four_bonus', 'six_bonus', 'wicket', 'catch',
    -- 'maiden_bonus', 'economy_bonus', 'strike_rate_bonus',
    -- 'duck_penalty', 'captain_multiplier'
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
```

#### Two Fantasy Modes

**1. Local Fantasy** (matches scored on CricScore)
- Create a contest for any match scored on the platform
- Select players from actual teams in the match
- Points calculated in real-time as deliveries are recorded
- Free to enter (social bragging rights + CricScore XP)

**2. International Fantasy** (IPL, ICC, BBL, SA20, CPL, PSL)
- Ingest match schedules from external APIs
- Users pick fantasy teams from international rosters
- Live data feed from ESPNcricinfo API or Cricsheet for point calculation
- Public and private contests (create with friends)

#### New API Routes
```
GET    /api/v1/fantasy/contests          ← list contests (filter by source)
POST   /api/v1/fantasy/contests          ← create a contest
GET    /api/v1/fantasy/contests/:id      ← contest details + leaderboard
POST   /api/v1/fantasy/contests/:id/team ← submit fantasy team
PATCH  /api/v1/fantasy/contests/:id/team ← edit team (before lock)
GET    /api/v1/fantasy/contests/:id/live ← live points updates
GET    /api/v1/fantasy/my-contests       ← user's active contests
GET    /api/v1/fantasy/history           ← past contests + results
```

---

### Phase 5B: Achievement System (1.5 weeks)

#### New Schema
```sql
CREATE TABLE achievement (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug VARCHAR(50) UNIQUE NOT NULL,
  name VARCHAR(100) NOT NULL,
  description TEXT NOT NULL,
  icon_url VARCHAR(500),
  category VARCHAR(30) NOT NULL,
    -- 'batting', 'bowling', 'fielding', 'social', 'milestone', 'fantasy'
  rarity VARCHAR(20) NOT NULL DEFAULT 'common',
    -- 'common', 'rare', 'epic', 'legendary'
  criteria JSONB NOT NULL,
    -- {type: 'runs_in_innings', threshold: 100}
    -- {type: 'matches_played', threshold: 50}
    -- {type: 'followers_count', threshold: 100}
  xp_reward INTEGER NOT NULL DEFAULT 10,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE user_achievement (
  user_id UUID NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  achievement_id UUID NOT NULL REFERENCES achievement(id),
  earned_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  match_id UUID REFERENCES match(id),
  metadata JSONB,  -- {innings_score: 102, against_team: 'Mumbai XI'}
  PRIMARY KEY (user_id, achievement_id)
);
```

#### Badge Catalogue (Initial Set)

| Badge | Category | Criteria | Rarity |
|-------|----------|----------|--------|
| Half Century | Batting | Score 50+ in an innings | Common |
| Century Club | Batting | Score 100+ in an innings | Rare |
| Double Century | Batting | Score 200+ in an innings | Legendary |
| Six Machine | Batting | Hit 5+ sixes in an innings | Rare |
| Hat-Trick Hero | Bowling | Take 3 wickets in 3 consecutive balls | Epic |
| Five-For | Bowling | Take 5+ wickets in an innings | Rare |
| Sharp Catch | Fielding | Take 3+ catches in an innings | Rare |
| Match Winner | Milestone | Win 10 matches | Common |
| Veteran | Milestone | Play 50 matches | Rare |
| Legend | Milestone | Play 200 matches | Epic |
| Team Builder | Social | Invite 10 players to the platform | Common |
| Popular | Social | Gain 100 followers | Rare |
| Influencer | Social | Gain 1000 followers | Epic |
| Rising Star | Trending | Appear in trending for your city | Rare |
| Fantasy King | Fantasy | Win 10 fantasy contests | Rare |
| All-Format | Milestone | Play matches in 3+ different formats | Common |
| Multi-Ball | Milestone | Play with 3+ different ball types | Common |

#### Achievement Engine
- After each match completion, check all criteria for participating players
- Batch process via BullMQ worker
- Award badges + create activity feed items + push notification
- XP accumulation for future level/rank system

---

### Phase 5C: Leaderboards (1 week)

#### Features
- **Scope**: City, District, Country, Global
- **Filters**: Format, ball type, time period (this season, all-time)
- **Categories**: Most runs, highest average, most wickets, best economy, most matches
- **Relative leaderboard**: Show user's position +/- 10 ranks (motivating for non-elite players)
- **Seasonal resets**: Competitive leaderboards reset quarterly; historical data archived
- **XP leaderboard**: Total XP accumulated from matches + achievements

#### New API Routes
```
GET    /api/v1/leaderboards/batting     ?scope=city&city=Mumbai&period=season&format=t20
GET    /api/v1/leaderboards/bowling     ?scope=country&country=India&ball_type=leather
GET    /api/v1/leaderboards/xp          ?scope=global
GET    /api/v1/leaderboards/fantasy     ?period=monthly
GET    /api/v1/leaderboards/me          ← user's ranks across all categories
```

---

## Phase 6: Scale & Monetize (ongoing)

### Monetization Model

| Tier | Price | Features |
|------|-------|----------|
| **Free** | $0 | Basic scoring, team management, profile, follow, feed, local leaderboards, 3 fantasy contests/month |
| **Pro** | $3-5/mo | Advanced stats (head-to-head, venue splits, form graphs), unlimited fantasy, detailed visualizations (wagon wheel, pitch map), priority support |
| **Team** | $10/mo | Team analytics dashboard, availability management, unlimited chat history, custom team branding |
| **Tournament** | 10-15% fee | Tournament hosting with fixtures, points tables, knockout brackets, live streaming integration |

### Multi-Region Deployment

| Region | Location | Target Markets |
|--------|----------|----------------|
| Primary | Mumbai (ap-south-1) | India, Pakistan, Sri Lanka, Bangladesh |
| Secondary | Sydney (ap-southeast-2) | Australia, New Zealand |
| Tertiary | London (eu-west-2) | England, South Africa, West Indies |

- **CDN**: Cloudflare for global edge caching
- **Data residency**: Indian user PII stored in Mumbai (DPDP Act compliance)
- **Cross-region replication**: Public match data replicated globally

### Internationalization (i18n)

| Priority | Languages |
|----------|-----------|
| Launch | English |
| Phase 1 | Hindi, Urdu |
| Phase 2 | Tamil, Telugu, Bengali |
| Phase 3 | Sinhala, Afrikaans, Bangla |

- ICU MessageFormat for pluralization
- RTL support for Urdu
- Community translation via Crowdin

### Offline-First Architecture

- **Mobile**: expo-sqlite as local source of truth
- **Sync**: Optimistic writes → background sync queue → server reconciliation
- **Conflict resolution**: Last-write-wins for non-critical data; server-authority for scoring data
- **Delta sync**: Minimize bandwidth on reconnect (especially important for rural India)

---

## Architecture Overview

```
┌──────────────────────────────────────────────────────────────┐
│                         CLIENTS                               │
│  ┌──────────────┐  ┌──────────────┐  ┌────────────────────┐  │
│  │  Expo App    │  │  Web App     │  │  Admin Dashboard   │  │
│  │  (iOS/And)   │  │  (React)     │  │  (React)           │  │
│  │  Mobile-first│  │  Feature     │  │  Tournament mgmt   │  │
│  │  Offline     │  │  Parity      │  │  Moderation        │  │
│  └──────┬───────┘  └──────┬───────┘  └────────┬───────────┘  │
│         │                  │                    │              │
└─────────┼──────────────────┼────────────────────┼─────────────┘
          │                  │                    │
     ┌────▼──────────────────▼────────────────────▼─────┐
     │               API Gateway (Fastify)               │
     │                                                    │
     │  REST: /api/v1/*                                   │
     │  ├── /auth      (JWT, OAuth, sessions)             │
     │  ├── /matches   (CRUD, scoring, toss, start)       │
     │  ├── /users     (profiles, stats, GDPR)            │
     │  ├── /teams     (management, membership)           │
     │  ├── /social    (follow, feed, trending)           │
     │  ├── /chat      (rooms, messages)                  │
     │  ├── /fantasy   (contests, teams, points)          │
     │  ├── /notifications                                │
     │  └── /leaderboards                                 │
     │                                                    │
     │  WebSocket (Socket.IO):                            │
     │  ├── /match     (delivery, wicket, over, status)   │
     │  └── /social    (chat, notifications, typing)      │
     │                                                    │
     └──┬──────────┬──────────┬──────────┬────────────────┘
        │          │          │          │
   ┌────▼────┐ ┌───▼────┐ ┌───▼────┐ ┌───▼──────────────┐
   │Postgres │ │ Redis  │ │BullMQ  │ │ Prediction Svc   │
   │TimescDB │ │        │ │        │ │ (Python/FastAPI)  │
   │         │ │Cache   │ │Jobs:   │ │                   │
   │Tables:  │ │Feed    │ │Fan-out │ │Win probability    │
   │19+15 new│ │Sessions│ │Notifs  │ │Player ratings     │
   │         │ │WS Pub  │ │Achieve │ │Match simulation   │
   │         │ │Sub     │ │Trending│ │Ball prediction    │
   └─────────┘ └────────┘ └────────┘ └───────────────────┘
```

---

## File Structure

```
apps/
  api/                          ← Fastify API (existing + extended)
    src/
      db/schema/
        # Existing (15 tables)
        match.ts, delivery.ts, innings.ts, scorecard.ts, ...
        # NEW Phase 2
        follow.ts               ← follow + team_follow
        activity.ts             ← activity + feed_item
        notification.ts         ← notification
        # NEW Phase 3
        chat.ts                 ← chat_room + chat_message + chat_member
        team-membership.ts      ← team_membership + team_invite
        availability.ts         ← match_availability
        # NEW Phase 4
        trending.ts             ← trending_snapshot
        # NEW Phase 5
        fantasy.ts              ← fantasy_contest + fantasy_team + points_log
        achievement.ts          ← achievement + user_achievement
      routes/
        # Existing
        matches.ts, deliveries.ts, scorecard.ts, auth.ts, ...
        # NEW Phase 2
        social.ts               ← follow, feed, trending
        notifications.ts        ← notification CRUD
        # NEW Phase 3
        chat.ts                 ← messaging endpoints
        team-membership.ts      ← join, invite, roles
        # NEW Phase 5
        fantasy.ts              ← contest CRUD, team management
        leaderboards.ts         ← scoped leaderboard queries
      engine/
        scoring-engine.ts       ← existing
        commentary-engine.ts    ← existing
        # NEW
        trending-engine.ts      ← trending score computation
        achievement-engine.ts   ← badge criteria checking
        fantasy-scoring.ts      ← fantasy point calculation
      services/
        realtime.ts             ← existing (extend with /social namespace)
        # NEW
        notification-service.ts ← BullMQ + FCM push
        feed-service.ts         ← fan-out logic
  mobile/                       ← NEW: Expo (React Native)
    app/
      (tabs)/
        index.tsx               ← Home / Feed
        scoring.tsx             ← Live scoring
        chat.tsx                ← Messages
        profile.tsx             ← User profile
      matches/[id]/
        score.tsx
        scorecard.tsx
      fantasy/
        index.tsx
        contest/[id].tsx
      leaderboards.tsx
      trending.tsx
      notifications.tsx
    components/
    lib/
  web/                          ← Existing React app (maintained with parity)
services/
  prediction/                   ← NEW: Python FastAPI sidecar
    models/
      win_probability.py
      player_rating.py
      match_simulation.py
      ball_prediction.py
    training/
      train_win_prob.py
      feature_engineering.py
    api.py
    Dockerfile
    requirements.txt
packages/
  shared/                       ← Existing shared types (extended)
    src/types/
      models.ts                 ← + Profile, Follow, Chat, Fantasy, Achievement
      events.ts                 ← + Social namespace events
      enums.ts                  ← + BallType, CricketType, AchievementCategory
  ui/                           ← NEW: Shared component library
    src/
      Button.tsx
      Card.tsx
      Badge.tsx
      Input.tsx
      Avatar.tsx
      ...
```

---

## New Database Schema

### Summary of All New Tables (15 tables)

| Phase | Table | Purpose |
|-------|-------|---------|
| 2C | `app_user` (ALTER) | Extended profile fields |
| 2C | `match` (ALTER) | ball_type, cricket_type |
| 2D | `follow` | User-to-user following |
| 2D | `team_follow` | User-to-team following |
| 2E | `activity` | Activity log (match completed, milestone, etc.) |
| 2E | `feed_item` | Per-user feed (fan-out results) |
| 2F | `notification` | Push + in-app notifications |
| 3A | `team_membership` | Team roles + join status |
| 3A | `team_invite` | Invite codes + requests |
| 3B | `chat_room` | Chat rooms (team, direct, match) |
| 3B | `chat_message` | Messages with types + replies |
| 3B | `chat_member` | Room membership + read state |
| 3C | `match_availability` | Player availability responses |
| 4B | `trending_snapshot` | Computed trending scores |
| 5A | `fantasy_contest` | Fantasy contest definitions |
| 5A | `fantasy_team` | User's fantasy team picks |
| 5A | `fantasy_points_log` | Point-by-point calculation log |
| 5B | `achievement` | Badge definitions + criteria |
| 5B | `user_achievement` | Earned badges per user |

---

## API Routes Map

### Existing Routes (Phase 1) — 30+ endpoints

```
# Health
GET    /health

# Auth
POST   /api/v1/auth/register
POST   /api/v1/auth/login
POST   /api/v1/auth/refresh
POST   /api/v1/auth/logout

# Matches
GET    /api/v1/matches
POST   /api/v1/matches
GET    /api/v1/matches/:id
PATCH  /api/v1/matches/:id
POST   /api/v1/matches/:id/toss
POST   /api/v1/matches/:id/start
POST   /api/v1/matches/:id/interruption
POST   /api/v1/matches/:id/resume
POST   /api/v1/matches/:id/super-over
GET    /api/v1/matches/:id/state
POST   /api/v1/matches/:id/substitutions

# Deliveries
POST   /api/v1/matches/:id/deliveries
GET    /api/v1/matches/:id/deliveries
DELETE /api/v1/matches/:id/deliveries/last
PATCH  /api/v1/matches/:id/deliveries/:ballId
DELETE /api/v1/matches/:id/deliveries/batch

# Scorecard & Commentary
GET    /api/v1/matches/:id/scorecard
GET    /api/v1/matches/:id/commentary

# Reviews (DRS)
POST   /api/v1/matches/:id/reviews
PATCH  /api/v1/matches/:id/reviews/:reviewId

# Teams & Players
GET/POST       /api/v1/teams
GET/PATCH/DEL  /api/v1/teams/:id
GET/POST       /api/v1/players
GET/PATCH/DEL  /api/v1/players/:id

# Format Configs
GET/POST       /api/v1/format-configs
GET/PATCH      /api/v1/format-configs/:id

# Users (GDPR)
GET    /api/v1/users/me/export
DELETE /api/v1/users/me
```

### New Routes (Phases 2-5) — 40+ endpoints

```
# Auth (Phase 2B)
POST   /api/v1/auth/verify-email
POST   /api/v1/auth/confirm-email
POST   /api/v1/auth/forgot-password
POST   /api/v1/auth/reset-password
GET    /api/v1/auth/sessions
DELETE /api/v1/auth/sessions/:id
POST   /api/v1/auth/google
POST   /api/v1/auth/apple

# Profiles (Phase 2C)
GET    /api/v1/users/me
PATCH  /api/v1/users/me
GET    /api/v1/users/:id
POST   /api/v1/users/me/avatar
GET    /api/v1/users/:id/stats
GET    /api/v1/users/:id/matches

# Social (Phase 2D-E)
POST   /api/v1/users/:id/follow
DELETE /api/v1/users/:id/follow
GET    /api/v1/users/:id/followers
GET    /api/v1/users/:id/following
GET    /api/v1/users/:id/mutual
POST   /api/v1/teams/:id/follow
DELETE /api/v1/teams/:id/follow
GET    /api/v1/users/suggestions
GET    /api/v1/feed
GET    /api/v1/feed/trending
POST   /api/v1/feed/:activityId/like
DELETE /api/v1/feed/:activityId/like

# Notifications (Phase 2F)
GET    /api/v1/notifications
PATCH  /api/v1/notifications/:id/read
POST   /api/v1/notifications/read-all
GET    /api/v1/notifications/unread-count
POST   /api/v1/devices/register

# Chat (Phase 3B)
GET    /api/v1/chat/rooms
POST   /api/v1/chat/rooms
GET    /api/v1/chat/rooms/:id/messages
POST   /api/v1/chat/rooms/:id/messages
GET    /api/v1/chat/direct/:userId

# Team Management (Phase 3A)
POST   /api/v1/teams/:id/members
PATCH  /api/v1/teams/:id/members/:userId
DELETE /api/v1/teams/:id/members/:userId
POST   /api/v1/teams/:id/invite
POST   /api/v1/teams/join/:code

# Availability (Phase 3C)
POST   /api/v1/matches/:id/availability
GET    /api/v1/matches/:id/availability

# Trending (Phase 4B)
GET    /api/v1/trending/players
GET    /api/v1/trending/teams
GET    /api/v1/trending/matches
GET    /api/v1/trending/leagues

# Stats (Phase 4A)
GET    /api/v1/users/:id/stats/batting
GET    /api/v1/users/:id/stats/bowling
GET    /api/v1/users/:id/stats/fielding
GET    /api/v1/users/:id/stats/head-to-head/:oppId
GET    /api/v1/users/:id/stats/by-venue
GET    /api/v1/users/:id/stats/form
GET    /api/v1/stats/compare

# Fantasy (Phase 5A)
GET    /api/v1/fantasy/contests
POST   /api/v1/fantasy/contests
GET    /api/v1/fantasy/contests/:id
POST   /api/v1/fantasy/contests/:id/team
PATCH  /api/v1/fantasy/contests/:id/team
GET    /api/v1/fantasy/contests/:id/live
GET    /api/v1/fantasy/my-contests
GET    /api/v1/fantasy/history

# Leaderboards (Phase 5C)
GET    /api/v1/leaderboards/batting
GET    /api/v1/leaderboards/bowling
GET    /api/v1/leaderboards/xp
GET    /api/v1/leaderboards/fantasy
GET    /api/v1/leaderboards/me
```

---

## Tech Stack Additions

| Layer | Current (Phase 1) | Adding (Phase 2+) |
|-------|-------------------|-------------------|
| **Mobile** | — | Expo SDK 52+ (React Native), expo-router |
| **Shared UI** | — | `packages/ui` with nativewind (Tailwind for RN) |
| **Auth** | JWT + bcrypt | + Google OAuth, Apple Sign-In, expo-auth-session |
| **Job Queue** | — | BullMQ (Redis-backed) for async jobs |
| **Push** | — | Firebase Cloud Messaging + expo-notifications |
| **File Storage** | — | Cloudflare R2 or AWS S3 (avatars, images) |
| **Search** | — | Meilisearch (player/team discovery) — Phase 3+ |
| **ML Training** | — | Python + XGBoost + scikit-learn |
| **ML Serving** | — | FastAPI + ONNX Runtime (port 3002) |
| **Monitoring** | — | Sentry (error tracking), Prometheus + Grafana (metrics) |

---

## Open Questions

1. **External cricket data source**: For international fantasy (IPL, ICC, BBL), we need a live data feed. Options:
   - ESPNcricinfo API (unofficial, may break)
   - CricAPI / Cricket Data API (paid, $50-200/mo)
   - Cricsheet (free, but delayed — not real-time)
   - Scraping (fragile, legal risk)

2. **Fantasy legal compliance**: Fantasy sports have legal restrictions in some Indian states (Assam, Odisha, Telangana, Andhra Pradesh, Nagaland, Sikkim). Need legal review before monetizing fantasy.

3. **Video highlights**: Auto-generated highlight reels (like CricHeroes) require video recording integration. Should this be in scope for Phase 2-5, or is it a Phase 6+ feature?

4. **Ground/venue discovery**: Should we build a ground booking/discovery feature? Many teams struggle to find and book cricket grounds. Could be a differentiator but adds complexity.

5. **Umpire/scorer roles**: Should the app support dedicated umpire and scorer accounts with specialized UIs? Or is self-scoring sufficient for the target audience?

6. **Data migration**: For users coming from CricHeroes or CricClubs, should we build an import tool to bring their historical match data?

---

*This document is a living plan. Update as decisions are made and phases are completed.*
