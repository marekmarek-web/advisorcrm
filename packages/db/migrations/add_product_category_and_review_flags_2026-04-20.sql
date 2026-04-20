-- 2026-04-20 · Product classification & human-review flags
--
-- Přidá sloupce pro automatické kategorizování produktů (BJ kalkulace) a pro
-- označení AI extrakce, která potřebuje lidské potvrzení.
--
-- Kontext:
--   1) Fronta AI review (contract_upload_reviews) bude ukládat výsledek
--      classifyProduct() — kategorii, subtypy, confidence a seznam chybějících
--      polí + navrhovaných předpokladů.
--   2) Cílové smlouvy (contracts) si drží finální kategorii/subtyp pro BJ
--      výpočet a pro report produkce (investice vs. pojistné vs. úvěry).
--
-- Idempotent: používá IF NOT EXISTS, spuštění více než jednou nic nerozbije.

BEGIN;

-- ─── contract_upload_reviews ────────────────────────────────────────────
ALTER TABLE contract_upload_reviews
    ADD COLUMN IF NOT EXISTS product_category TEXT,
    ADD COLUMN IF NOT EXISTS product_subtypes JSONB,
    ADD COLUMN IF NOT EXISTS extraction_confidence TEXT,
    ADD COLUMN IF NOT EXISTS needs_human_review TEXT,
    ADD COLUMN IF NOT EXISTS missing_fields JSONB,
    ADD COLUMN IF NOT EXISTS proposed_assumptions JSONB;

COMMENT ON COLUMN contract_upload_reviews.product_category IS
    'Výstup classifyProduct(): INVESTMENT_ENTRY_FEE, LIFE_INSURANCE_REGULAR, MORTGAGE, … pro BJ kalkulaci.';
COMMENT ON COLUMN contract_upload_reviews.product_subtypes IS
    'Seznam subtypů (with_ppi, single_payment, biometric_signed, …).';
COMMENT ON COLUMN contract_upload_reviews.extraction_confidence IS
    'Celková důvěra v AI extrakci: high | medium | low.';
COMMENT ON COLUMN contract_upload_reviews.needs_human_review IS
    'Textová pravda "true"/"false" — triggeruje UI banner a blokuje auto-apply.';
COMMENT ON COLUMN contract_upload_reviews.missing_fields IS
    'Seznam polí, která LLM nedokázal jistě odvodit — UI nabídne jejich doplnění.';
COMMENT ON COLUMN contract_upload_reviews.proposed_assumptions IS
    'Navrhované předpoklady od AI (uživatel potvrzuje / upravuje).';

-- Index pro filter „čeká na human review“.
CREATE INDEX IF NOT EXISTS idx_contract_upload_reviews_needs_human_review
    ON contract_upload_reviews (tenant_id, needs_human_review)
    WHERE needs_human_review = 'true';

-- ─── contracts ──────────────────────────────────────────────────────────
ALTER TABLE contracts
    ADD COLUMN IF NOT EXISTS product_category TEXT,
    ADD COLUMN IF NOT EXISTS product_subtype JSONB;

COMMENT ON COLUMN contracts.product_category IS
    'Finální klasifikace produktu pro BJ kalkulaci + produkční report.';
COMMENT ON COLUMN contracts.product_subtype IS
    'Subtypy pro přesnější BJ kalkulaci (with_ppi, single_payment, …).';

CREATE INDEX IF NOT EXISTS idx_contracts_tenant_product_category
    ON contracts (tenant_id, product_category);

COMMIT;
