ALTER TABLE IF EXISTS contract_upload_reviews
  ADD COLUMN IF NOT EXISTS document_intent text;

ALTER TABLE IF EXISTS contract_upload_reviews
  ADD COLUMN IF NOT EXISTS section_sensitivity jsonb;

ALTER TABLE IF EXISTS contract_upload_reviews
  ADD COLUMN IF NOT EXISTS relationship_inference jsonb;
