-- Catalog gap fill (priorita 1-5) + Moneta removal
-- Datum: 21.04.2026
-- Souvisí s: catalog.json v2026-04-21 (Generali Česká pojišťovna, UNIQA Penzijní společnost,
-- Modrá pyramida; doplnění CEST + FIRMA_POJ; odstranění Moneta).
--
-- Tato migrace:
--   1) Odstraní Moneta (globální tenant_id IS NULL) ze 'partners' a 'products'.
--   2) FK contracts.partner_id / payment_accounts.partner_id / client_payment_setups.partner_id
--      přesměruje na NULL (ON DELETE SET NULL v contracts schema, ručně u ostatních).
--   3) Nové partnery/produkty (Generali, UNIQA PS, Modrá pyramida, CEST, FIRMA_POJ)
--      doplní standardní seed script (pnpm run db:seed-catalog) — tato migrace je jen
--      destruktivní část, která se ze seed scriptu nemůže provést sama.
--
-- Idempotentní — lze spustit opakovaně.

BEGIN;

-- 1. Přesměrovat FK na Moneta → NULL (contracts má ON DELETE SET NULL,
--    ale ostatní tabulky explicitně nastavíme).
UPDATE contracts
   SET partner_id = NULL
 WHERE partner_id IN (SELECT id FROM partners WHERE tenant_id IS NULL AND name = 'Moneta');

-- Payment accounts — pokud tabulka existuje a má partner_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'payment_accounts' AND column_name = 'partner_id'
  ) THEN
    EXECUTE $sql$
      UPDATE payment_accounts
         SET partner_id = NULL
       WHERE partner_id IN (SELECT id FROM partners WHERE tenant_id IS NULL AND name = 'Moneta')
    $sql$;
  END IF;
END $$;

-- Client payment setups — pokud tabulka má partner_id.
DO $$
BEGIN
  IF EXISTS (
    SELECT 1
      FROM information_schema.columns
     WHERE table_name = 'client_payment_setups' AND column_name = 'partner_id'
  ) THEN
    EXECUTE $sql$
      UPDATE client_payment_setups
         SET partner_id = NULL
       WHERE partner_id IN (SELECT id FROM partners WHERE tenant_id IS NULL AND name = 'Moneta')
    $sql$;
  END IF;
END $$;

-- 2. Smazat produkty pod Moneta (tenant_id IS NULL znamená globální katalog).
DELETE FROM products
 WHERE partner_id IN (SELECT id FROM partners WHERE tenant_id IS NULL AND name = 'Moneta');

-- 3. Smazat Moneta partnery (HYPO + UVER řádky, globální katalog).
DELETE FROM partners
 WHERE tenant_id IS NULL AND name = 'Moneta';

-- 4. Diagnostický report: kolik kontraktů zůstalo s partner_name ILIKE 'moneta'
--    a partner_id=NULL (historické smlouvy, které UI zobrazí přes textový fallback).
DO $$
DECLARE
  v_orphan int;
  v_partners_left int;
  v_products_left int;
BEGIN
  SELECT COUNT(*) INTO v_orphan
    FROM contracts
   WHERE partner_name ILIKE '%moneta%' AND partner_id IS NULL;

  SELECT COUNT(*) INTO v_partners_left
    FROM partners WHERE tenant_id IS NULL;

  SELECT COUNT(*) INTO v_products_left
    FROM products p
    JOIN partners pp ON pp.id = p.partner_id
   WHERE pp.tenant_id IS NULL;

  RAISE NOTICE 'Moneta removal report:';
  RAISE NOTICE '  • Contracts s historickým partner_name=Moneta a partner_id=NULL: %', v_orphan;
  RAISE NOTICE '  • Global partners after cleanup: %', v_partners_left;
  RAISE NOTICE '  • Global products after cleanup: %', v_products_left;
  RAISE NOTICE 'Další krok: spustit pnpm run db:seed-catalog pro doplnění Generali/UNIQA PS/Modrá pyramida + CEST/FIRMA_POJ řádků.';
END $$;

COMMIT;
