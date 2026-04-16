-- Globální katalog: Conseq penzijní společnost + DPS produkt (wizard „Nová smlouva“).
-- Idempotentní: vychází ze stejné logiky jako packages/db/src/seed-catalog.mjs (tenant_id NULL).
-- Spustit v SQL editoru / migracích po ostatních změnách bez závislostí.

INSERT INTO partners (tenant_id, name, segment)
SELECT NULL, 'Conseq penzijní společnost', 'DPS'
WHERE NOT EXISTS (
  SELECT 1
  FROM partners
  WHERE tenant_id IS NULL
    AND name = 'Conseq penzijní společnost'
    AND segment = 'DPS'
);

INSERT INTO products (partner_id, name, category, is_tbd)
SELECT r.id,
  'Doplňkové penzijní spoření (DPS)',
  'DPS',
  false
FROM partners r
WHERE r.tenant_id IS NULL
  AND r.name = 'Conseq penzijní společnost'
  AND r.segment = 'DPS'
  AND NOT EXISTS (
    SELECT 1
    FROM products p
    WHERE p.partner_id = r.id
      AND p.name = 'Doplňkové penzijní spoření (DPS)'
  );
