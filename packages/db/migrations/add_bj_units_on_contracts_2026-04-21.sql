-- 2026-04-21 · BJ units on contracts
--
-- Přidá spočítané bankovní jednotky (BJ) přímo na smlouvu, aby šla produkční
-- sestava postavit jedním SELECTem bez rekalkulace na každý request.
--
-- Sloupce:
--   contracts.bj_units        — numeric(14,4)   hodnota BJ (např. 93.60 pro NN).
--   contracts.bj_calculation  — jsonb           snapshot vstupů a pravidla, které se použilo.
--
-- `bj_calculation` má tvar:
--   {
--     "formula": "annual_premium" | "entry_fee" | "client_contribution" |
--                "loan_principal" | "investment_amount",
--     "amountCzk": 12000,
--     "coefficient": 0.00780000,   -- nebo divisor
--     "divisor": null,
--     "matchedRule": {             -- který řádek bj_coefficients se použil
--       "productCategory": "LIFE_INSURANCE_REGULAR",
--       "partnerPattern": "^nn|nn [zž]ivot",
--       "subtype": null,
--       "tenantScope": "global" | "tenant"
--     },
--     "cap": null, "floor": null,
--     "appliedCap": false, "appliedFloor": false,
--     "notes": ["..."],
--     "computedAt": "2026-04-21T08:00:00.000Z"
--   }
--
-- Idempotentní: IF NOT EXISTS, lze spustit opakovaně.

BEGIN;

ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS bj_units NUMERIC(14, 4),
    ADD COLUMN IF NOT EXISTS bj_calculation JSONB;

COMMENT ON COLUMN contracts.bj_units IS
    'Spočítané bankovní jednotky (BJ) pro tuto smlouvu. NULL = dosud nespočítáno nebo nelze spočítat (chybí kategorie / částka).';
COMMENT ON COLUMN contracts.bj_calculation IS
    'Snapshot vstupů a pravidla, které se použilo pro výpočet bj_units. Slouží k auditu a k rekalkulaci při změně sazebníku.';

-- Index pro produkční report (součet BJ za tenant + advisora + období).
CREATE INDEX IF NOT EXISTS idx_contracts_tenant_advisor_bj
    ON contracts (tenant_id, advisor_id)
    WHERE bj_units IS NOT NULL;

COMMIT;
