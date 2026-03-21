ALTER TABLE "contract_upload_reviews"
  ADD COLUMN "document_intent" text,
  ADD COLUMN "section_sensitivity" jsonb,
  ADD COLUMN "relationship_inference" jsonb;
