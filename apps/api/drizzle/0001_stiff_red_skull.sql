CREATE TYPE "public"."submission_kind" AS ENUM('run', 'submit');--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "kind" "submission_kind" DEFAULT 'submit' NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "tests_passed" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "tests_total" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "detail" text;