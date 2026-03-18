CREATE TABLE IF NOT EXISTS "document_extractions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
	"tenant_id" uuid NOT NULL,
	"contact_id" uuid REFERENCES "contacts"("id") ON DELETE SET NULL,
	"contract_id" uuid REFERENCES "contracts"("id") ON DELETE SET NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"extracted_at" timestamp with time zone,
	"error_message" text,
	"extraction_trace" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);--> statement-breakpoint
CREATE TABLE IF NOT EXISTS "document_extraction_fields" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"document_extraction_id" uuid NOT NULL REFERENCES "document_extractions"("id") ON DELETE CASCADE,
	"field_key" text NOT NULL,
	"value" jsonb,
	"confidence" numeric(3, 2),
	"source" text DEFAULT 'extraction' NOT NULL,
	"reviewed_at" timestamp with time zone,
	"reviewed_by" text,
	"created_by" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
