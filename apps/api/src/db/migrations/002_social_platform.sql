-- Migration: 002_social_platform
-- Phase 2B-2F: Social platform features (follow, activity, notifications, chat, achievements, fantasy, trending)

-- ============================================================
-- ALTER existing tables
-- ============================================================

-- Extend app_user with social profile fields
ALTER TABLE app_user
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS avatar_url varchar(500),
  ADD COLUMN IF NOT EXISTS city varchar(100),
  ADD COLUMN IF NOT EXISTS country varchar(100),
  ADD COLUMN IF NOT EXISTS batting_style varchar(20),
  ADD COLUMN IF NOT EXISTS bowling_style varchar(30),
  ADD COLUMN IF NOT EXISTS preferred_formats text[],
  ADD COLUMN IF NOT EXISTS ball_type_preference text[],
  ADD COLUMN IF NOT EXISTS primary_role varchar(20),
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- Extend match with ball_type, cricket_type, is_public
ALTER TABLE match
  ADD COLUMN IF NOT EXISTS ball_type varchar(20),
  ADD COLUMN IF NOT EXISTS cricket_type varchar(30),
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT true;

-- ============================================================
-- Follow system
-- ============================================================

CREATE TABLE IF NOT EXISTS follow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  follower_id uuid NOT NULL REFERENCES app_user(id),
  following_id uuid NOT NULL REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_follow_pair UNIQUE (follower_id, following_id),
  CONSTRAINT chk_no_self_follow CHECK (follower_id != following_id)
);

CREATE INDEX IF NOT EXISTS idx_follow_follower ON follow(follower_id);
CREATE INDEX IF NOT EXISTS idx_follow_following ON follow(following_id);

CREATE TABLE IF NOT EXISTS team_follow (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  team_id uuid NOT NULL REFERENCES team(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_team_follow UNIQUE (user_id, team_id)
);

-- ============================================================
-- Activity & Feed
-- ============================================================

CREATE TABLE IF NOT EXISTS activity (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  activity_type varchar(30) NOT NULL,
  entity_type varchar(20) NOT NULL,
  entity_id uuid,
  metadata jsonb,
  is_public boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_activity_user ON activity(user_id);
CREATE INDEX IF NOT EXISTS idx_activity_type ON activity(activity_type);
CREATE INDEX IF NOT EXISTS idx_activity_created ON activity(created_at DESC);

CREATE TABLE IF NOT EXISTS feed_item (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  activity_id uuid NOT NULL REFERENCES activity(id),
  seen boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feed_item_user_created ON feed_item(user_id, created_at DESC);

-- ============================================================
-- Notifications
-- ============================================================

CREATE TABLE IF NOT EXISTS notification (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES app_user(id),
  type varchar(30) NOT NULL,
  title varchar(200) NOT NULL,
  body text,
  data jsonb,
  read boolean NOT NULL DEFAULT false,
  push_sent boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_notification_user_created ON notification(user_id, created_at DESC);

-- ============================================================
-- Chat
-- ============================================================

CREATE TABLE IF NOT EXISTS chat_room (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  type varchar(20) NOT NULL,
  name varchar(100),
  team_id uuid REFERENCES team(id),
  match_id uuid REFERENCES match(id),
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS chat_message (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  room_id uuid NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  sender_id uuid NOT NULL REFERENCES app_user(id),
  content text NOT NULL,
  message_type varchar(20) NOT NULL DEFAULT 'text',
  reply_to_id uuid REFERENCES chat_message(id),
  metadata jsonb,
  edited_at timestamptz,
  deleted_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_chat_message_room_created ON chat_message(room_id, created_at DESC);

CREATE TABLE IF NOT EXISTS chat_member (
  room_id uuid NOT NULL REFERENCES chat_room(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  role varchar(20) NOT NULL DEFAULT 'member',
  last_read_at timestamptz,
  muted_until timestamptz,
  PRIMARY KEY (room_id, user_id)
);

-- ============================================================
-- Achievements
-- ============================================================

CREATE TABLE IF NOT EXISTS achievement (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  slug varchar(50) NOT NULL UNIQUE,
  name varchar(100) NOT NULL,
  description text NOT NULL,
  icon_url varchar(500),
  category varchar(30) NOT NULL,
  rarity varchar(20) NOT NULL DEFAULT 'common',
  criteria jsonb,
  xp_reward integer NOT NULL DEFAULT 10,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS user_achievement (
  user_id uuid NOT NULL REFERENCES app_user(id) ON DELETE CASCADE,
  achievement_id uuid NOT NULL REFERENCES achievement(id),
  earned_at timestamptz NOT NULL DEFAULT now(),
  match_id uuid REFERENCES match(id),
  metadata jsonb,
  PRIMARY KEY (user_id, achievement_id)
);

-- ============================================================
-- Fantasy
-- ============================================================

CREATE TABLE IF NOT EXISTS fantasy_contest (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name varchar(200) NOT NULL,
  description text,
  match_id uuid REFERENCES match(id),
  external_match_ref varchar(100),
  match_source varchar(30) NOT NULL,
  entry_fee integer NOT NULL DEFAULT 0,
  prize_pool jsonb,
  max_entries integer,
  scoring_rules jsonb NOT NULL,
  status varchar(20) NOT NULL DEFAULT 'open',
  lock_time timestamptz,
  starts_at timestamptz,
  created_by uuid REFERENCES app_user(id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS fantasy_team (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES fantasy_contest(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_user(id),
  team_name varchar(100),
  players jsonb NOT NULL,
  total_points real NOT NULL DEFAULT 0,
  rank integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  CONSTRAINT uq_fantasy_team_contest_user UNIQUE (contest_id, user_id)
);

CREATE TABLE IF NOT EXISTS fantasy_points_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  contest_id uuid NOT NULL REFERENCES fantasy_contest(id),
  player_id uuid NOT NULL,
  delivery_id uuid,
  points real NOT NULL,
  reason varchar(50) NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ============================================================
-- Trending
-- ============================================================

CREATE TABLE IF NOT EXISTS trending_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  entity_type varchar(20) NOT NULL,
  entity_id uuid NOT NULL,
  score real NOT NULL,
  period varchar(20) NOT NULL,
  city varchar(100),
  country varchar(100),
  ball_type varchar(20),
  computed_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_trending_entity_period ON trending_snapshot(entity_type, period, computed_at DESC);
CREATE INDEX IF NOT EXISTS idx_trending_city_entity ON trending_snapshot(city, entity_type, period);
