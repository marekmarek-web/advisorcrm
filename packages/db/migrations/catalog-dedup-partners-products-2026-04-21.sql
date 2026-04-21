-- 2026-04-21 · Catalog dedup: partners + products + ZDRAV removal
--
-- Úklid katalogu v produkční DB po revizi JSON katalogu v `packages/db/src/catalog.json`.
-- Tři cíle:
--   1. Sjednotit case-mismatch partnery (`Uniqa` + `UNIQA` → `UNIQA`, `Investika` + `INVESTIKA` → `INVESTIKA`).
--   2. Přepsat FK v `contracts` a `payment_accounts` na kanonického partnera / produkt.
--   3. Odstranit segment `ZDRAV` (0 smluv v produkci; guard níže to ověří a migrace selže, pokud najde jinak).
--
-- Skript je idempotentní a bezpečný pro opakované spuštění. Vše se provádí v transakci.
-- Pokud se cokoli nepovede, rollback.
--
-- Pořadí operací (musí být dodrženo kvůli FK):
--   A. Validace: žádná smlouva nesmí mít `segment = 'ZDRAV'`.
--   B. Najít kanonické řádky `partners` (per (LOWER(name), segment, tenant_id IS NULL)).
--   C. `UPDATE contracts.partner_id` a `UPDATE payment_accounts.partner_id` na kanonického.
--   D. Přesun / dedup `products` pod kanonického partnera, `UPDATE contracts.product_id`.
--   E. DELETE duplicitních `partners` řádků.
--   F. Přejmenovat kanonické `partners.name` na finální brand casing (s rename-kolizní pojistkou).
--   F.5. Resync denormalizovaných `contracts.partner_name` / `contracts.product_name` z canonical `partners.name` / `products.name`.
--   G. Odstranit staré `ČSOB` / HYPO (pokud existuje) — duplicita s `ČSOB Hypoteční banka`.
--   H. Odstranit ZDRAV partnery / produkty (pokud existují, což by neměly).
--   I. Hlášení stavu.
--
-- Po migraci spustit `pnpm run db:seed-catalog`, který doplní chybějící řádky z `catalog.json`.

BEGIN;

-- ---------------------------------------------------------------------------
-- A) Guard: žádná smlouva nesmí mít segment = 'ZDRAV'
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_zdrav_count int;
BEGIN
  SELECT COUNT(*) INTO v_zdrav_count FROM contracts WHERE segment = 'ZDRAV';
  IF v_zdrav_count > 0 THEN
    RAISE EXCEPTION
      'Migrace přerušena: nalezeno % smluv se segmentem ZDRAV. Segment byl odstraněn z contractSegments — před migrací zmigrujte tyto smlouvy ručně na ZP nebo jiný vhodný segment.',
      v_zdrav_count;
  END IF;
  RAISE NOTICE 'Guard OK: žádná smlouva nemá segment=ZDRAV.';
END $$;

-- ---------------------------------------------------------------------------
-- B) Kanonický partner per (LOWER(name), segment) pro globální (tenant_id IS NULL) katalog.
--    Výběr: preferovat řádek s UPPER-case name (UNIQA, INVESTIKA); při shodě nejstarší created_at.
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_partner_canonical ON COMMIT DROP AS
WITH groups AS (
  SELECT
    id,
    name,
    segment,
    LOWER(TRIM(name)) AS name_key,
    created_at,
    -- Preferuj UPPER brand casing (UNIQA > Uniqa, INVESTIKA > Investika),
    -- jinak nejstarší created_at.
    ROW_NUMBER() OVER (
      PARTITION BY LOWER(TRIM(name)), segment
      ORDER BY
        (name = UPPER(name))::int DESC,  -- true = 1 = preferovaný UPPER
        created_at ASC,
        id::text ASC
    ) AS rn
  FROM partners
  WHERE tenant_id IS NULL
)
SELECT
  name_key,
  segment,
  id AS canonical_id,
  name AS canonical_name
FROM groups
WHERE rn = 1;

