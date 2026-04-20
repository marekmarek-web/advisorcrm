-- 2026-04-20 · Osobní příplatek k sazbě BJ (výjimka nad kariérní pozici)
--
-- Cíl: poradce může mít individuální navýšení Kč za 1 BJ (např. +5 Kč) vedle
-- hodnoty ze sazebníku `career_position_coefficients`. Produční přehled
-- počítá BJ → Kč jako (bj_value_czk z pozice + career_bj_bonus_czk).
--
-- Idempotentní: IF NOT EXISTS.

ALTER TABLE advisor_preferences
  ADD COLUMN IF NOT EXISTS career_bj_bonus_czk numeric(10, 2);

COMMENT ON COLUMN advisor_preferences.career_bj_bonus_czk IS
  'Volitelný příplatek v Kč za 1 BJ k hodnotě z career_position_key (osobní výjimka / dohodnutý bonus). NULL = bez příplatku.';
