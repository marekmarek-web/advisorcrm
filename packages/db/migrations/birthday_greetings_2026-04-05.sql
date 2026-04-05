-- Birthday greetings: contact salutation fields + advisor email prefs.
-- Idempotent (IF NOT EXISTS). Run in Supabase SQL Editor or via your migration runner.

ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_salutation text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS preferred_greeting_name text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS greeting_style text;
ALTER TABLE contacts ADD COLUMN IF NOT EXISTS birth_greeting_opt_out boolean NOT NULL DEFAULT false;

ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS birthday_signature_name text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS birthday_signature_role text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS birthday_reply_to_email text;
ALTER TABLE advisor_preferences ADD COLUMN IF NOT EXISTS birthday_email_theme text;
