ALTER TABLE "documents" ADD COLUMN IF NOT EXISTS "sensitive" boolean DEFAULT false;
