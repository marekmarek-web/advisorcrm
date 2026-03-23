ALTER TABLE documents ADD COLUMN IF NOT EXISTS document_type text;
ALTER TABLE opportunities ADD COLUMN IF NOT EXISTS awaiting_document boolean DEFAULT false;
ALTER TABLE tasks ADD COLUMN IF NOT EXISTS awaiting_document boolean DEFAULT false;
