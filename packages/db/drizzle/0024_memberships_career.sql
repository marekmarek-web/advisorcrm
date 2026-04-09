-- Kariérní vrstva (odděleně od aplikační role): program, track, pozice.
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "career_program" text;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "career_track" text;
ALTER TABLE "memberships" ADD COLUMN IF NOT EXISTS "career_position_code" text;
