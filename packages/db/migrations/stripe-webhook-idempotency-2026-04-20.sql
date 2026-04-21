-- 2026-04-20 · QA Sweep Batch 6 — Stripe webhook idempotency hardening
--
-- Historická úroveň idempotence v `stripe_webhook_events` byla:
--   1) INSERT ... ON CONFLICT DO NOTHING (event.id PK)
--   2) při výjimce v handleru DELETE řádku, aby Stripe mohl retry.
--
-- Problém: pokud handler selže po částečném sideeffectu (zapíše audit log,
-- upsertne subscription, ale spadne na dalším kroku), DELETE umožní Stripu
-- znovu doručit → duplicitní audit / dunning / trial flip.
--
-- Zavádíme stavový automat pro doručené eventy:
--   processing | completed | failed
-- + sloupce pro chybovou stopu + počet pokusů. Při retry z Stripu přepneme
-- řádek z `failed` zpět na `processing` (logiky v route.ts), ale `completed`
-- eventy jsou už imunní (duplicate := true) — žádný další sideeffect.
--
-- Migrace je idempotentní (IF NOT EXISTS / DO UPDATE) — bezpečně spustitelná
-- v Supabase SQL editoru.

ALTER TABLE public.stripe_webhook_events
  ADD COLUMN IF NOT EXISTS status text NOT NULL DEFAULT 'completed',
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 1,
  ADD COLUMN IF NOT EXISTS last_error text,
  ADD COLUMN IF NOT EXISTS processed_at timestamptz,
  ADD COLUMN IF NOT EXISTS updated_at timestamptz NOT NULL DEFAULT now();

-- Backfill: všechny historické řádky byly doručeny a handler byl (v té době)
-- považován za dokončený — označíme je jako completed a processed_at = received_at.
UPDATE public.stripe_webhook_events
  SET status = 'completed',
      processed_at = COALESCE(processed_at, received_at),
      updated_at = now()
  WHERE status = 'completed' AND processed_at IS NULL;

-- Filtr pro manuální triage nedokončených eventů (watchdog cron / operátor).
CREATE INDEX IF NOT EXISTS idx_stripe_webhook_events_status_updated
  ON public.stripe_webhook_events (status, updated_at DESC);

COMMENT ON COLUMN public.stripe_webhook_events.status IS
  'Stripe webhook idempotence: processing | completed | failed. Completed = handler doběhl, duplicate retry z Stripu je no-op.';
COMMENT ON COLUMN public.stripe_webhook_events.attempts IS
  'Počet pokusů zpracování (auditní). Roste při retry z Stripu po předchozí failure.';
COMMENT ON COLUMN public.stripe_webhook_events.last_error IS
  'Message poslední výjimky (null u completed). Slouží pro operátorský triage.';
