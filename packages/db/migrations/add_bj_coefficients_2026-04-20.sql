-- 2026-04-20 · BJ coefficients & kariérní pozice
--
-- Zavádí per-tenant tabulky pro kalkulaci bankovních jednotek (BJ) a pro
-- kariérní pozice. Globální defaulty (tenant_id NULL) vychází přímo
-- z BP_kariera_01-2022_redesign_ver7 (sloupce „BJ sazebník" + „Body").
--
-- ─── Vzorec pro BJ ──────────────────────────────────────────────────────
--     BJ = amount × coefficient        (pokud není `divisor`)
--     BJ = amount / divisor            (pokud je `divisor` nastaven)
--
-- `formula` říká, KTERÁ částka ze smlouvy se použije:
--   entry_fee           — vstupní poplatek v Kč (Amundi, Edward, Codya, …)
--   client_contribution — klientův příspěvek (Conseq DPS, cap 1 700 Kč/měs)
--   annual_premium      — roční pojistné (Pillow, Maxima, NN, Uniqa, …)
--   loan_principal      — jistina úvěru v Kč (RB, UCB, RSTS, Presto, ČSOB L.)
--   investment_amount   — výše investice v Kč (ATRIS, EFEKTA realitní fond)
--
-- ─── Ověřené hodnoty (z obrázku „Body" v kariérním plánu) ───────────────
--   Amundi     vstupní poplatek 1 000 Kč → 4,20 BJ      (1000 / 238,10)
--   Edward     vstupní poplatek 1 000 Kč → 3,60 BJ      (× 0,00360)
--   Codya IS   vstupní poplatek 1 000 Kč → 4,00 BJ      (× 0,00400)
--   Investika  vstupní poplatek 1 000 Kč → 4,00 BJ      (× 0,00400)
--   Conseq PS  příspěvek účastníka 1 000 Kč → 11,00 BJ  (× 0,01100, cap 1 700)
--   Pillow     roční pojistné 1 000 Kč → 0,60 BJ        (× 0,00060)
--   Standard ŽP roční pojistné 12 000 Kč → 100 BJ       (× 0,00833)
--   NN Život   roční pojistné 12 000 Kč → 93,60 BJ      (× 0,00780)
--   Maxima     roční pojistné 12 000 Kč → 94,00 BJ      (× 0,00783)
--   Uniqa      roční pojistné 12 000 Kč → ~99 BJ        (× 0,00825, + follow-up)
--   RB hypo    jistina 1 000 000 Kč → 44,80 BJ          (× 0,0000448)
--   UCB hypo   jistina 1 000 000 Kč → 70,00 BJ          (× 0,00007)
--   RSTS bez PPI 1 000 000 Kč       → 112,00 BJ         (× 0,000112)
--   RSTS s PPI   1 000 000 Kč       → 132,00 BJ         (× 0,000132)
--   UCB PRESTO   1 000 000 Kč       → 110,00 BJ         (× 0,00011)
--   ČSOB Leasing 1 000 000 Kč       → 72,00 BJ          (× 0,000072)
--   ATRIS        1 000 000 Kč inv.  → 160,00 BJ         (× 0,00016)
--   EFEKTA       1 000 000 Kč inv.  → 196,05 BJ         (× 0,00019605)
--
-- ─── Hodnota 1 BJ v Kč (kariérní pozice — sloupec „obrat v BJ" v plánu) ──
--   T1  Trainee 1             =  62,50 Kč
--   T2  Trainee 2             =  75,00 Kč
--   R1  Reprezentant 1        =  87,50 Kč
--   VR2 Vedoucí reprez. 2     = 100,00 Kč
--   VR3 Vedoucí reprez. 3     = 112,50 Kč
--   VR4 Vedoucí reprez. 4     = 125,00 Kč
--   M1  Obchodní vedoucí      = 137,50 Kč
--   M1+ Obchodní ved. senior  = 150,00 Kč
--   M2  Oblastní vedoucí      = 162,50 Kč
--   D1  Oblastní ředitel      = 175,00 Kč
--   D2  Regionální ředitel    = 187,50 Kč
--   D3  Zemský ředitel        = 200,00 Kč (strop)
--
-- Idempotentní: lze pouštět opakovaně, seed používá ON CONFLICT DO NOTHING.

BEGIN;

CREATE TABLE IF NOT EXISTS bj_coefficients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    product_category TEXT NOT NULL,
    partner_pattern TEXT,
    subtype TEXT,
    formula TEXT NOT NULL,
    coefficient NUMERIC(14, 8),
    divisor NUMERIC(14, 4),
    cap NUMERIC(14, 2),
    floor NUMERIC(14, 2),
    note TEXT,
    effective_from TIMESTAMPTZ,
    effective_to TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT bj_coef_unique UNIQUE (tenant_id, product_category, partner_pattern, subtype),
    CONSTRAINT bj_coef_has_factor CHECK (coefficient IS NOT NULL OR divisor IS NOT NULL)
);

COMMENT ON TABLE bj_coefficients IS
    'Per-tenant (tenant_id NULL = globální default) kalkulační koeficienty pro BJ. BJ = amount × coefficient, nebo BJ = amount / divisor.';
COMMENT ON COLUMN bj_coefficients.formula IS
    'entry_fee | client_contribution | annual_premium | loan_principal | investment_amount';
COMMENT ON COLUMN bj_coefficients.coefficient IS
    'Přímý násobitel: BJ = amount × coefficient. Např. UCB hypo = 0,00007 → 70 BJ za 1 mil Kč.';
COMMENT ON COLUMN bj_coefficients.divisor IS
    'Alternativní zápis: BJ = amount / divisor. Amundi VP: divisor = 238,10 → 1 000 / 238,10 = 4,20 BJ.';
COMMENT ON COLUMN bj_coefficients.cap IS
    'Horní limit započitatelné částky (Conseq DPS: 1 700 Kč/měs).';
COMMENT ON COLUMN bj_coefficients.partner_pattern IS
    'Regex partnera nebo produktu (case-insensitive). Per-partner řádek má přednost před category-only řádkem.';

CREATE INDEX IF NOT EXISTS idx_bj_coef_tenant_category
    ON bj_coefficients (tenant_id, product_category);

CREATE TABLE IF NOT EXISTS career_position_coefficients (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
    position_key TEXT NOT NULL,
    position_label TEXT NOT NULL,
    position_level INTEGER NOT NULL,
    bj_value_czk NUMERIC(10, 2) NOT NULL,
    bj_threshold NUMERIC(14, 2),
    meta JSONB,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    CONSTRAINT career_pos_unique UNIQUE (tenant_id, position_key),
    CONSTRAINT career_pos_bj_range CHECK (bj_value_czk >= 62.50 AND bj_value_czk <= 200.00)
);

COMMENT ON TABLE career_position_coefficients IS
    'Kariérní pozice z BP_kariera_01-2022. Hodnota 1 BJ v Kč určuje výnos poradce (T1 62,50 Kč … D3 200,00 Kč).';
COMMENT ON COLUMN career_position_coefficients.bj_value_czk IS
    'Kolik Kč dostane poradce za 1 BJ. Rozsah 62,50 (T1) až 200,00 (D3).';
COMMENT ON COLUMN career_position_coefficients.bj_threshold IS
    'Kolik BJ ntto historicky je potřeba pro postup na tuto pozici.';

CREATE INDEX IF NOT EXISTS idx_career_pos_tenant
    ON career_position_coefficients (tenant_id, position_level);

-- ─── SEED: globální BJ defaulty (tenant_id = NULL) ──────────────────────
--
-- Dvouúrovňová logika:
--   1) Category-level default — když se žádný partner_pattern neshoduje,
--      použije se standardní sazba z „BJ sazebníku" kariérního plánu.
--   2) Partner-level override — konkrétní dohodnutá sazba partnera, má
--      přednost (např. Edward, RB hypo, RSTS s/bez PPI, ATRIS, EFEKTA…).
--
-- Hodnoty jsou přímo z obrázku „Body" — ověřeno na testovacích částkách.

