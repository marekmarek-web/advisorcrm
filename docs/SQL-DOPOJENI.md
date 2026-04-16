# SQL doplnění (repo)

Jednotný přehled SQL změn — **nemusíte je hledat v konverzacích**. Odkazy vedou přímo na soubory v repu (v editoru rozkliknutelné).

**Pravidlo:** nejnovější záznam je vždy **poslední** v sekci „Log“.

---

## Základ (referenční skripty)

| Co | Soubor |
|----|--------|
| Hlavní schéma (Postgres / Supabase) | [packages/db/supabase-schema.sql](../packages/db/supabase-schema.sql) |
| Velký idempotentní balík pro Supabase SQL Editor | [docs/supabase-run-in-sql-editor.sql](supabase-run-in-sql-editor.sql) |
| Audit globálních partnerů/produktů (jen SELECT) | [packages/db/migrations/catalog-audit-global-partners-products.sql](../packages/db/migrations/catalog-audit-global-partners-products.sql) |
| Drizzle / apply-schema (TypeScript) | [packages/db/src/apply-schema.ts](../packages/db/src/apply-schema.ts) |

---

## Log (chronologicky — **nejnovější dole**)

Při **nové** migraci nebo významné úpravě `.sql` přidejte **jeden řádek na konec** této tabulky (datum ISO, krátký popis, odkaz).

| Datum | Popis | Soubor |
|-------|--------|--------|
| 2026-04-02 | Audit katalogu smluv: přehled globálních partnerů/produktů a orphan kontrola (jen čtení) | [catalog-audit-global-partners-products.sql](../packages/db/migrations/catalog-audit-global-partners-products.sql) |
| 2026-04-01 | Realtime toast (poradenský portál): `opportunities` v `supabase_realtime`, RLS SELECT pro členy tenanta; ověřovací dotazy v souboru | [advisor-portal-opportunities-realtime-rls.sql](../packages/db/migrations/advisor-portal-opportunities-realtime-rls.sql) |
| 2026-04-01 | Supabase Performance Advisor: RLS initplan (`SELECT` kolem `auth.*`), sloučené permissive politiky, duplicitní index `mindmap_maps`, FA politiky | [supabase-performance-advisor-2026-04-01.sql](../packages/db/migrations/supabase-performance-advisor-2026-04-01.sql) |
| 2026-04-01 | Požadavky na podklady: tabulky `advisor_material_requests`, zprávy, vazba na dokumenty, RLS pro tenant a klienta | [advisor-material-requests-2026-04-01.sql](../packages/db/migrations/advisor-material-requests-2026-04-01.sql) |
| 2026-04-01 | Realtime in-app notifikace: `advisor_notifications` v `supabase_realtime`, RLS SELECT `target_user_id = auth.uid()` | [advisor-notifications-realtime-rls.sql](../packages/db/migrations/advisor-notifications-realtime-rls.sql) |
| 2026-04-01 | Moje portfolio: sloupce na `contracts` (viditelnost klienta, zdroj, `portfolio_attributes`, vazba na dokument / AI review) | [contracts-portfolio-2026-04-01.sql](../packages/db/migrations/contracts-portfolio-2026-04-01.sql) |
| 2026-04-02 | Produkční mezery: `documents.visible_to_client`, tabulky `reminders` + `advisor_notifications` (oprava 42P01 / 42703) | [production-schema-gaps-2026-04-02.sql](../packages/db/migrations/production-schema-gaps-2026-04-02.sql) |
| 2026-04-02 | Portfolio index na `contracts`: sloupec `client_id` místo přejmenovaného `contact_id` | [contracts-portfolio-2026-04-01.sql](../packages/db/migrations/contracts-portfolio-2026-04-01.sql) |
| 2026-04-16 | Ruční platební instrukce CRUD: přidány sloupce `visible_to_client` a `segment` do `client_payment_setups`; back-fill aktivních AI Review záznamů | [client_payment_setups_visible_segment_2026-04-16.sql](../packages/db/migrations/client_payment_setups_visible_segment_2026-04-16.sql) |
| 2026-04-16 | Katalog smluv: globální partner „Conseq penzijní společnost“ (segment DPS) + produkt DPS pro wizard | [catalog_partner_conseq_dps_2026-04-16.sql](../packages/db/migrations/catalog_partner_conseq_dps_2026-04-16.sql) |

---

## Rozkliknutelné záznamy (stejné soubory — rychlý náhled)

<details>
<summary><strong>advisor-portal-opportunities-realtime-rls.sql</strong> — Realtime + RLS pro <code>opportunities</code></summary>

Odkaz: [`packages/db/migrations/advisor-portal-opportunities-realtime-rls.sql`](../packages/db/migrations/advisor-portal-opportunities-realtime-rls.sql)

</details>

<details>
<summary><strong>supabase-performance-advisor-2026-04-01.sql</strong> — výkon a politiky</summary>

Odkaz: [`packages/db/migrations/supabase-performance-advisor-2026-04-01.sql`](../packages/db/migrations/supabase-performance-advisor-2026-04-01.sql)

</details>

<details>
<summary><strong>advisor-notifications-realtime-rls.sql</strong> — Realtime + RLS pro <code>advisor_notifications</code></summary>

Odkaz: [`packages/db/migrations/advisor-notifications-realtime-rls.sql`](../packages/db/migrations/advisor-notifications-realtime-rls.sql)

</details>

<details>
<summary><strong>client_payment_setups_visible_segment_2026-04-16.sql</strong> — Ruční platební instrukce: visible_to_client + segment</summary>

Odkaz: [`packages/db/migrations/client_payment_setups_visible_segment_2026-04-16.sql`](../packages/db/migrations/client_payment_setups_visible_segment_2026-04-16.sql)

</details>

<details>
<summary><strong>catalog_partner_conseq_dps_2026-04-16.sql</strong> — Katalog: Conseq penzijní společnost (DPS)</summary>

Odkaz: [`packages/db/migrations/catalog_partner_conseq_dps_2026-04-16.sql`](../packages/db/migrations/catalog_partner_conseq_dps_2026-04-16.sql)

</details>

<!-- Nový záznam: přidej řádek do tabulky Log a nový blok <details> nad tento komentář (nejnovější v tabulce i v detailech vždy poslední). -->
