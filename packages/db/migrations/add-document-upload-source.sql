ALTER TABLE documents
  ADD COLUMN IF NOT EXISTS upload_source text DEFAULT 'web';
