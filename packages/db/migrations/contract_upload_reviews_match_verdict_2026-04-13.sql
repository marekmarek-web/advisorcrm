-- Additive migration: add match_verdict column to contract_upload_reviews.
-- Values: existing_match | near_match | ambiguous_match | no_match | NULL (legacy rows).
-- NULL means the row was created before verdict model was introduced; legacy behavior applies.

ALTER TABLE contract_upload_reviews
  ADD COLUMN IF NOT EXISTS match_verdict text;
