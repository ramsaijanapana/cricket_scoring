CREATE TABLE IF NOT EXISTS "app_user" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"email" varchar(300) NOT NULL,
	"display_name" varchar(200) NOT NULL,
	"password_hash" text NOT NULL,
	"role" varchar(20) NOT NULL,
	"player_id" uuid,
	"team_id" uuid,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "app_user_email_unique" UNIQUE("email")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "batting_scorecard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"innings_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"batting_position" smallint NOT NULL,
	"runs_scored" integer DEFAULT 0 NOT NULL,
	"balls_faced" integer DEFAULT 0 NOT NULL,
	"fours" integer DEFAULT 0 NOT NULL,
	"sixes" integer DEFAULT 0 NOT NULL,
	"strike_rate" numeric(6, 2),
	"minutes_batted" integer,
	"is_out" boolean DEFAULT false NOT NULL,
	"dismissal_type" varchar(30),
	"dismissed_by_id" uuid,
	"fielder_id" uuid,
	"dismissal_text" varchar(200),
	"dots" integer DEFAULT 0 NOT NULL,
	"singles" integer DEFAULT 0 NOT NULL,
	"doubles" integer DEFAULT 0 NOT NULL,
	"triples" integer DEFAULT 0 NOT NULL,
	"is_not_out" boolean DEFAULT false NOT NULL,
	"did_not_bat" boolean DEFAULT false NOT NULL,
	CONSTRAINT "uq_bat_innings_player" UNIQUE("innings_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "bowling_scorecard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"innings_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"bowling_position" smallint,
	"overs_bowled" numeric(4, 1) DEFAULT '0' NOT NULL,
	"maidens" integer DEFAULT 0 NOT NULL,
	"runs_conceded" integer DEFAULT 0 NOT NULL,
	"wickets_taken" integer DEFAULT 0 NOT NULL,
	"economy_rate" numeric(5, 2),
	"dots" integer DEFAULT 0 NOT NULL,
	"fours_conceded" integer DEFAULT 0 NOT NULL,
	"sixes_conceded" integer DEFAULT 0 NOT NULL,
	"wides" integer DEFAULT 0 NOT NULL,
	"no_balls" integer DEFAULT 0 NOT NULL,
	"extras_conceded" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_bowl_innings_player" UNIQUE("innings_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "commentary" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid NOT NULL,
	"match_id" uuid NOT NULL,
	"innings_num" smallint NOT NULL,
	"over_ball" varchar(10) NOT NULL,
	"text" text NOT NULL,
	"text_short" varchar(200) NOT NULL,
	"emoji_text" varchar(500),
	"mode" varchar(10) DEFAULT 'auto' NOT NULL,
	"language" varchar(5) DEFAULT 'en' NOT NULL,
	"milestone" varchar(20),
	"drama_level" smallint DEFAULT 1 NOT NULL,
	"published_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "delivery" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"innings_id" uuid NOT NULL,
	"over_id" uuid NOT NULL,
	"over_num" smallint NOT NULL,
	"ball_num" smallint NOT NULL,
	"legal_ball_num" smallint NOT NULL,
	"bowler_id" uuid NOT NULL,
	"striker_id" uuid NOT NULL,
	"non_striker_id" uuid NOT NULL,
	"runs_batsman" smallint DEFAULT 0 NOT NULL,
	"runs_extras" smallint DEFAULT 0 NOT NULL,
	"extra_type" varchar(10),
	"total_runs" smallint DEFAULT 0 NOT NULL,
	"is_free_hit" boolean DEFAULT false NOT NULL,
	"is_wicket" boolean DEFAULT false NOT NULL,
	"wicket_type" varchar(20),
	"dismissed_id" uuid,
	"fielder_ids" uuid[],
	"is_retired_hurt" boolean DEFAULT false NOT NULL,
	"shot_type" varchar(30),
	"landing_x" numeric(6, 3),
	"landing_y" numeric(6, 3),
	"wagon_x" numeric(6, 3),
	"wagon_y" numeric(6, 3),
	"pace_kmh" numeric(5, 1),
	"swing_type" varchar(20),
	"innings_score" integer DEFAULT 0 NOT NULL,
	"innings_wickets" integer DEFAULT 0 NOT NULL,
	"innings_overs" varchar(10) DEFAULT '0.0' NOT NULL,
	"run_rate" numeric(5, 2) DEFAULT '0' NOT NULL,
	"commentary_id" uuid,
	"undo_stack_pos" integer NOT NULL,
	"is_overridden" boolean DEFAULT false NOT NULL,
	"override_of_id" uuid,
	"timestamp" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fielding_scorecard" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"innings_id" uuid NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"catches" integer DEFAULT 0 NOT NULL,
	"run_outs" integer DEFAULT 0 NOT NULL,
	"stumpings" integer DEFAULT 0 NOT NULL,
	"direct_hits" integer DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_field_innings_player" UNIQUE("innings_id","player_id")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "innings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"innings_number" smallint NOT NULL,
	"batting_team_id" uuid NOT NULL,
	"bowling_team_id" uuid NOT NULL,
	"is_super_over" boolean DEFAULT false NOT NULL,
	"total_runs" integer DEFAULT 0 NOT NULL,
	"total_wickets" integer DEFAULT 0 NOT NULL,
	"total_overs" numeric(5, 1) DEFAULT '0' NOT NULL,
	"total_extras" integer DEFAULT 0 NOT NULL,
	"declared" boolean DEFAULT false NOT NULL,
	"follow_on" boolean DEFAULT false NOT NULL,
	"all_out" boolean DEFAULT false NOT NULL,
	"target_score" integer,
	"status" varchar(20) DEFAULT 'not_started' NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	CONSTRAINT "uq_match_innings" UNIQUE("match_id","innings_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tournament_id" uuid,
	"format_config_id" uuid NOT NULL,
	"match_number" integer,
	"venue" varchar(300),
	"city" varchar(100),
	"country" varchar(100),
	"scheduled_start" timestamp with time zone,
	"actual_start" timestamp with time zone,
	"actual_end" timestamp with time zone,
	"status" varchar(20) DEFAULT 'scheduled' NOT NULL,
	"toss_winner_team_id" uuid,
	"toss_decision" varchar(10),
	"result_summary" text,
	"winner_team_id" uuid,
	"win_margin_runs" integer,
	"win_margin_wickets" integer,
	"is_dls_applied" boolean DEFAULT false,
	"dls_par_score" integer,
	"match_officials" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_format_config" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(50) NOT NULL,
	"overs_per_innings" integer,
	"innings_per_side" integer NOT NULL,
	"max_bowler_overs" integer,
	"powerplay_config" jsonb,
	"has_super_over" boolean DEFAULT false,
	"has_dls" boolean DEFAULT false,
	"has_follow_on" boolean DEFAULT false,
	"balls_per_over" integer DEFAULT 6 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "match_team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"designation" varchar(10) NOT NULL,
	"playing_xi" uuid[]
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "media_tag" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"delivery_id" uuid,
	"innings_id" uuid,
	"match_id" uuid NOT NULL,
	"media_type" varchar(20) NOT NULL,
	"source_url" text NOT NULL,
	"thumbnail_url" text,
	"start_timestamp_ms" bigint,
	"end_timestamp_ms" bigint,
	"title" varchar(300),
	"description" text,
	"tags" text[],
	"auto_generated" boolean DEFAULT false,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "over" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"innings_id" uuid NOT NULL,
	"over_number" smallint NOT NULL,
	"bowler_id" uuid NOT NULL,
	"runs_conceded" integer DEFAULT 0 NOT NULL,
	"wickets_taken" integer DEFAULT 0 NOT NULL,
	"maidens" boolean DEFAULT false NOT NULL,
	"legal_balls" smallint DEFAULT 0 NOT NULL,
	"total_balls" smallint DEFAULT 0 NOT NULL,
	CONSTRAINT "uq_innings_over" UNIQUE("innings_id","over_number")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"first_name" varchar(100) NOT NULL,
	"last_name" varchar(100) NOT NULL,
	"date_of_birth" date,
	"batting_style" varchar(20),
	"bowling_style" varchar(40),
	"primary_role" varchar(20),
	"profile_image" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "player_team_membership" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"player_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"jersey_number" integer,
	"role_in_team" varchar(30),
	"joined_at" date NOT NULL,
	"left_at" date,
	"is_active" boolean DEFAULT true NOT NULL,
	CONSTRAINT "uq_player_team_joined" UNIQUE("player_id","team_id","joined_at")
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "review" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"innings_id" uuid NOT NULL,
	"delivery_id" uuid NOT NULL,
	"reviewing_team_id" uuid NOT NULL,
	"review_number" smallint NOT NULL,
	"status" varchar(20) DEFAULT 'pending' NOT NULL,
	"original_decision" jsonb NOT NULL,
	"revised_decision" jsonb,
	"wicket_reversed" boolean DEFAULT false NOT NULL,
	"runs_changed" boolean DEFAULT false NOT NULL,
	"unsuccessful" boolean DEFAULT false NOT NULL,
	"requested_at" timestamp with time zone DEFAULT now() NOT NULL,
	"resolved_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "substitution" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"team_id" uuid NOT NULL,
	"type" varchar(20) NOT NULL,
	"player_out_id" uuid NOT NULL,
	"player_in_id" uuid NOT NULL,
	"reason" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(200) NOT NULL,
	"short_name" varchar(10),
	"logo_url" text,
	"country" varchar(100),
	"team_type" varchar(20) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "tournament" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"name" varchar(300) NOT NULL,
	"short_name" varchar(30),
	"season" varchar(20),
	"format" varchar(20) NOT NULL,
	"start_date" date,
	"end_date" date,
	"organizer" varchar(200),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_user" ADD CONSTRAINT "app_user_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "app_user" ADD CONSTRAINT "app_user_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batting_scorecard" ADD CONSTRAINT "batting_scorecard_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "public"."innings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batting_scorecard" ADD CONSTRAINT "batting_scorecard_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batting_scorecard" ADD CONSTRAINT "batting_scorecard_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batting_scorecard" ADD CONSTRAINT "batting_scorecard_dismissed_by_id_player_id_fk" FOREIGN KEY ("dismissed_by_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "batting_scorecard" ADD CONSTRAINT "batting_scorecard_fielder_id_player_id_fk" FOREIGN KEY ("fielder_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bowling_scorecard" ADD CONSTRAINT "bowling_scorecard_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "public"."innings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bowling_scorecard" ADD CONSTRAINT "bowling_scorecard_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "bowling_scorecard" ADD CONSTRAINT "bowling_scorecard_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commentary" ADD CONSTRAINT "commentary_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "commentary" ADD CONSTRAINT "commentary_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "public"."innings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_over_id_over_id_fk" FOREIGN KEY ("over_id") REFERENCES "public"."over"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_bowler_id_player_id_fk" FOREIGN KEY ("bowler_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_striker_id_player_id_fk" FOREIGN KEY ("striker_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_non_striker_id_player_id_fk" FOREIGN KEY ("non_striker_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_dismissed_id_player_id_fk" FOREIGN KEY ("dismissed_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "delivery" ADD CONSTRAINT "delivery_override_of_id_delivery_id_fk" FOREIGN KEY ("override_of_id") REFERENCES "public"."delivery"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fielding_scorecard" ADD CONSTRAINT "fielding_scorecard_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "public"."innings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fielding_scorecard" ADD CONSTRAINT "fielding_scorecard_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fielding_scorecard" ADD CONSTRAINT "fielding_scorecard_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "innings" ADD CONSTRAINT "innings_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "innings" ADD CONSTRAINT "innings_batting_team_id_team_id_fk" FOREIGN KEY ("batting_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "innings" ADD CONSTRAINT "innings_bowling_team_id_team_id_fk" FOREIGN KEY ("bowling_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match" ADD CONSTRAINT "match_tournament_id_tournament_id_fk" FOREIGN KEY ("tournament_id") REFERENCES "public"."tournament"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match" ADD CONSTRAINT "match_format_config_id_match_format_config_id_fk" FOREIGN KEY ("format_config_id") REFERENCES "public"."match_format_config"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match" ADD CONSTRAINT "match_toss_winner_team_id_team_id_fk" FOREIGN KEY ("toss_winner_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match" ADD CONSTRAINT "match_winner_team_id_team_id_fk" FOREIGN KEY ("winner_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_team" ADD CONSTRAINT "match_team_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "match_team" ADD CONSTRAINT "match_team_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_tag" ADD CONSTRAINT "media_tag_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_tag" ADD CONSTRAINT "media_tag_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "public"."innings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "media_tag" ADD CONSTRAINT "media_tag_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "over" ADD CONSTRAINT "over_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "public"."innings"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "over" ADD CONSTRAINT "over_bowler_id_player_id_fk" FOREIGN KEY ("bowler_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_team_membership" ADD CONSTRAINT "player_team_membership_player_id_player_id_fk" FOREIGN KEY ("player_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "player_team_membership" ADD CONSTRAINT "player_team_membership_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review" ADD CONSTRAINT "review_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review" ADD CONSTRAINT "review_innings_id_innings_id_fk" FOREIGN KEY ("innings_id") REFERENCES "public"."innings"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review" ADD CONSTRAINT "review_delivery_id_delivery_id_fk" FOREIGN KEY ("delivery_id") REFERENCES "public"."delivery"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "review" ADD CONSTRAINT "review_reviewing_team_id_team_id_fk" FOREIGN KEY ("reviewing_team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "substitution" ADD CONSTRAINT "substitution_match_id_match_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."match"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "substitution" ADD CONSTRAINT "substitution_team_id_team_id_fk" FOREIGN KEY ("team_id") REFERENCES "public"."team"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "substitution" ADD CONSTRAINT "substitution_player_out_id_player_id_fk" FOREIGN KEY ("player_out_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "substitution" ADD CONSTRAINT "substitution_player_in_id_player_id_fk" FOREIGN KEY ("player_in_id") REFERENCES "public"."player"("id") ON DELETE no action ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bat_sc_player" ON "batting_scorecard" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bat_sc_innings" ON "batting_scorecard" USING btree ("innings_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bowl_sc_player" ON "bowling_scorecard" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_bowl_sc_innings" ON "bowling_scorecard" USING btree ("innings_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commentary_delivery" ON "commentary" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commentary_match" ON "commentary" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_commentary_milestone" ON "commentary" USING btree ("milestone");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_match" ON "delivery" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_innings" ON "delivery" USING btree ("innings_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_over" ON "delivery" USING btree ("over_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_striker" ON "delivery" USING btree ("striker_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_bowler" ON "delivery" USING btree ("bowler_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_undo_stack" ON "delivery" USING btree ("innings_id","undo_stack_pos");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_delivery_overridden" ON "delivery" USING btree ("is_overridden");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_innings_match" ON "innings" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_match_tournament" ON "match" USING btree ("tournament_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_match_status" ON "match" USING btree ("status");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_match_team_match" ON "match_team" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_media_delivery" ON "media_tag" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_media_match" ON "media_tag" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_over_innings" ON "over" USING btree ("innings_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_over_bowler" ON "over" USING btree ("bowler_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ptm_player" ON "player_team_membership" USING btree ("player_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_ptm_team" ON "player_team_membership" USING btree ("team_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_review_match" ON "review" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_review_delivery" ON "review" USING btree ("delivery_id");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_substitution_match" ON "substitution" USING btree ("match_id");