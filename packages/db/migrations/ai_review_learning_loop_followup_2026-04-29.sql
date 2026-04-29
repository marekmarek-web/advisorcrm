-- AI Review learning loop follow-up: align event/eval schema with repository contract.
-- Idempotentní a nedestruktivní; opravuje prostředí, kde už proběhla migrace z 2026-04-28.

BEGIN;

ALTER TABLE public.ai_review_correction_events
  ADD COLUMN IF NOT EXISTS superseded_by uuid NULL;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'ai_review_correction_events_superseded_by_fkey'
  ) THEN
    ALTER TABLE public.ai_review_correction_events
      ADD CONSTRAINT ai_review_correction_events_superseded_by_fkey
      FOREIGN KEY (superseded_by)
      REFERENCES public.ai_review_correction_events(id)
      ON DELETE SET NULL;
  END IF;
END $$;

ALTER TABLE public.ai_review_eval_cases
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

CREATE INDEX IF NOT EXISTS ai_review_correction_events_tenant_review_idx
  ON public.ai_review_correction_events (tenant_id, review_id);

CREATE INDEX IF NOT EXISTS ai_review_correction_events_extraction_run_idx
  ON public.ai_review_correction_events (extraction_run_id);

CREATE INDEX IF NOT EXISTS ai_review_correction_events_tenant_scope_idx
  ON public.ai_review_correction_events (tenant_id, institution_name, product_name, document_type);

COMMIT;
