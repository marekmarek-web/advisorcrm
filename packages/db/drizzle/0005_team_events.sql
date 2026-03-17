CREATE TABLE IF NOT EXISTS "team_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"event_type" text DEFAULT 'schuzka',
	"start_at" timestamp with time zone NOT NULL,
	"end_at" timestamp with time zone,
	"all_day" boolean DEFAULT false,
	"location" text,
	"notes" text,
	"meeting_link" text,
	"reminder_at" timestamp with time zone,
	"target_type" text NOT NULL,
	"target_user_ids" text[] NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "team_tasks" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL REFERENCES "tenants"("id") ON DELETE CASCADE,
	"created_by" text NOT NULL,
	"title" text NOT NULL,
	"description" text,
	"due_date" timestamp with time zone,
	"target_type" text NOT NULL,
	"target_user_ids" text[] NOT NULL,
	"cancelled_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN IF NOT EXISTS "team_event_id" uuid REFERENCES "team_events"("id") ON DELETE SET NULL;--> statement-breakpoint
ALTER TABLE "tasks" ADD COLUMN IF NOT EXISTS "team_task_id" uuid REFERENCES "team_tasks"("id") ON DELETE SET NULL;
