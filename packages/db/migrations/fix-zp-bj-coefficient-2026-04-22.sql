-- 2026-04-22 · Oprava ŽP BJ koeficientu + odstranění LIFE_INSURANCE_SINGLE
--
-- Kontext:
--   add_bj_coefficients_2026-04-20.sql seedoval pro `LIFE_INSURANCE_REGULAR`
--   standardní koeficient `0.10000000` s komentářem „100 BJ / 1 000 Kč".
--   To je ale o řád špatně — správně je **100 BJ / 12 000 Kč ročního
--   pojistného** (= 1/120 ≈ 0.00833333). Aktuální sazba by dělala 1 200 BJ
--   za smlouvu s 12 000 Kč ročně místo 100 (přestřel 12×).
--
--   Dále: kariérní plán nezná „ŽP jednorázové" jako samostatný produkt,
--   jsou jen měsíční/roční platby. Odstraňujeme tedy i řádek
--   `LIFE_INSURANCE_SINGLE`, aby se nepoužíval.
--
-- Idempotence:
--   - UPDATE je bezpečný (match přes unikátní filtr tenant_id NULL + partner_pattern NULL + subtype).
--   - DELETE je bezpečný (match přes product_category, opakované spuštění nic neudělá).
--
-- Po nasazení:
--   1) Promazat process-cache sazebníku (restart workerů nebo počkat TTL 60 s).
--   2) Spustit hromadný recompute BJ (scripts/recompute-all-bj.ts).

BEGIN;

-- ─── 1) Oprava standardního koeficientu ŽP pravidelné ────────────────────
UPDATE bj_coefficients
SET coefficient = 0.00833333,
    note = 'Standard: 100 BJ / 12 000 Kč ročního pojistného (≈ 0,00833).',
    updated_at = NOW()
WHERE tenant_id IS NULL
  AND product_category = 'LIFE_INSURANCE_REGULAR'
  AND partner_pattern IS NULL
  AND subtype = 'regular_payment'
  AND coefficient = 0.10000000;

-- ─── 2) Odstranění LIFE_INSURANCE_SINGLE (neexistuje jako produkt) ──────
DELETE FROM bj_coefficients
WHERE tenant_id IS NULL
  AND product_category = 'LIFE_INSURANCE_SINGLE';

COMMIT;

-- ─── LOG ────────────────────────────────────────────────────────────────
-- 2026-04-22 Marek Marek — oprava sazby ŽP pravidelné dle kariérního plánu
-- (100 BJ = 12 000 Kč ročního pojistného). ŽP jednorázové zrušeno, protože
-- jako produkt neexistuje (jen měsíční/roční pojistné).
