CREATE TABLE "similarity_flags" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"match_id" uuid NOT NULL,
	"user_a" uuid NOT NULL,
	"user_b" uuid NOT NULL,
	"score" double precision NOT NULL,
	"flagged" boolean DEFAULT false NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "benchmark_ms" integer;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "paste_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "submissions" ADD COLUMN "largest_paste" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "similarity_flags" ADD CONSTRAINT "similarity_flags_match_id_matches_id_fk" FOREIGN KEY ("match_id") REFERENCES "public"."matches"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "similarity_flags" ADD CONSTRAINT "similarity_flags_user_a_users_id_fk" FOREIGN KEY ("user_a") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "similarity_flags" ADD CONSTRAINT "similarity_flags_user_b_users_id_fk" FOREIGN KEY ("user_b") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "similarity_flags_match_idx" ON "similarity_flags" USING btree ("match_id");--> statement-breakpoint
CREATE INDEX "similarity_flags_flagged_idx" ON "similarity_flags" USING btree ("flagged");--> statement-breakpoint
-- Hand-added: drizzle can't express NULLS NOT DISTINCT (schema.ts ratings TODO).
-- Without it Postgres treats (user, mode, NULL) rows as distinct, so the
-- cross-language ladder (language = NULL) would duplicate and rating upserts
-- would break. PG16+ supports NULLS NOT DISTINCT on unique indexes.
DROP INDEX "ratings_user_mode_language_uq";--> statement-breakpoint
CREATE UNIQUE INDEX "ratings_user_mode_language_uq" ON "ratings" USING btree ("user_id","mode","language") NULLS NOT DISTINCT;