CREATE TYPE "public"."difficulty" AS ENUM('easy', 'medium', 'hard');--> statement-breakpoint
CREATE TYPE "public"."game_mode" AS ENUM('speed_race', 'fastest_runtime', 'code_golf', 'memory_golf', 'scaling_duel', 'blitz');--> statement-breakpoint
CREATE TYPE "public"."language" AS ENUM('python', 'cpp', 'javascript', 'java', 'go', 'rust');--> statement-breakpoint
CREATE TYPE "public"."match_status" AS ENUM('queued', 'matched', 'countdown', 'live', 'judging', 'finished', 'abandoned');--> statement-breakpoint
CREATE TYPE "public"."problem_status" AS ENUM('draft', 'published', 'archived');--> statement-breakpoint
CREATE TYPE "public"."submission_status" AS ENUM('pending', 'running', 'done');--> statement-breakpoint
CREATE TYPE "public"."verdict" AS ENUM('accepted', 'wrong_answer', 'time_limit_exceeded', 'memory_limit_exceeded', 'runtime_error', 'compile_error', 'output_limit_exceeded', 'internal_error');--> statement-breakpoint
CREATE TABLE "match_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"seq" integer NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb NOT NULL,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "match_players" (
	"match_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"result" text,
	"rating_before" double precision,
	"rating_after" double precision,
	"joined_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "match_players_match_id_user_id_pk" PRIMARY KEY("match_id","user_id")
);
--> statement-breakpoint
CREATE TABLE "matches" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"mode" "game_mode" NOT NULL,
	"language" "language",
	"problem_id" uuid,
	"status" "match_status" DEFAULT 'queued' NOT NULL,
	"config" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"started_at" timestamp with time zone,
	"ended_at" timestamp with time zone,
	"winner_id" uuid,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "problems" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"title" text NOT NULL,
	"difficulty" "difficulty" NOT NULL,
	"statement_md" text NOT NULL,
	"io_spec" text,
	"tags" text[] DEFAULT '{}' NOT NULL,
	"starter_code" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"limits" jsonb NOT NULL,
	"generator_uri" text,
	"checker_uri" text,
	"status" "problem_status" DEFAULT 'draft' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "problems_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "ratings" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"mode" "game_mode" NOT NULL,
	"language" "language",
	"rating" double precision DEFAULT 1500 NOT NULL,
	"rd" double precision DEFAULT 350 NOT NULL,
	"volatility" double precision DEFAULT 0.06 NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "submissions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid,
	"user_id" uuid NOT NULL,
	"problem_id" uuid NOT NULL,
	"language" "language" NOT NULL,
	"source_uri" text,
	"source_inline" text,
	"bytes" integer NOT NULL,
	"status" "submission_status" DEFAULT 'pending' NOT NULL,
	"verdict" "verdict",
	"time_ms" integer,
	"memory_kb" integer,
	"tier_reached" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "test_cases" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"problem_id" uuid NOT NULL,
	"ordinal" integer NOT NULL,
	"input_uri" text,
	"expected_uri" text,
	"input_inline" text,
	"expected_inline" text,
	"is_public" boolean DEFAULT false NOT NULL,
	"tier" integer DEFAULT 0 NOT NULL,
	"weight" double precision DEFAULT 1 NOT NULL
);
--> statement-breakpoint
CREATE TABLE "users" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"handle" text NOT NULL,
	"email" text NOT NULL,
	"avatar_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "users_handle_unique" UNIQUE("handle"),
	CONSTRAINT "users_email_unique" UNIQUE("email")
);
--> statement-breakpoint
ALTER TABLE "match_events" ADD CONSTRAINT "match_events_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "match_players" ADD CONSTRAINT "match_players_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "matches" ADD CONSTRAINT "matches_winner_id_users_id_fk" FOREIGN KEY ("winner_id") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "ratings" ADD CONSTRAINT "ratings_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "submissions" ADD CONSTRAINT "submissions_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "test_cases" ADD CONSTRAINT "test_cases_problem_id_problems_id_fk" FOREIGN KEY ("problem_id") REFERENCES "public"."problems"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "match_events_match_seq_uq" ON "match_events" USING btree ("match_id","seq");--> statement-breakpoint
CREATE INDEX "match_players_user_idx" ON "match_players" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "matches_status_idx" ON "matches" USING btree ("status");--> statement-breakpoint
CREATE INDEX "matches_problem_idx" ON "matches" USING btree ("problem_id");--> statement-breakpoint
CREATE INDEX "problems_difficulty_idx" ON "problems" USING btree ("difficulty");--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_user_mode_language_uq" ON "ratings" USING btree ("user_id","mode","language");--> statement-breakpoint
CREATE INDEX "submissions_match_idx" ON "submissions" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "submissions_user_idx" ON "submissions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "submissions_problem_idx" ON "submissions" USING btree ("problem_id");--> statement-breakpoint
CREATE UNIQUE INDEX "test_cases_problem_ordinal_uq" ON "test_cases" USING btree ("problem_id","ordinal");--> statement-breakpoint
CREATE INDEX "test_cases_problem_idx" ON "test_cases" USING btree ("problem_id");