-- Audit and lifecycle for client portal invitations (run on Supabase / apply with db tooling).
ALTER TABLE client_invitations
  ADD COLUMN IF NOT EXISTS invited_by_user_id text,
  ADD COLUMN IF NOT EXISTS email_sent_at timestamptz,
  ADD COLUMN IF NOT EXISTS last_email_error text,
  ADD COLUMN IF NOT EXISTS revoked_at timestamptz;