-- Mapa duplikát → kanonický
CREATE TEMP TABLE tmp_partner_duplicate_map ON COMMIT DROP AS
SELECT
  p.id AS duplicate_id,
  c.canonical_id,
  c.canonical_name,
  p.segment
FROM partners p
JOIN tmp_partner_canonical c
  ON LOWER(TRIM(p.name)) = c.name_key
 AND p.segment = c.segment
WHERE p.tenant_id IS NULL
  AND p.id <> c.canonical_id;

DO $$
DECLARE
  v_dup_count int;
BEGIN
  SELECT COUNT(*) INTO v_dup_count FROM tmp_partner_duplicate_map;
  RAISE NOTICE 'Nalezeno % duplicitních partnerů k sloučení.', v_dup_count;
END $$;

-- ---------------------------------------------------------------------------
-- C) Přepsat FK na kanonického partnera
-- ---------------------------------------------------------------------------
UPDATE contracts AS c
SET partner_id = m.canonical_id
FROM tmp_partner_duplicate_map AS m
WHERE c.partner_id = m.duplicate_id;

-- `payment_accounts` — přepsat pouze pokud existuje
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'payment_accounts'
  ) THEN
    EXECUTE $sql$
      UPDATE payment_accounts AS pa
      SET partner_id = m.canonical_id
      FROM tmp_partner_duplicate_map AS m
      WHERE pa.partner_id = m.duplicate_id
    $sql$;
    RAISE NOTICE 'payment_accounts.partner_id aktualizováno.';
  ELSE
    RAISE NOTICE 'Tabulka payment_accounts neexistuje, krok přeskočen.';
  END IF;
END $$;

-- `client_payment_setups.partner_id` (pokud existuje)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'client_payment_setups' AND column_name = 'partner_id'
  ) THEN
    EXECUTE $sql$
      UPDATE client_payment_setups AS cps
      SET partner_id = m.canonical_id
      FROM tmp_partner_duplicate_map AS m
      WHERE cps.partner_id = m.duplicate_id
    $sql$;
    RAISE NOTICE 'client_payment_setups.partner_id aktualizováno.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- D) Přesun produktů pod kanonického partnera a merge duplicitních produktů.
--    Pro každý produkt u duplikátního partnera:
--      - pokud u kanonického už existuje produkt se stejným LOWER(name) → přepiš FK a smaž starý
--      - jinak přiřaď partner_id = canonical
-- ---------------------------------------------------------------------------
CREATE TEMP TABLE tmp_product_merge_map ON COMMIT DROP AS
WITH dup_products AS (
  SELECT
    pr.id AS dup_product_id,
    pr.name AS dup_name,
    pr.partner_id AS dup_partner_id,
    m.canonical_id AS canonical_partner_id,
    LOWER(TRIM(pr.name)) AS name_key
  FROM products pr
  JOIN tmp_partner_duplicate_map m ON pr.partner_id = m.duplicate_id
),
canonical_products AS (
  SELECT
    pr.id AS canonical_product_id,
    pr.partner_id AS canonical_partner_id,
    LOWER(TRIM(pr.name)) AS name_key
  FROM products pr
  WHERE pr.partner_id IN (SELECT DISTINCT canonical_id FROM tmp_partner_duplicate_map)
)
SELECT
  dp.dup_product_id,
  dp.canonical_partner_id,
  cp.canonical_product_id,  -- NULL pokud neexistuje → přesunout partner_id místo mergeu
  dp.dup_name
FROM dup_products dp
LEFT JOIN canonical_products cp
  ON dp.canonical_partner_id = cp.canonical_partner_id
 AND dp.name_key = cp.name_key;

-- D.1) Kde existuje kanonický produkt → přepsat FK smluv a smazat duplicitní produkt
UPDATE contracts AS c
SET product_id = m.canonical_product_id
FROM tmp_product_merge_map AS m
WHERE c.product_id = m.dup_product_id
  AND m.canonical_product_id IS NOT NULL;

DELETE FROM products AS p
USING tmp_product_merge_map AS m
WHERE p.id = m.dup_product_id
  AND m.canonical_product_id IS NOT NULL;

