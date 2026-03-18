-- Vision goals for business plan (personal milestones).
-- Run once (e.g. Supabase SQL Editor or: psql $DATABASE_URL -f packages/db/migrations/advisor_vision_goals.sql)

CREATE TABLE IF NOT EXISTS "advisor_vision_goals" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
  "user_id" text NOT NULL,
  "title" text NOT NULL,
  "progress_pct" integer DEFAULT 0 NOT NULL,
  "sort_order" integer DEFAULT 0 NOT NULL,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "advisor_vision_goals_tenant_user_idx"
  ON "advisor_vision_goals" USING btree ("tenant_id", "user_id");
