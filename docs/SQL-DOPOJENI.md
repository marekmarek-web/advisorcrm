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
| 2026-04-19 | WS-2 Batch 1 / M1 — sjednocení GUC na `app.tenant_id` (drop+recreate policies `fa_plan_items`, `fa_sync_log`, dříve na `app.current_tenant_id`) | [rls-unify-guc-app-tenant-id-2026-04-19.sql](../packages/db/migrations/rls-unify-guc-app-tenant-id-2026-04-19.sql) |
| 2026-04-19 | WS-2 Batch 1 / M2 — cleanup legacy `clients`-based RLS na `public.contracts`: nové tenant-based policies přes `app.tenant_id` | [rls-cleanup-legacy-clients-contracts-tenant-2026-04-19.sql](../packages/db/migrations/rls-cleanup-legacy-clients-contracts-tenant-2026-04-19.sql) |
| 2026-04-19 | WS-2 Batch 2 / Enforcement — role `aidvisora_app` (LOGIN, NOBYPASSRLS) + FORCE ROW LEVEL SECURITY na citlivých tabulkách (contacts, contracts, documents, messages, audit, …). Bez infra swapu connection stringu je efekt vs. dnešní `postgres` runtime nulový; po swapu tenant izolace zapne ihned | [rls-app-role-and-force-2026-04-19.sql](../packages/db/migrations/rls-app-role-and-force-2026-04-19.sql) |
| 2026-04-19 | WS-2 Batch 2 / Schema — `tenant_id` přidán na `client_requests` a `client_request_files` (backfill přes contacts/legacy clients), staré policies odkazující na `public.clients` nahrazeny tenant-scoped; `contracts.tenant_id` SET NOT NULL | [tenant-id-schema-fixes-2026-04-19.sql](../packages/db/migrations/tenant-id-schema-fixes-2026-04-19.sql) |
| 2026-04-19 | WS-2 Batch 2 / M3+M4 — RLS ON + FORCE + tenant-scoped policies na `messages` (včetně participant scope pro klienta), `message_attachments`, `contact_coverage`, a hlavní PII/document/contract tabulky (contacts, documents, tasks, …) | [rls-m3-m4-messages-and-core-tables-2026-04-19.sql](../packages/db/migrations/rls-m3-m4-messages-and-core-tables-2026-04-19.sql) |
| 2026-04-19 | Návrhy od poradce v klientské zóně: tabulka `advisor_proposals` (generated `savings_annual`, segment/status enum checks), RLS tenant scope + client scope přes `client_contacts`; klient vidí jen publikované a může zareagovat | [advisor-proposals-2026-04-19.sql](../packages/db/migrations/advisor-proposals-2026-04-19.sql) |
| 2026-04-20 | WS-1 Billing: append-only `billing_audit_log` (tenant RLS, REVOKE UPDATE/DELETE), dunning sloupce na `subscriptions` (grace_period_ends_at, failed_payment_attempts, last_payment_failed_at, restricted_at, promo_code) a VAT capture na `tenants` (billing_ico, billing_dic, billing_company_name, billing_address_line, billing_notes) | [billing-audit-and-dunning-2026-04-20.sql](../packages/db/migrations/billing-audit-and-dunning-2026-04-20.sql) |
| 2026-04-20 | Kariérní BJ: volitelný osobní příplatek `career_bj_bonus_czk` na `advisor_preferences` (Kč za 1 BJ navíc k pozici) | [advisor_preferences_career_bj_bonus_2026-04-20.sql](../packages/db/migrations/advisor_preferences_career_bj_bonus_2026-04-20.sql) |
| 2026-04-20 | QA Sweep Batch 2: cooldown pro servisní připomínky – sloupec `last_service_reminder_sent_at` na `contacts` + index | [service-reminder-cooldown-2026-04-20.sql](../packages/db/migrations/service-reminder-cooldown-2026-04-20.sql) |
| 2026-04-20 | QA Sweep Batch 6: idempotence Stripe webhooků – stavový automat (`status`, `attempts`, `last_error`, `processed_at`) na `stripe_webhook_events` | [stripe-webhook-idempotency-2026-04-20.sql](../packages/db/migrations/stripe-webhook-idempotency-2026-04-20.sql) |
| 2026-04-20 | QA Sweep Batch 8: persistovaná priorita a připomínka úkolů – sloupce `priority` a `reminder` na `tasks` + index `idx_tasks_tenant_priority` (aby wizardem zadané hodnoty nezmizely v `createTask`) | [tasks-priority-reminder-2026-04-20.sql](../packages/db/migrations/tasks-priority-reminder-2026-04-20.sql) |
| 2026-04-20 | Document intake dedup (forensic audit C1+C5): partial index `idx_documents_fingerprint_dedup` na `(tenant_id, document_fingerprint, contact_id)` pro skutečnou deduplikaci nahrávání přes SHA-256 fingerprint v `/api/documents/upload` a `/api/documents/quick-upload` | [documents-fingerprint-dedup-index-2026-04-20.sql](../packages/db/migrations/documents-fingerprint-dedup-index-2026-04-20.sql) |
| 2026-04-20 | WS-2/WS-3 Batch 4 Slice 1 — `audit_log` append-only hardening: drop UPDATE/DELETE policies + REVOKE UPDATE/DELETE z `PUBLIC`, `authenticated`, `anon`, `aidvisora_app`. Zachovány jsou tenant SELECT/INSERT politiky. Vzor podle `billing_audit_log` | [audit-log-append-only-2026-04-20.sql](../packages/db/migrations/audit-log-append-only-2026-04-20.sql) |
| 2026-04-20 | Rodinné role domácnosti: mapování legacy hodnot (`primary`→`partner`, `member`→`jiny`, `child`→`dite`) + CHECK constraint na nové enum (`otec, matka, syn, dcera, partner, partnerka, dite, prarodic, jiny`). Pár řádku běželo bez role → zůstávají `jiny`. | [household_members_family_roles_2026-04-20.sql](../packages/db/migrations/household_members_family_roles_2026-04-20.sql) |
| 2026-04-21 | Produkce (UX blocker): `contracts.bj_units` (numeric 14,4) + `contracts.bj_calculation` (jsonb) + částečný index `idx_contracts_tenant_advisor_bj` pro rychlé součty BJ za období. Bez toho `getProductionSummary` padal na 42703 a obrazovka Produkce se na mobilu vůbec nenačetla. | [add_bj_units_on_contracts_2026-04-21.sql](../packages/db/migrations/add_bj_units_on_contracts_2026-04-21.sql) |

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