-- D.2) Kde kanonický produkt neexistuje → přesunout produkt pod kanonického partnera
UPDATE products AS p
SET partner_id = m.canonical_partner_id
FROM tmp_product_merge_map AS m
WHERE p.id = m.dup_product_id
  AND m.canonical_product_id IS NULL;

-- ---------------------------------------------------------------------------
-- E) DELETE duplicitních partnerů (FK už přesměrované, takže safe)
-- ---------------------------------------------------------------------------
DELETE FROM partners AS p
USING tmp_partner_duplicate_map AS m
WHERE p.id = m.duplicate_id;

-- ---------------------------------------------------------------------------
-- F) Přejmenovat kanonické partnery na finální brand casing
--
--    Pojistka: po dedupu v B–E musí existovat právě jeden globální řádek
--    per (LOWER(name), segment) pro `uniqa` a `investika`. Pokud ne → RAISE,
--    protože UPDATE by vyrobil nové duplicity.
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT LOWER(TRIM(name)) AS name_key, segment, COUNT(*) AS cnt
    FROM partners
    WHERE tenant_id IS NULL
      AND LOWER(TRIM(name)) IN ('uniqa', 'investika')
    GROUP BY LOWER(TRIM(name)), segment
    HAVING COUNT(*) > 1
  LOOP
    RAISE EXCEPTION
      'Rename kolize: po dedupu zbylo % řádků pro (name=%, segment=%). Migrace přerušena před UPPER-rename, aby nevznikly nové duplicity.',
      r.cnt, r.name_key, r.segment;
  END LOOP;
  RAISE NOTICE 'Pojistka F OK: žádná rename kolize.';
END $$;

UPDATE partners SET name = 'UNIQA'
  WHERE tenant_id IS NULL AND LOWER(TRIM(name)) = 'uniqa';

UPDATE partners SET name = 'INVESTIKA'
  WHERE tenant_id IS NULL AND LOWER(TRIM(name)) = 'investika';

-- ---------------------------------------------------------------------------
-- F.5) Resync denormalizovaných polí `contracts.partner_name` / `product_name`
--      z canonical `partners.name` / `products.name`. Bez toho by existující
--      smlouvy zobrazovaly staré casingy (`Uniqa`, `Investika`, staré tvary Conseq).
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_partner_resync int;
  v_product_resync int;
BEGIN
  UPDATE contracts c
  SET partner_name = p.name
  FROM partners p
  WHERE c.partner_id = p.id
    AND c.partner_name IS DISTINCT FROM p.name;
  GET DIAGNOSTICS v_partner_resync = ROW_COUNT;

  UPDATE contracts c
  SET product_name = pr.name
  FROM products pr
  WHERE c.product_id = pr.id
    AND c.product_name IS DISTINCT FROM pr.name;
  GET DIAGNOSTICS v_product_resync = ROW_COUNT;

  RAISE NOTICE 'F.5 resync: contracts.partner_name řádků=%, contracts.product_name řádků=%.',
    v_partner_resync, v_product_resync;
END $$;

-- ---------------------------------------------------------------------------
-- G) ČSOB / HYPO duplicita — odstranit řádek `ČSOB` HYPO, pokud existuje i `ČSOB Hypoteční banka` HYPO
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_csob_hypo_id uuid;
  v_csob_hb_hypo_id uuid;
