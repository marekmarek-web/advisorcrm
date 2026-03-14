-- Zápisky mohou být „Obecný zápisek“ bez přiřazeného kontaktu.
-- Spusťte v Supabase SQL Editoru, pokud při přidání zápisku dostanete:
--   null value in column "contact_id" of relation "meeting_notes" violates not-null constraint

ALTER TABLE meeting_notes
  ALTER COLUMN contact_id DROP NOT NULL;
