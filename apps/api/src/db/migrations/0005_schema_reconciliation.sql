-- Migration: 0005_schema_reconciliation
-- Reconcile Drizzle schema with SQL migrations: device tokens, notification preferences,
-- delivery reactions, and delivery.is_dead_ball.

-- ============================================================
-- device_token — push notification device registration
-- ============================================================

CREATE TABLE IF NOT EXISTS "device_token" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token" varchar(500) NOT NULL,
	"platform" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_device_token" UNIQUE("user_id","token")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_device_token_user" ON "device_token" USING btree ("user_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "device_token" ADD CONSTRAINT "device_token_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ============================================================
-- notification_preference — per-user notification settings
-- ============================================================

CREATE TABLE IF NOT EXISTS "notification_preference" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"milestones" boolean DEFAULT true NOT NULL,
	"wickets" boolean DEFAULT true NOT NULL,
	"match_completion" boolean DEFAULT true NOT NULL,
	"follow_activity" boolean DEFAULT true NOT NULL,
	"chat_messages" boolean DEFAULT true NOT NULL,
	"push_enabled" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_notification_pref_user" UNIQUE("user_id")
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "notification_preference" ADD CONSTRAINT "notification_preference_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ============================================================
-- reaction — emoji reactions on deliveries
-- ============================================================

CREATE TABLE IF NOT EXISTS "reaction" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"emoji" varchar(10) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "uq_reaction_delivery_user" UNIQUE("delivery_id","user_id")
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reaction_match" ON "reaction" USING btree ("match_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_reaction_delivery" ON "reaction" USING btree ("delivery_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reaction" ADD CONSTRAINT "reaction_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reaction" ADD CONSTRAINT "reaction_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "reaction" ADD CONSTRAINT "reaction_user_id_app_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."app_user"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint

-- ============================================================
-- delivery — add is_dead_ball column
-- ============================================================

ALTER TABLE "delivery" ADD COLUMN IF NOT EXISTS "is_dead_ball" boolean DEFAULT false NOT NULL;
