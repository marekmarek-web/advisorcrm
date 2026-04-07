-- Volitelná pole pro document builder (fáze 6 rozšíření): firemní pojistník, poznámka, datum PU, místo…
ALTER TABLE termination_requests
  ADD COLUMN IF NOT EXISTS document_builder_extras JSONB NOT NULL DEFAULT '{}'::jsonb;

COMMENT ON COLUMN termination_requests.document_builder_extras IS 'JSON: policyholderKind, companyName, authorizedPerson*, advisorNoteForReview, claimEventDate, placeOverride, …';
