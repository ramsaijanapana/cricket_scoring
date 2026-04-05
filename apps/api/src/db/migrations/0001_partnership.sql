-- Migration: 0001_partnership
-- Create partnership table for tracking batting partnerships within an innings.

CREATE TABLE IF NOT EXISTS "partnership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"innings_id" uuid NOT NULL,
	"batter1_id" uuid NOT NULL,
	"batter2_id" uuid NOT NULL,
	"runs" integer DEFAULT 0 NOT NULL,
	"balls" integer DEFAULT 0 NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"started_at_runs" integer NOT NULL,
	"ended_at_runs" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_partnership_innings" ON "partnership" ("innings_id");
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_partnership_active" ON "partnership" ("innings_id", "is_active");
--> statement-breakpoint
ALTER TABLE "partnership" ADD CONSTRAINT "partnership_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "innings"("id") ON DELETE CASCADE ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "partnership" ADD CONSTRAINT "partnership_batter1_id_player_id_fk" FOREIGN KEY ("batter1_id") REFERENCES "player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
--> statement-breakpoint
ALTER TABLE "partnership" ADD CONSTRAINT "partnership_batter2_id_player_id_fk" FOREIGN KEY ("batter2_id") REFERENCES "player"("id") ON DELETE NO ACTION ON UPDATE NO ACTION;
