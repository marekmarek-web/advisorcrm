-- Fondová knihovna: advisor_preferences.fund_library + fronta fund_add_requests
-- (stejné jako packages/db/migrations/fund_library_settings_2026-04-06.sql + normalizace stavů)

ALTER TABLE "advisor_preferences" ADD COLUMN IF NOT EXISTS "fund_library" jsonb;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fund_add_requests" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"user_id" text NOT NULL,
	"fund_name" text NOT NULL,
	"provider" text,
	"isin_or_ticker" text,
	"factsheet_url" text,
	"category" text,
	"note" text,
	"status" text DEFAULT 'new' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fund_add_requests" ADD CONSTRAINT "fund_add_requests_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fund_add_requests_tenant_created_idx" ON "fund_add_requests" ("tenant_id", "created_at" DESC);
--> statement-breakpoint
UPDATE "fund_add_requests" SET "status" = 'in_progress' WHERE "status" IN ('under_review', 'need_info');
--> statement-breakpoint
UPDATE "fund_add_requests" SET "status" = 'added' WHERE "status" = 'approved';
--> statement-breakpoint
UPDATE "fund_add_requests" SET "status" = 'new' WHERE "status" NOT IN ('new', 'in_progress', 'added', 'rejected');
