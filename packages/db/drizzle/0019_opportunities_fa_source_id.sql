-- Link opportunity to source financial analysis (matches Drizzle opportunities.fa_source_id).
-- Idempotent; run if pipeline detail fails with "column fa_source_id does not exist".

ALTER TABLE "opportunities" ADD COLUMN IF NOT EXISTS "fa_source_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "opportunities" ADD CONSTRAINT "opportunities_fa_source_id_financial_analyses_id_fk" FOREIGN KEY ("fa_source_id") REFERENCES "public"."financial_analyses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "idx_opportunities_fa_source_id" ON "opportunities" ("fa_source_id")
  WHERE "fa_source_id" IS NOT NULL;
