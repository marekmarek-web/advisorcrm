-- Portal + FA: advisor_preferences, fa_plan_items, tasks.analysis_id, extended events.
-- Idempotent for DBs that only ran older supabase-schema.sql or missed objects in Sentry.

CREATE TABLE IF NOT EXISTS "financial_analyses" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid,
	"household_id" uuid,
	"company_id" uuid,
	"primary_contact_id" uuid,
	"type" text DEFAULT 'financial' NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"source_type" text DEFAULT 'native' NOT NULL,
	"version" integer DEFAULT 1 NOT NULL,
	"payload" jsonb NOT NULL,
	"created_by" text,
	"updated_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"last_exported_at" timestamp with time zone,
	"linked_company_id" uuid,
	"last_refreshed_from_shared_at" timestamp with time zone
);
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advisor_preferences" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"tenant_id" uuid NOT NULL,
	"quick_actions" jsonb,
	"avatar_url" text,
	"phone" text,
	"website" text,
	"report_logo_url" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "advisor_preferences_tenant_user" UNIQUE("tenant_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "advisor_preferences" ADD COLUMN IF NOT EXISTS "quick_actions" jsonb;
ALTER TABLE "advisor_preferences" ADD COLUMN IF NOT EXISTS "avatar_url" text;
ALTER TABLE "advisor_preferences" ADD COLUMN IF NOT EXISTS "phone" text;
ALTER TABLE "advisor_preferences" ADD COLUMN IF NOT EXISTS "website" text;
ALTER TABLE "advisor_preferences" ADD COLUMN IF NOT EXISTS "report_logo_url" text;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "advisor_preferences" ADD CONSTRAINT "advisor_preferences_tenant_id_tenants_id_fk" FOREIGN KEY ("tenant_id") REFERENCES "public"."tenants"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "analysis_id" uuid;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "event_type" text DEFAULT 'schuzka';
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "reminder_at" timestamp with time zone;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "status" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "notes" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "meeting_link" text;
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "task_id" uuid;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "tasks" ADD CONSTRAINT "tasks_analysis_id_financial_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."financial_analyses"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "events" ADD CONSTRAINT "events_task_id_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."tasks"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "fa_plan_items" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"analysis_id" uuid NOT NULL,
	"contact_id" uuid,
	"opportunity_id" uuid,
	"item_type" text NOT NULL,
	"item_key" text,
	"segment_code" text,
	"label" text,
	"provider" text,
	"amount_monthly" numeric(14, 2),
	"amount_annual" numeric(14, 2),
	"status" text DEFAULT 'recommended' NOT NULL,
	"source_payload" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "fa_plan_items_analysis_idx" ON "fa_plan_items" ("analysis_id");
CREATE INDEX IF NOT EXISTS "fa_plan_items_contact_idx" ON "fa_plan_items" ("contact_id");
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fa_plan_items" ADD CONSTRAINT "fa_plan_items_analysis_id_financial_analyses_id_fk" FOREIGN KEY ("analysis_id") REFERENCES "public"."financial_analyses"("id") ON DELETE cascade ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fa_plan_items" ADD CONSTRAINT "fa_plan_items_contact_id_contacts_id_fk" FOREIGN KEY ("contact_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
--> statement-breakpoint
DO $$ BEGIN
 ALTER TABLE "fa_plan_items" ADD CONSTRAINT "fa_plan_items_opportunity_id_opportunities_id_fk" FOREIGN KEY ("opportunity_id") REFERENCES "public"."opportunities"("id") ON DELETE set null ON UPDATE no action;
EXCEPTION
 WHEN duplicate_object THEN null;
END $$;
