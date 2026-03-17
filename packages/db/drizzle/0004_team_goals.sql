CREATE TABLE IF NOT EXISTS "team_goals" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"period" text NOT NULL,
	"goal_type" text NOT NULL,
	"target_value" integer NOT NULL,
	"year" integer NOT NULL,
	"month" integer NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE UNIQUE INDEX IF NOT EXISTS "team_goals_tenant_period_type_year_month_unique" ON "team_goals" USING btree ("tenant_id","period","goal_type","year","month");