INSERT INTO bj_coefficients
    (tenant_id, product_category, partner_pattern, subtype, formula, coefficient, divisor, cap, floor, note)
VALUES
    -- ── Investice jednoráz s vstupním poplatkem (kategorie = INVESTMENT_ENTRY_FEE) ─
    -- Standard: 42 BJ / 10 000 Kč VP ≡ 1 / 238,10 (Amundi)
    (NULL, 'INVESTMENT_ENTRY_FEE', NULL, NULL,
        'entry_fee', NULL, 238.1000, NULL, NULL,
        'Standard: 42 BJ / 10 000 Kč vstupního poplatku (= VP / 238,10). Amundi, neuvedení partneři.'),
    (NULL, 'INVESTMENT_ENTRY_FEE', '^amundi', NULL,
        'entry_fee', NULL, 238.1000, NULL, NULL,
        'Amundi Invest: 1 000 Kč VP → 4,20 BJ.'),
    (NULL, 'INVESTMENT_ENTRY_FEE', '^edward|investi[cč]ni u[cč]ty edward', NULL,
        'entry_fee', 0.00360000, NULL, NULL, NULL,
        'Edward: 1 000 Kč VP → 3,60 BJ.'),
    (NULL, 'INVESTMENT_ENTRY_FEE', '^codya', NULL,
        'entry_fee', 0.00400000, NULL, NULL, NULL,
        'Codya IS: 1 000 Kč VP → 4,00 BJ.'),
    (NULL, 'INVESTMENT_ENTRY_FEE', '^investika', NULL,
        'entry_fee', 0.00400000, NULL, NULL, NULL,
        'Investika DIP: 1 000 Kč VP → 4,00 BJ.'),

    -- ── Realitní fondy / jednoráz s VP (ATRIS, EFEKTA) ─────────────────
    -- Zde se počítá z výše investice (investment_amount), ne z VP.
    (NULL, 'INVESTMENT_SINGLE_WITH_ENTRY_FEE', NULL, NULL,
        'investment_amount', 0.00016000, NULL, NULL, NULL,
        'Default realitní fond: 1 000 000 Kč inv. → 160 BJ (ATRIS sazba).'),
    (NULL, 'INVESTMENT_SINGLE_WITH_ENTRY_FEE', '^atris', NULL,
        'investment_amount', 0.00016000, NULL, NULL, NULL,
        'ATRIS Realita nemovitostní: 1 000 000 Kč → 160 BJ.'),
    (NULL, 'INVESTMENT_SINGLE_WITH_ENTRY_FEE', '^efekta|czech real estate', NULL,
        'investment_amount', 0.00019605, NULL, NULL, NULL,
        'EFEKTA Czech Real Estate Fund: 1 000 000 Kč → 196,05 BJ.'),

    -- ── AUM follow-up (trailer fee) — rezerva, sazba není v plánu ───────
    (NULL, 'INVESTMENT_AUM_FOLLOWUP', NULL, NULL,
        'investment_amount', 0.00000000, NULL, NULL, NULL,
        'AUM follow-up zatím bez sazby — doplní se per-partner.'),

    -- ── Penzijní spoření (Conseq PS) — klientův příspěvek, cap 1 700 ───
    (NULL, 'PENSION_PARTICIPANT_CONTRIBUTION', NULL, NULL,
        'client_contribution', 0.01100000, NULL, 1700.00, NULL,
        'DPS: 1 000 Kč měs příspěvku → 11 BJ. Cap 1 700 Kč/měs (nad strop se nepočítá).'),
    (NULL, 'PENSION_PARTICIPANT_CONTRIBUTION', '^conseq', NULL,
        'client_contribution', 0.01100000, NULL, 1700.00, NULL,
        'Conseq PS Doplňkové penzijní spoření (ZENIT): 1 000 Kč → 11 BJ.'),

    -- ── Životní pojištění pravidelné ───────────────────────────────────
    -- Standard z kariérního plánu: 100 BJ / 1 000 Kč ročně = 0,1.
    -- Konkrétní partneři mají vlastní (nižší) sazby.
    (NULL, 'LIFE_INSURANCE_REGULAR', NULL, 'regular_payment',
        'annual_premium', 0.00833333, NULL, NULL, NULL,
        'Standard: 100 BJ / 12 000 Kč ročního pojistného (≈ 0,00833).'),
    (NULL, 'LIFE_INSURANCE_REGULAR', '^nn|nn [zž]ivot', NULL,
        'annual_premium', 0.00780000, NULL, NULL, NULL,
        'NN Život 100: 12 000 Kč ročně → 93,60 BJ.'),
    (NULL, 'LIFE_INSURANCE_REGULAR', '^maxima|maxefekt', NULL,
        'annual_premium', 0.00783333, NULL, NULL, NULL,
        'Maxima MAXEFEKT 100: 12 000 Kč ročně → 94,00 BJ.'),
    (NULL, 'LIFE_INSURANCE_REGULAR', '^uniqa', NULL,
        'annual_premium', 0.00825000, NULL, NULL, NULL,
        'Uniqa Život a radost (investiční 100): 12 000 Kč ročně → ~99 BJ.'),

    -- ── Autopojištění ──────────────────────────────────────────────────
    (NULL, 'MOTOR_INSURANCE', NULL, NULL,
        'annual_premium', 0.00060000, NULL, NULL, NULL,
        'Standard: 6 BJ / 10 000 Kč ročního pojistného.'),
    (NULL, 'MOTOR_INSURANCE', '^pillow', NULL,
        'annual_premium', 0.00060000, NULL, NULL, NULL,
        'Pillow autopojištění: 1 000 Kč ročně → 0,60 BJ.'),

    -- ── Majetkové pojištění ────────────────────────────────────────────
    (NULL, 'PROPERTY_INSURANCE', NULL, NULL,
        'annual_premium', 0.00200000, NULL, NULL, NULL,
        'Standard: 20 BJ / 10 000 Kč ročního pojistného.'),

    -- ── Odpovědnost ────────────────────────────────────────────────────
    (NULL, 'LIABILITY_INSURANCE', NULL, NULL,
        'annual_premium', 0.00200000, NULL, NULL, NULL,
        'Odpovědnost: 20 BJ / 10 000 Kč ročně (shodné s majetkem).'),

    -- ── Hypotéky ───────────────────────────────────────────────────────
    -- Standard = UCB sazba 70 BJ / 1 mil, RB má nižší (44,80 BJ).
    (NULL, 'MORTGAGE', NULL, NULL,
        'loan_principal', 0.00007000, NULL, NULL, NULL,
        'Standard: 70 BJ / 1 000 000 Kč jistiny.'),
    (NULL, 'MORTGAGE', '^raiffeisen|^rb ', NULL,
        'loan_principal', 0.00004480, NULL, NULL, NULL,
        'Raiffeisenbank hypotéka (fix 1-2 roky): 1 000 000 Kč → 44,80 BJ.'),
    (NULL, 'MORTGAGE', '^ucb|unicredit', NULL,
        'loan_principal', 0.00007000, NULL, NULL, NULL,
        'UCB hypotéka: 1 000 000 Kč → 70,00 BJ.'),

    -- ── Spotřebitelské úvěry ───────────────────────────────────────────
    (NULL, 'CONSUMER_LOAN', NULL, 'without_ppi',
        'loan_principal', 0.00011200, NULL, NULL, NULL,
        'Default bez PPI: 112 BJ / 1 000 000 Kč.'),
    (NULL, 'CONSUMER_LOAN', NULL, 'with_ppi',
        'loan_principal', 0.00013200, NULL, NULL, NULL,
        'Default s PPI: 132 BJ / 1 000 000 Kč.'),
    (NULL, 'CONSUMER_LOAN', '^rsts|rekop[uů]j[cč]ka', 'without_ppi',
        'loan_principal', 0.00011200, NULL, NULL, NULL,
        'RSTS rekopůjčka (anuitní) bez PPI: 1 000 000 Kč → 112,00 BJ.'),
    (NULL, 'CONSUMER_LOAN', '^rsts|rekop[uů]j[cč]ka', 'with_ppi',
        'loan_principal', 0.00013200, NULL, NULL, NULL,
        'RSTS rekopůjčka (anuitní) s PPI: 1 000 000 Kč → 132,00 BJ.'),
    (NULL, 'CONSUMER_LOAN', '^(ucb|presto|unicredit)', NULL,
        'loan_principal', 0.00011000, NULL, NULL, NULL,
        'UCB PRESTO půjčka: 1 000 000 Kč → 110,00 BJ.'),

    -- ── Leasing ────────────────────────────────────────────────────────
    (NULL, 'LEASING', NULL, NULL,
        'loan_principal', 0.00007200, NULL, NULL, NULL,
        'Default leasing: 72 BJ / 1 000 000 Kč.'),
    (NULL, 'LEASING', '^[cč]sob', NULL,
        'loan_principal', 0.00007200, NULL, NULL, NULL,
        'ČSOB Leasing (úvěrová smlouva): 1 000 000 Kč → 72,00 BJ.')
