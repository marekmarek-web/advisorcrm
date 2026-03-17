CREATE TABLE IF NOT EXISTS "ai_generations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"tenant_id" uuid NOT NULL,
	"entity_type" text NOT NULL,
	"entity_id" text NOT NULL,
	"prompt_type" text NOT NULL,
	"prompt_id" text NOT NULL,
	"prompt_version" text,
	"generated_by_user_id" text NOT NULL,
	"output_text" text NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"status" text NOT NULL,
	"context_hash" text
);--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generations_tenant_entity_idx" ON "ai_generations" USING btree ("tenant_id","entity_type","entity_id","prompt_type");--> statement-breakpoint
CREATE INDEX IF NOT EXISTS "ai_generations_tenant_created_idx" ON "ai_generations" USING btree ("tenant_id","created_at");--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "ai_feedback" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"generation_id" uuid NOT NULL REFERENCES "ai_generations"("id") ON DELETE CASCADE,
	"user_id" text NOT NULL,
	"verdict" text NOT NULL,
	"action_taken" text,
	"note" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
