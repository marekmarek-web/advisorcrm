-- Per-advisor toggles for calendar reminder delivery (cron respects; default on).
ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS calendar_reminder_push_enabled boolean NOT NULL DEFAULT true;

ALTER TABLE user_profiles
  ADD COLUMN IF NOT EXISTS calendar_reminder_email_enabled boolean NOT NULL DEFAULT true;
