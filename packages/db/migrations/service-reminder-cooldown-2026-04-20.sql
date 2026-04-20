-- 2026-04-20 · Notification hardening (QA Batch 2)
--
-- Cíl: zabránit spamu klientů opakovanými e-mailovými notifikacemi ze strany
-- cronu `service-reminders` a poradcovské akce `processServiceReminders`.
--
-- Přidáváme `last_service_reminder_sent_at` na `contacts`:
--   * aplikace zapisuje timestamp po úspěšném odeslání servisní připomínky,
--   * cron a server action filtrují kontakty, kterým byla připomínka
--     odeslána v posledních 30 dnech.
--
-- Idempotentní: IF NOT EXISTS.

ALTER TABLE public.contacts
  ADD COLUMN IF NOT EXISTS last_service_reminder_sent_at timestamptz;

COMMENT ON COLUMN public.contacts.last_service_reminder_sent_at IS
  'Poslední úspěšně odeslaná servisní připomínka (cron / processServiceReminders). Slouží k 30denní cooldown kontrole, aby se předešlo opakovanému zasílání stejnému kontaktu.';

-- Index pro cron query (LTE today AND (last_sent IS NULL OR last_sent < today-30d)).
CREATE INDEX IF NOT EXISTS idx_contacts_next_service_due_reminder
  ON public.contacts (next_service_due, last_service_reminder_sent_at)
  WHERE next_service_due IS NOT NULL
    AND notification_unsubscribed_at IS NULL;
