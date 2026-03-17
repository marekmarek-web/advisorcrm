CREATE TABLE IF NOT EXISTS "portal_notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid NOT NULL REFERENCES "contacts"("id") ON DELETE CASCADE,
	"type" text NOT NULL,
	"title" text NOT NULL,
	"body" text,
	"read_at" timestamp with time zone,
	"related_entity_type" text,
	"related_entity_id" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "portal_notifications_contact_read_idx" ON "portal_notifications" USING btree ("contact_id","read_at");
