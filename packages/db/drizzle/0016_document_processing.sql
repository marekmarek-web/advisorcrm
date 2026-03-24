-- Document processing pipeline: extends documents table + creates processing jobs table.

ALTER TABLE "documents"
  ADD COLUMN IF NOT EXISTS "page_count" integer,
  ADD COLUMN IF NOT EXISTS "captured_platform" text,
  ADD COLUMN IF NOT EXISTS "has_text_layer" boolean,
  ADD COLUMN IF NOT EXISTS "is_scan_like" boolean,
  ADD COLUMN IF NOT EXISTS "processing_provider" text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "processing_status" text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "processing_stage" text DEFAULT 'none',
  ADD COLUMN IF NOT EXISTS "processing_error" text,
  ADD COLUMN IF NOT EXISTS "processing_started_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "processing_finished_at" timestamp with time zone,
  ADD COLUMN IF NOT EXISTS "ocr_pdf_path" text,
  ADD COLUMN IF NOT EXISTS "markdown_path" text,
  ADD COLUMN IF NOT EXISTS "markdown_content" text,
  ADD COLUMN IF NOT EXISTS "extract_json_path" text,
  ADD COLUMN IF NOT EXISTS "ai_input_source" text DEFAULT 'none';

CREATE TABLE IF NOT EXISTS "document_processing_jobs" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
  "document_id" uuid NOT NULL REFERENCES "documents"("id") ON DELETE CASCADE,
  "tenant_id" uuid NOT NULL,
  "provider" text NOT NULL,
  "job_type" text NOT NULL,
  "status" text NOT NULL DEFAULT 'queued',
  "requested_by" text,
  "started_at" timestamp with time zone,
  "finished_at" timestamp with time zone,
  "error_message" text,
  "provider_job_id" text,
  "input_path" text,
  "output_path" text,
  "output_metadata" jsonb,
  "attempt_number" integer DEFAULT 1,
  "created_at" timestamp with time zone DEFAULT now() NOT NULL,
  "updated_at" timestamp with time zone DEFAULT now() NOT NULL
);

CREATE INDEX IF NOT EXISTS "idx_dpj_document_id" ON "document_processing_jobs" ("document_id");
CREATE INDEX IF NOT EXISTS "idx_dpj_status" ON "document_processing_jobs" ("status");
CREATE INDEX IF NOT EXISTS "idx_documents_processing_status" ON "documents" ("processing_status");
