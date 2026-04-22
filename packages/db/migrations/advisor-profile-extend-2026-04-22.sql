-- Advisor profile extend — doplnění polí do `advisor_preferences` pro konsolidované
-- "Osobní údaje" v nastavení (mobile + desktop).
-- Datum: 2026-04-22
--
-- Rozsah:
--   * dic            (DIČ pro poradce jako fyzickou osobu — workspace fakturace
--                    zůstává v `tenants`/`tenant_settings`).
--   * license_number (ČNB / MNA registrační číslo).
--   * public_title   (volitelný veřejný titul / pozice, např.
--                    "Hypoteční specialista").
--   * bio            (krátký medailonek do reportu / veřejného profilu, 280 znaků).
--   * locale         (preferovaný jazyk UI — cs/sk/en; default cs).
--   * timezone       (IANA tz, default Europe/Prague).
--
-- Bez IF NOT EXISTS by migrace byla v konfliktu při re-runu; všechny ALTERy jsou
-- idempotentní a bez backfillu.

ALTER TABLE advisor_preferences
  ADD COLUMN IF NOT EXISTS dic text,
  ADD COLUMN IF NOT EXISTS license_number text,
  ADD COLUMN IF NOT EXISTS public_title text,
  ADD COLUMN IF NOT EXISTS bio text,
  ADD COLUMN IF NOT EXISTS locale text DEFAULT 'cs',
  ADD COLUMN IF NOT EXISTS timezone text DEFAULT 'Europe/Prague';

COMMENT ON COLUMN advisor_preferences.dic IS 'DIČ poradce (fyzická osoba). Workspace fakturace zůstává v tenants.';
COMMENT ON COLUMN advisor_preferences.license_number IS 'ČNB / MNA registrační číslo poradce.';
COMMENT ON COLUMN advisor_preferences.public_title IS 'Veřejná pozice / titul v reportu (např. "Hypoteční specialista").';
COMMENT ON COLUMN advisor_preferences.bio IS 'Krátký medailonek (max 280 znaků) pro report / public profile.';
COMMENT ON COLUMN advisor_preferences.locale IS 'Preferovaný jazyk UI (cs/sk/en).';
COMMENT ON COLUMN advisor_preferences.timezone IS 'IANA timezone pro kalendář / notifikace.';
