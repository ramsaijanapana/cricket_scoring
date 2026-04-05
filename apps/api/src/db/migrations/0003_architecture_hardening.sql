-- Architecture hardening migration

-- Audit log table
CREATE TABLE IF NOT EXISTS audit_log (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID,
  match_id UUID,
  action VARCHAR(50) NOT NULL,
  entity_type VARCHAR(50) NOT NULL,
  entity_id UUID,
  before JSONB,
  after JSONB,
  created_at TIMESTAMPTZ DEFAULT NOW() NOT NULL
);
--> statement-breakpoint

-- Delivery: add client_id for idempotency
ALTER TABLE delivery ADD COLUMN IF NOT EXISTS client_id UUID UNIQUE;
--> statement-breakpoint

-- Match: add soft-delete columns
ALTER TABLE match ADD COLUMN IF NOT EXISTS is_deleted BOOLEAN NOT NULL DEFAULT FALSE;
--> statement-breakpoint
ALTER TABLE match ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMPTZ;
--> statement-breakpoint

-- User: add email_verified
ALTER TABLE app_user ADD COLUMN IF NOT EXISTS email_verified BOOLEAN NOT NULL DEFAULT FALSE;
--> statement-breakpoint

-- Match format config: add follow-on threshold
ALTER TABLE match_format_config ADD COLUMN IF NOT EXISTS follow_on_threshold INTEGER;
--> statement-breakpoint

-- Missing indexes
CREATE INDEX IF NOT EXISTS idx_delivery_timestamp ON delivery("timestamp");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_delivery_bowler_innings ON delivery(bowler_id, innings_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_innings_status ON innings(status);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_log_match ON audit_log(match_id);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_audit_log_created ON audit_log(created_at);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS idx_match_is_deleted ON match(is_deleted);
