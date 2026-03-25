-- Columns required by listDocuments() / DocumentsHubScreen on legacy databases.
-- Safe to run multiple times (IF NOT EXISTS).

ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_status text DEFAULT 'none';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS processing_stage text DEFAULT 'none';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS ai_input_source text DEFAULT 'none';
ALTER TABLE documents ADD COLUMN IF NOT EXISTS page_count integer;
ALTER TABLE documents ADD COLUMN IF NOT EXISTS is_scan_like boolean;
