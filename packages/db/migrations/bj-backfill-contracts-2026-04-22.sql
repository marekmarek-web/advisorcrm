-- 2026-04-22 · Backfill `product_category` pro existující smlouvy
--
-- Kontext:
--   Až do dnešního dne `createContract` neplnil pole `contracts.product_category`
--   (viz contracts.ts – komentář „BJ se zatím u ručně zakládaných smluv počítá
--   jen pokud má vyplněnou productCategory — ta u createContract typicky není").
--   V produkci jsou tedy desítky/stovky smluv s `product_category = NULL`,
--   u kterých `recomputeBjForContract` vrací NULL a v KPI se jeví jako 0 BJ.
--
--   Tahle migrace udělá deterministický backfill jen tam, kde je `product_category
--   IS NULL`. Jemnější regex overlay (RB hypo, RSTS, Amundi, NN život…) kopíruje
--   pravidla z `apps/web/src/lib/ai/product-categories.ts` — při změně tam
--   POUZE aktualizujeme i tuhle migraci, aby to bylo konzistentní.
--
-- Idempotence:
--   Všechny UPDATE mají `WHERE product_category IS NULL` — druhé spuštění
--   neudělá nic. Po backfillu je potřeba ještě spustit TS skript
--   `apps/web/scripts/recompute-all-bj.ts` pro přepočet `bj_units`.

BEGIN;

-- ─── 1) Per-partner overrides (konkrétnější varianty dřív než segment fallback) ──

-- Investice — Amundi / Edward / Codya / Investika → INVESTMENT_ENTRY_FEE
UPDATE contracts
SET product_category = 'INVESTMENT_ENTRY_FEE',
    product_subtype = COALESCE(product_subtype, '["investment_fund"]'::jsonb)
WHERE product_category IS NULL
  AND (
    partner_name ILIKE '%amundi%'
    OR partner_name ILIKE '%edward%'
    OR partner_name ILIKE '%codya%'
    OR partner_name ILIKE '%investika%'
  );

-- Realitní fondy (ATRIS / Efekta / „realitní fond") → INVESTMENT_SINGLE_WITH_ENTRY_FEE
UPDATE contracts
SET product_category = 'INVESTMENT_SINGLE_WITH_ENTRY_FEE',
    product_subtype = COALESCE(product_subtype, '["investment_fund","single_payment"]'::jsonb)
WHERE product_category IS NULL
  AND (
    partner_name ILIKE '%atris%'
    OR partner_name ILIKE '%efekta%'
    OR product_name ILIKE '%realitn% fond%'
  );

-- Conseq DPS / PS / DIP → PENSION_PARTICIPANT_CONTRIBUTION
UPDATE contracts
SET product_category = 'PENSION_PARTICIPANT_CONTRIBUTION',
    product_subtype = COALESCE(product_subtype, '["pension"]'::jsonb)
WHERE product_category IS NULL
  AND segment IN ('DPS', 'DIP');

-- NN / Uniqa / Maxima / Allianz / Koop / Generali / Česká pojišťovna život
UPDATE contracts
SET product_category = 'LIFE_INSURANCE_REGULAR',
    product_subtype = COALESCE(product_subtype, '["regular_payment"]'::jsonb)
WHERE product_category IS NULL
  AND segment = 'ZP';

-- Autopojištění (Pillow / segment AUTO_*)
UPDATE contracts
SET product_category = 'MOTOR_INSURANCE',
    product_subtype = COALESCE(product_subtype, '["auto"]'::jsonb)
WHERE product_category IS NULL
  AND (segment IN ('AUTO_PR', 'AUTO_HAV') OR partner_name ILIKE '%pillow%');

-- RB / UCB / jakákoliv hypotéka → MORTGAGE
UPDATE contracts
SET product_category = 'MORTGAGE',
    product_subtype = COALESCE(product_subtype, '["mortgage"]'::jsonb)
WHERE product_category IS NULL
  AND segment = 'HYPO';

-- RSTS / PRESTO / ostatní spotřebitelské úvěry → CONSUMER_LOAN
UPDATE contracts
SET product_category = 'CONSUMER_LOAN',
    product_subtype = COALESCE(product_subtype, '["unsecured_loan"]'::jsonb)
WHERE product_category IS NULL
  AND segment = 'UVER';

-- Leasing (ČSOB leasing apod.)
UPDATE contracts
SET product_category = 'LEASING'
WHERE product_category IS NULL
  AND (
    segment = 'LEASING'
    OR partner_name ILIKE '%leasing%'
  );

-- Majetek → PROPERTY_INSURANCE
UPDATE contracts
SET product_category = 'PROPERTY_INSURANCE',
    product_subtype = COALESCE(product_subtype, '["property"]'::jsonb)
WHERE product_category IS NULL
  AND segment = 'MAJ';

-- Odpovědnost (občan + zaměstnanec) → LIABILITY_INSURANCE
UPDATE contracts
SET product_category = 'LIABILITY_INSURANCE'
WHERE product_category IS NULL
  AND segment IN ('ODP', 'ODP_ZAM');

-- Cestovní / firemní pojištění — přes review (coeff. ještě neexistuje)
UPDATE contracts
SET product_category = 'UNKNOWN_REVIEW'
WHERE product_category IS NULL
  AND segment IN ('CEST', 'FIRMA_POJ');

-- ─── 2) Fallback: vše ostatní se segmentem v tabulce → UNKNOWN_REVIEW ────
-- (Aby nikdy nezůstalo NULL — advisor může later přepsat v detailu smlouvy.)
UPDATE contracts
SET product_category = 'UNKNOWN_REVIEW'
WHERE product_category IS NULL;

COMMIT;

-- ─── LOG ────────────────────────────────────────────────────────────────
-- 2026-04-22 Marek Marek — backfill product_category u všech existujících
-- smluv dle segment + partner_name. Po nasazení spustit
-- `pnpm tsx apps/web/scripts/recompute-all-bj.ts` pro přepočet bj_units.
