-- Sloupce pro propojení událostí s Google Calendar (sync).
-- Spusť v Supabase SQL Editoru nebo: psql $DATABASE_URL -f packages/db/migrations/add_events_google_calendar_fields.sql

ALTER TABLE events
  ADD COLUMN IF NOT EXISTS google_event_id text,
  ADD COLUMN IF NOT EXISTS google_calendar_id text;
