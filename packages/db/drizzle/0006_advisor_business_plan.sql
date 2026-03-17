CREATE TABLE IF NOT EXISTS "advisor_business_plans" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL,
	"period_type" text NOT NULL,
	"year" integer NOT NULL,
	"period_number" integer NOT NULL,
	"title" text,
	"status" text DEFAULT 'active' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "advisor_business_plans_tenant_user_period_unique" ON "advisor_business_plans" USING btree ("tenant_id","user_id","period_type","year","period_number");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "advisor_business_plan_targets" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"plan_id" uuid NOT NULL REFERENCES "advisor_business_plans"("id") ON DELETE CASCADE,
	"metric_type" text NOT NULL,
	"target_value" numeric(18, 2) NOT NULL,
	"unit" text DEFAULT 'count' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
