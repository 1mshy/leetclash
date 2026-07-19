ALTER TABLE "problems" ADD COLUMN "generator_source" text;--> statement-breakpoint
ALTER TABLE "problems" ADD COLUMN "reference_solutions" jsonb DEFAULT '{}'::jsonb NOT NULL;