ON CONFLICT ON CONSTRAINT bj_coef_unique DO NOTHING;

-- ─── SEED: kariérní pozice (BP_kariera_01-2022) ─────────────────────────
--
-- Hodnota 1 BJ v Kč roste lineárně s pozicí (T1 62,50 Kč → D3 200,00 Kč).
-- Threshold je historická produkce v BJ ntto potřebná pro postup.
-- Meta obsahuje měsíční / týmové požadavky z pravého sloupce plánu.

INSERT INTO career_position_coefficients
    (tenant_id, position_key, position_label, position_level, bj_value_czk, bj_threshold, meta)
VALUES
    (NULL, 'T1',  'T1 Trainee 1',              1,  62.50,      0,
        '{"requirement":"registrace"}'::jsonb),
    (NULL, 'T2',  'T2 Trainee 2',              2,  75.00,    200,
        '{"requirement":"200 BJ ntto historicky"}'::jsonb),
    (NULL, 'R1',  'R1 Reprezentant 1',         3,  87.50,    400,
        '{"requirement":"400 BJ ntto historicky"}'::jsonb),
    (NULL, 'VR2', 'VR2 Vedoucí reprez. 2',     4, 100.00,    600,
        '{"requirement":"600 BJ ntto historicky","monthly":"2 podřízení R1 (nepřímo), 1× 500 BJ/měs ntto, PPZ a VZ"}'::jsonb),
    (NULL, 'VR3', 'VR3 Vedoucí reprez. 3',     5, 112.50,   2000,
        '{"requirement":"2 000 BJ ntto historicky, zkoušky ČNB, Full Time","monthly":"1 podřízený R1 (nepřímo), 1× 700 BJ/měs ntto, PPZ a VZ"}'::jsonb),
    (NULL, 'VR4', 'VR4 Vedoucí reprez. 4',     6, 125.00,  10000,
        '{"requirement":"10 000 BJ ntto historicky","monthly":"2 R2, 2× 800 BJ/měs ntto"}'::jsonb),
    (NULL, 'M1',  'M1 Obchodní vedoucí',       7, 137.50,  15000,
        '{"requirement":"15 000 BJ ntto historicky","monthly":"3 přímí R2, 3× 1 000 BJ/měs ntto"}'::jsonb),
    (NULL, 'M1P', 'M1+ Obchodní ved. senior',  8, 150.00,  20000,
        '{"requirement":"20 000 PB historicky","monthly":"4 přímí R2, 6× 1 500 BJ/měs ntto, 1 rok"}'::jsonb),
    (NULL, 'M2',  'M2 Oblastní vedoucí',       9, 162.50,  30000,
        '{"requirement":"30 000 BJ ntto historicky","monthly":"6 přímých R2, 6× 2 000 BJ/měs ntto, 1 rok"}'::jsonb),
    (NULL, 'D1',  'D1 Oblastní ředitel',      10, 175.00,  40000,
        '{"requirement":"40 000 BJ ntto historicky","monthly":"4 přímí M1, 4× 4 000 BJ/měs ntto, 1 rok"}'::jsonb),
    (NULL, 'D2',  'D2 Regionální ředitel',    11, 187.50,  50000,
        '{"requirement":"50 000 BJ ntto historicky","monthly":"3 přímí D1 nebo 6 přímých M2, 6× 8 000 BJ/měs ntto, 1 rok"}'::jsonb),
    (NULL, 'D3',  'D3 Zemský ředitel',        12, 200.00,  60000,
        '{"requirement":"60 000 BJ ntto historicky, nejvyšší pozice","monthly":"3 přímí D1 nebo 6 přímých M2, 6× 15 000 BJ/měs ntto, 1 rok"}'::jsonb)
ON CONFLICT ON CONSTRAINT career_pos_unique DO NOTHING;

-- ─── advisor_preferences: kariérní pozice poradce ──────────────────────
ALTER TABLE advisor_preferences
    ADD COLUMN IF NOT EXISTS career_position_key TEXT;

COMMENT ON COLUMN advisor_preferences.career_position_key IS
    'Klíč do career_position_coefficients.position_key (T1, T2, R1, …, D3). Ovlivňuje BJ → Kč kalkulaci.';

COMMIT;
