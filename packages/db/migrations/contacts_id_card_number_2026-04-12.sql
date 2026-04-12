-- contacts.id_card_number — číslo občanského průkazu (volitelné).
-- Idempotentní: spusť v Supabase SQL Editoru při nasazení.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS id_card_number text;