BEGIN
  SELECT id INTO v_csob_hypo_id
    FROM partners
    WHERE tenant_id IS NULL AND name = 'ČSOB' AND segment = 'HYPO'
    LIMIT 1;

  SELECT id INTO v_csob_hb_hypo_id
    FROM partners
    WHERE tenant_id IS NULL AND name = 'ČSOB Hypoteční banka' AND segment = 'HYPO'
    LIMIT 1;

  IF v_csob_hypo_id IS NOT NULL AND v_csob_hb_hypo_id IS NOT NULL THEN
    -- Přesměrovat FK ze smluv / produktů na ČSOB Hypoteční banka
    UPDATE contracts SET partner_id = v_csob_hb_hypo_id WHERE partner_id = v_csob_hypo_id;

    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'payment_accounts') THEN
      EXECUTE format('UPDATE payment_accounts SET partner_id = %L WHERE partner_id = %L',
        v_csob_hb_hypo_id, v_csob_hypo_id);
    END IF;

    IF EXISTS (
      SELECT 1 FROM information_schema.columns
      WHERE table_name = 'client_payment_setups' AND column_name = 'partner_id'
    ) THEN
      EXECUTE format('UPDATE client_payment_setups SET partner_id = %L WHERE partner_id = %L',
        v_csob_hb_hypo_id, v_csob_hypo_id);
    END IF;

    -- Přesun produktů (bez mergeu, bere všechny jako unikátní — duplicity řeší dedup níže)
    UPDATE products SET partner_id = v_csob_hb_hypo_id WHERE partner_id = v_csob_hypo_id;

    DELETE FROM partners WHERE id = v_csob_hypo_id;
    RAISE NOTICE 'ČSOB/HYPO sloučeno do ČSOB Hypoteční banka/HYPO.';
  END IF;
END $$;

-- ---------------------------------------------------------------------------
-- H) Odstranění ZDRAV partnerů / produktů (guard v A už ověřil, že nejsou FK ze smluv)
-- ---------------------------------------------------------------------------
DELETE FROM products
  WHERE partner_id IN (
    SELECT id FROM partners WHERE tenant_id IS NULL AND segment = 'ZDRAV'
  );

DELETE FROM partners
  WHERE tenant_id IS NULL AND segment = 'ZDRAV';

-- ---------------------------------------------------------------------------
-- I) Finální dedup duplicitních produktů v rámci kanonického partnera
--    (edge case: produkt existoval u obou duplikátů pod mírně jiným zápisem, který se shoduje po LOWER/TRIM)
-- ---------------------------------------------------------------------------
WITH ranked AS (
  SELECT
    id,
    partner_id,
    LOWER(TRIM(name)) AS name_key,
    ROW_NUMBER() OVER (
      PARTITION BY partner_id, LOWER(TRIM(name))
      ORDER BY created_at ASC, id::text ASC
    ) AS rn
  FROM products
),
duplicates AS (
  SELECT r_dup.id AS dup_id, r_keep.id AS keep_id
  FROM ranked r_dup
  JOIN ranked r_keep
    ON r_dup.partner_id = r_keep.partner_id
   AND r_dup.name_key = r_keep.name_key
   AND r_keep.rn = 1
  WHERE r_dup.rn > 1
)
UPDATE contracts
  SET product_id = d.keep_id
  FROM duplicates d
  WHERE contracts.product_id = d.dup_id;

DELETE FROM products
  WHERE id IN (
    SELECT r.id FROM (
      SELECT
        id,
        ROW_NUMBER() OVER (
          PARTITION BY partner_id, LOWER(TRIM(name))
          ORDER BY created_at ASC, id::text ASC
        ) AS rn
      FROM products
    ) r
    WHERE r.rn > 1
  );

-- ---------------------------------------------------------------------------
-- Final report
-- ---------------------------------------------------------------------------
DO $$
DECLARE
  v_partners int;
  v_products int;
  v_tbd int;
BEGIN
  SELECT COUNT(*) INTO v_partners FROM partners WHERE tenant_id IS NULL;
  SELECT COUNT(*) INTO v_products FROM products p
    JOIN partners pa ON p.partner_id = pa.id
    WHERE pa.tenant_id IS NULL;
  SELECT COUNT(*) INTO v_tbd FROM products WHERE is_tbd = true;

  RAISE NOTICE '===== Catalog dedup 2026-04-21 hotovo =====';
  RAISE NOTICE '  partners (global, tenant_id IS NULL): %', v_partners;
  RAISE NOTICE '  products pod globálními partnery:     %', v_products;
  RAISE NOTICE '  z toho TBD produktů (is_tbd=true):    %', v_tbd;
  RAISE NOTICE '  Další krok: spustit `pnpm run db:seed-catalog` pro doplnění nových záznamů z catalog.json.';
END $$;

COMMIT;
