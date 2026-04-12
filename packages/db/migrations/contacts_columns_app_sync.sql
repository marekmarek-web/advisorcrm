-- contacts: sloupce, které aplikace očekává (createContact, seznamy, archiv).
-- Spusť v Supabase SQL Editoru při chybě 42703 / „chybí sloupec“ při zakládání klienta.
-- Idempotentní (IF NOT EXISTS).

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS referral_source text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS referral_contact_id uuid;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birth_date date;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS personal_id text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS id_card_number text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS street text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS city text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS zip text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS tags text[];
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lifecycle_stage text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS lead_source_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS priority text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS avatar_url text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS notification_unsubscribed_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS gdpr_consent_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS service_cycle_months text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS last_service_date date;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS next_service_due date;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_at timestamptz;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS archived_reason text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_channel text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_email boolean NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS do_not_push boolean NOT NULL DEFAULT false;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS best_contact_time text;