<details>
<summary><strong>rls-unify-guc-app-tenant-id-2026-04-19.sql</strong> — WS-2 Batch 1 / M1: sjednocení GUC na <code>app.tenant_id</code></summary>

Odkaz: [`packages/db/migrations/rls-unify-guc-app-tenant-id-2026-04-19.sql`](../packages/db/migrations/rls-unify-guc-app-tenant-id-2026-04-19.sql)

</details>

<details>
<summary><strong>rls-cleanup-legacy-clients-contracts-tenant-2026-04-19.sql</strong> — WS-2 Batch 1 / M2: cleanup legacy <code>clients</code>-based RLS, contracts přes tenant_id</summary>

Odkaz: [`packages/db/migrations/rls-cleanup-legacy-clients-contracts-tenant-2026-04-19.sql`](../packages/db/migrations/rls-cleanup-legacy-clients-contracts-tenant-2026-04-19.sql)

</details>

<details>
<summary><strong>advisor-proposals-2026-04-19.sql</strong> — Návrhy od poradce pro klientskou zónu</summary>

Odkaz: [`packages/db/migrations/advisor-proposals-2026-04-19.sql`](../packages/db/migrations/advisor-proposals-2026-04-19.sql)

</details>

<!-- Nový záznam: přidej řádek do tabulky Log a nový blok <details> nad tento komentář (nejnovější v tabulce i v detailech vždy poslední). -->
