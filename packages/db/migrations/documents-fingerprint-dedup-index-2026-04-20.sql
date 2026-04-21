-- 2026-04-20 · Document intake dedup: index pro `documentFingerprint` lookup
--
-- Důvod: Forensic audit document intake (batch C1+C5) aktivoval skutečnou
-- deduplikaci v `/api/documents/upload` a `/api/documents/quick-upload`.
-- Před každým nahráním do Supabase Storage se v tabulce `documents` hledá
-- existující řádek ve scopu `(tenant_id, contact_id, document_fingerprint)`
-- a `archived_at IS NULL`. Bez indexu by šlo o full table scan.
--
-- Index je **partial** — neindexujeme archivované ani řádky bez fingerprintu.
-- Tím výrazně zmenšíme jeho velikost pro tenanty s velkým document trezorem.
--
-- Spouštět v Supabase SQL editoru; je idempotentní (IF NOT EXISTS).

CREATE INDEX IF NOT EXISTS idx_documents_fingerprint_dedup
  ON public.documents (tenant_id, document_fingerprint, contact_id)
  WHERE document_fingerprint IS NOT NULL AND archived_at IS NULL;

-- Ověření (volitelné):
-- SELECT indexname FROM pg_indexes
--   WHERE schemaname='public' AND tablename='documents'
--     AND indexname='idx_documents_fingerprint_dedup';
