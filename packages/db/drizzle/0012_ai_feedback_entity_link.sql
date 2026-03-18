ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS created_entity_type text;
ALTER TABLE ai_feedback ADD COLUMN IF NOT EXISTS created_entity_id text;
