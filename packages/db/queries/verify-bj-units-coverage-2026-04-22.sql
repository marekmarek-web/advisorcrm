-- 2026-04-22 · Verifikační dotaz: kolik smluv má `bj_units`, co chybí.
--
-- Ad-hoc query pro audit po nasazení
-- `bj-backfill-contracts-2026-04-22.sql` + `recompute-all-bj.ts`.
--
-- Spuštění:
--   psql $DATABASE_URL -f packages/db/queries/verify-bj-units-coverage-2026-04-22.sql
--
-- Read-only — nic nemění. Výsledky:
--   1) Globální coverage (count + % smluv s bj_units IS NOT NULL)
--   2) Rozpad per tenant + per segment
--   3) Top 20 smluv, u kterých BJ nelze spočítat (reason z bj_calculation.notes)

-- ─── 1) Globální coverage ────────────────────────────────────────────────
SELECT
  COUNT(*)                                             AS total_contracts,
  COUNT(*) FILTER (WHERE bj_units IS NOT NULL)         AS with_bj,
  COUNT(*) FILTER (WHERE bj_units IS NULL)             AS without_bj,
  COUNT(*) FILTER (WHERE product_category IS NULL)     AS missing_category,
  ROUND(
    100.0 * COUNT(*) FILTER (WHERE bj_units IS NOT NULL) / NULLIF(COUNT(*), 0),
    1
  )                                                    AS pct_with_bj
FROM contracts;

-- ─── 2) Rozpad per tenant / segment ──────────────────────────────────────
SELECT
  tenant_id,
  segment,
  COUNT(*)                                     AS n,
  COUNT(bj_units)                              AS n_with_bj,
  COUNT(*) FILTER (WHERE product_category IS NULL) AS n_missing_category,
  SUM(bj_units)::numeric(14, 2)                AS total_bj
FROM contracts
GROUP BY tenant_id, segment
ORDER BY tenant_id, segment;

-- ─── 3) Top 20 smluv bez BJ — proč ───────────────────────────────────────
SELECT
  id,
  tenant_id,
  segment,
  partner_name,
  product_name,
  product_category,
  premium_amount,
  premium_annual,
  portfolio_attributes->>'entryFee'        AS entry_fee,
  portfolio_attributes->>'loanPrincipal'   AS loan_principal,
  portfolio_attributes->>'participantContribution' AS participant_contribution,
  bj_calculation->>'reason'                AS bj_fail_reason,
  bj_calculation->'notes'                  AS bj_notes
FROM contracts
WHERE bj_units IS NULL
  AND portfolio_status = 'active'
ORDER BY created_at DESC
LIMIT 20;

-- ─── 4) Smlouvy po 2026-04-01 (dnešní produkce) ──────────────────────────
SELECT
  segment,
  partner_name,
  product_name,
  product_category,
  premium_amount,
  premium_annual,
  portfolio_attributes->>'entryFee'      AS entry_fee,
  portfolio_attributes->>'loanPrincipal' AS loan_principal,
  bj_units,
  bj_calculation->>'notes'               AS bj_notes
FROM contracts
WHERE (start_date >= '2026-04-01' OR advisor_confirmed_at >= '2026-04-01')
ORDER BY advisor_confirmed_at DESC NULLS LAST, created_at DESC;
