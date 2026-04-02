-- Audit: globální katalog partnerů/produktů (tenant_id IS NULL) pro dropdown smluv.
-- Pouze čtení — bezpečné spustit v Supabase SQL Editoru.

-- 1) Kompletní výpis produktů s institucí a segmentem
SELECT
  r.name AS partner_name,
  r.segment,
  p.name AS product_name,
  p.id AS product_id,
  p.is_tbd,
  r.id AS partner_id
FROM products p
JOIN partners r ON p.partner_id = r.id
WHERE r.tenant_id IS NULL
ORDER BY r.name, r.segment, p.category NULLS LAST, p.name;

-- 2) Počty produktů na partnera + segment
SELECT r.name AS partner_name, r.segment, COUNT(p.id) AS product_count
FROM partners r
LEFT JOIN products p ON p.partner_id = r.id
WHERE r.tenant_id IS NULL
GROUP BY r.id, r.name, r.segment
ORDER BY r.name, r.segment;

-- 3) Orphan produkty (neměly by nastat při platných FK)
SELECT p.*
FROM products p
LEFT JOIN partners r ON p.partner_id = r.id
WHERE r.id IS NULL;

-- 4) Konkrétní UUID (doplňte místo placeholderů při diagnostice chyby)
-- SELECT id, first_name, last_name FROM contacts WHERE id = '...'::uuid;
-- SELECT id, name, segment, tenant_id FROM partners WHERE id = '...'::uuid;
-- SELECT id, name, partner_id FROM products WHERE id = '...'::uuid;
