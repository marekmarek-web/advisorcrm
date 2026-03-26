-- AI Review: fine-grained pipeline stage for polling UI (optional text).
ALTER TABLE contract_upload_reviews
  ADD COLUMN IF NOT EXISTS processing_stage text;

COMMENT ON COLUMN contract_upload_reviews.processing_stage IS 'Pipeline sub-step label while processingStatus=processing (e.g. classifying, extracting).';
