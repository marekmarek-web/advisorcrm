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
| 2026-04-21 | Úklid katalogu: merge duplicitních partnerů case-insensitive (Uniqa/UNIQA → UNIQA, Investika/INVESTIKA → INVESTIKA) s přepisem FK v `contracts`, `payment_accounts` a `client_payment_setups`; dedup produktů v rámci (partner, segment); odstranění ČSOB/HYPO duplicity vs. ČSOB Hypoteční banka; odstranění segmentu ZDRAV (guard na 0 smluv, jinak RAISE EXCEPTION) | [catalog-dedup-partners-products-2026-04-21.sql](../packages/db/migrations/catalog-dedup-partners-products-2026-04-21.sql) |
| 2026-04-21 | Gap fill (priorita 1–5) + odstranění Moneta: FK `contracts.partner_id` / `payment_accounts.partner_id` / `client_payment_setups.partner_id` → NULL pro Moneta, DELETE globálních produktů Moneta, DELETE globálního partnera Moneta (HYPO + UVER). Nové partnery (Generali Česká pojišťovna, UNIQA Penzijní společnost, Modrá pyramida) a nové segmenty (CEST, FIRMA_POJ) doplní `pnpm run db:seed-catalog` z aktualizovaného `catalog.json` | [catalog-moneta-removal-2026-04-21.sql](../packages/db/migrations/catalog-moneta-removal-2026-04-21.sql) |
| 2026-04-22 | Segment ODP_ZAM (Odpovědnost zaměstnance): idempotentní backfill `contracts.segment` a `client_payment_setups.segment` z `ODP` → `ODP_ZAM` kde product/provider name obsahuje „zaměstnanec". Nové partnery (Allianz pojišťovna, ČPP, ČSOB pojišťovna, Generali Česká pojišťovna, Kooperativa, UNIQA) doplní `pnpm run db:seed-catalog` | [catalog-odp-zam-segment-2026-04-22.sql](../packages/db/migrations/catalog-odp-zam-segment-2026-04-22.sql) |
| 2026-04-22 | Doplnění reálných produktů do 41 (partner, segment) kombinací (viz [catalog-product-fills-2026-04-22.md](catalog-product-fills-2026-04-22.md)) + přejmenování escape-hatche: UPDATE products SET name='Vlastní produkt (zadejte název)' WHERE name='Ostatní (doplnit z dropdownu)' + is_tbd=FALSE. Nové reálné produkty doplní `pnpm run db:seed-catalog` z aktualizovaného `catalog.json` (Allianz FIRMA_POJ / ATRIS INV / Avant INV / Cyrrus INV / ČPP 5× / ČSOB UVER / ČSOB Hypoteční banka HYPO / ČSOB pojišťovna 3× / Direct 5× / J&T INV / Komerční banka UVER / Kooperativa 5× / Maxima 3× / mBank 2× / Moventum INV / Oberbank 2× / Pillow 2× / Raiffeisen Leasing UVER / Raiffeisenbank UVER / RSTS HYPO / UNIQA FIRMA_POJ / Česká spořitelna UVER) | [catalog-fill-tbd-products-2026-04-22.sql](../packages/db/migrations/catalog-fill-tbd-products-2026-04-22.sql) |
| 2026-04-22 | KPI „Měsíční investice" oprava: backfill `portfolio_attributes.paymentType` pro INV/DPS/DIP smlouvy, kde chyběl. Když `paymentFrequencyLabel`/`paymentFrequency` obsahuje „jednoráz"/„one time"/„single"/„lump" → `one_time`, jinak `regular`. Idempotentní (nepřepisuje existující hodnotu). Zastavuje halucinaci KPI pro jednorázové investice, které se do té doby počítaly jako měsíční | [portfolio-attributes-payment-type-backfill-2026-04-22.sql](../packages/db/migrations/portfolio-attributes-payment-type-backfill-2026-04-22.sql) |
| 2026-04-22 | F5 v3 — institucionální platební účty (druhý audit): k v2 přidány sloupce `payment_accounts.constant_symbol`, `specific_symbol_template` (literál nebo placeholder {birthNumber}/{ico}/{yearMonth}), `symbol_rules_note`. Opraveny bankovní názvy: `/0800` je Česká spořitelna, ne ČSOB (Kooperativa, NN PS, KB PS, ČPP běžné + mimořádné, Conseq DPS extra/employer). Conseq DPS regular (sdružená platba účastníka 662266-{contractNumber}/2700) má nyní VS POVINNÝ = číslo smlouvy, KS = 558. Conseq DPS rozděleno na regular (účastník sdružená) / extra (mimořádný příspěvek účastníka, SS=99, KS=558) / employer (individuální zaměstnavatel, SS=IČ, KS=3552); hromadný employer (VS=IČ, SS=RRRRMM) dokumentovaný v `symbol_rules_note` pro ruční zadání. ČSOB PS dostává KS=3558 a SS={birthNumber}. Conseq DIP employer SS={ico}. Direct všechny řádky označeny jako FALLBACK v notes s alternativním účtem 2330257/0100. Přidány NN životní varianty: productCode `contract_10_digit` (1000588419/3500) a `contract_8_digit` (1010101010/3500) — zdroj https://www.nn.cz/poradna/pojistovna/platby.html. Seed migrace je destruktivní vůči `tenant_id IS NULL` (DELETE + reseed); tenant overrides ponechány. ZÁMĚRNĚ VYNECHÁNO: Generali Česká pojišťovna | [payment-accounts-institutional-defaults-2026-04-22.sql](../packages/db/migrations/payment-accounts-institutional-defaults-2026-04-22.sql) |
| 2026-04-22 | Team Overview F1 — canonical `team_members` + `team_member_manual_periods` + `team_member_career_log`. team_members je source of truth pro osobu v týmové struktuře, nezávislá na auth (auth_user_id nullable, unique per tenant when not null). Hierarchie přes parent_member_id, status active/paused/offboarded/planned, member_kind internal_user/external_manual. Manual periods drží period snapshoty (units, production, contracts, meetings, activities + pool_units JSONB pro BJ/BJS/PB/CC) s confidence manual_confirmed/manual_estimated. Career log auditně loguje change_kind auto/manual_confirmed/manual_override. Backfill z existing memberships (idempotentní) + shadow-copy trigger `sync_team_member_from_membership` udržuje team_members konzistentní při změnách memberships. RLS tenant-scoped (NULLIF pattern), grants na aidvisora_app. | [team-members-canonical-2026-04-22.sql](../packages/db/migrations/team-members-canonical-2026-04-22.sql) |
| 2026-04-22 | WS-2 Batch M1-SQL — Bootstrap provisioning + RLS gaps + NULLIF normalizace. Tři SECURITY DEFINER funkce: `provision_workspace_v1(uuid,text,text,text,int)` (ensure-workspace), `resolve_public_booking_v1(text)` (public booking pre-auth), `lookup_invite_metadata_v1(text,text)` (invite prefill). Bootstrap RLS na `client_invitations` + `staff_invitations` (self select přes `auth_user_id = app.user_id`). Nové policies + FORCE RLS na `user_terms_acceptance`, `user_devices`, `unsubscribe_tokens`, `opportunity_stages`, `partners` (read-all + tenant-write), `products` (via partner), `fund_add_requests`, `dead_letter_items`, `ai_generations`, `ai_feedback` (via generation), `analysis_import_jobs`, `analysis_versions` (via analysis). Normalizace existujících policies na robustní `NULLIF(current_setting('app.tenant_id', true), '')::uuid` pattern (fail-closed → 0 řádků místo SQLSTATE) napříč contacts, households, documents, financial_*, tasks, opportunities, audit_log, activity_log, tenant_settings, contracts, messages/message_attachments, advisor_proposals (jen tenant_* scope), advisor_notifications, assistant_conversations/messages, client_requests*. Všechny grants na `aidvisora_app`. **HARD BLOCKER pro cutover na `aidvisora_app` runtime.** | [rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql](../packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql) |
| 2026-04-22 | WS-2 Batch M3-SQL — Pre-auth bootstrap SECURITY DEFINER funkce pro zbylé flow, které nemůžou mít tenant GUC (token-based pre-auth): `public.accept_staff_invitation_v1(token,auth_user_id,email)` pro `/register/complete → finalizePendingStaffInvitation` (ověří token+expiraci+revoke+email match, idempotentně vloží membership + stampne invitation) a `public.process_unsubscribe_by_token_v1(token)` pro `/client/unsubscribe?token=…` (atomicky stampne `contact.notification_unsubscribed_at` + `token.used_at`). Obě vrací strukturované `(ok, error_code, …)` — caller přeloží error_code na uživatelskou hlášku. Grants `aidvisora_app` + `authenticated` (+ `anon` pro unsubscribe). Sanity check ověří existenci funkcí, SECURITY DEFINER attribut a EXECUTE grant pro `aidvisora_app`. **Dependency pro M3 cutover — bez ní by staff invite a unsubscribe-by-token po swapu selhaly.** | [rls-m9-bootstrap-sd-functions-2026-04-22.sql](../packages/db/migrations/rls-m9-bootstrap-sd-functions-2026-04-22.sql) |

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

<details>
<summary><strong>catalog-dedup-partners-products-2026-04-21.sql</strong> — Úklid katalogu: merge duplicitních partnerů (Uniqa/UNIQA, Investika/INVESTIKA), dedup produktů, odstranění ZDRAV a ČSOB/HYPO duplicity</summary>

Odkaz: [`packages/db/migrations/catalog-dedup-partners-products-2026-04-21.sql`](../packages/db/migrations/catalog-dedup-partners-products-2026-04-21.sql)

</details>

<details>
<summary><strong>catalog-moneta-removal-2026-04-21.sql</strong> — Gap fill (priorita 1–5) + odstranění Moneta: FK přepsán na NULL, DELETE globálního partnera/produktů Moneta. Nové partnery (Generali Česká pojišťovna, UNIQA Penzijní společnost, Modrá pyramida) a segmenty CEST + FIRMA_POJ doplní seed script.</summary>

Odkaz: [`packages/db/migrations/catalog-moneta-removal-2026-04-21.sql`](../packages/db/migrations/catalog-moneta-removal-2026-04-21.sql)

</details>

<details>
<summary><strong>catalog-fill-tbd-products-2026-04-22.sql</strong> — Přejmenování escape-hatche „Ostatní (doplnit z dropdownu)" → „Vlastní produkt (zadejte název)" + is_tbd=FALSE; reálné produkty pro 41 (partner, segment) kombinací doplní seed</summary>

Odkaz: [`packages/db/migrations/catalog-fill-tbd-products-2026-04-22.sql`](../packages/db/migrations/catalog-fill-tbd-products-2026-04-22.sql)
Auditní poznámka: [`docs/catalog-product-fills-2026-04-22.md`](catalog-product-fills-2026-04-22.md)

</details>

<details>
<summary><strong>portfolio-attributes-payment-type-backfill-2026-04-22.sql</strong> — Backfill `portfolio_attributes.paymentType` pro INV/DPS/DIP smlouvy bez explicitní hodnoty (KPI „Měsíční investice" fix)</summary>

Odkaz: [`packages/db/migrations/portfolio-attributes-payment-type-backfill-2026-04-22.sql`](../packages/db/migrations/portfolio-attributes-payment-type-backfill-2026-04-22.sql)

</details>

<details>
<summary><strong>payment-accounts-institutional-defaults-2026-04-22.sql</strong> (v2 po auditu) — Rozšíření `payment_accounts` o `bank_code`, `variable_symbol_required`, `account_number_template`, `payment_type`, `product_code` + reseed pouze ověřených globálních platebních účtů</summary>

Odkaz: [`packages/db/migrations/payment-accounts-institutional-defaults-2026-04-22.sql`](../packages/db/migrations/payment-accounts-institutional-defaults-2026-04-22.sql)
Datový zdroj: [`packages/db/src/data/institution-payment-accounts-v1.json`](../packages/db/src/data/institution-payment-accounts-v1.json)
Audit se zdroji: [`docs/institution-payment-accounts-audit-2026-04-22.md`](institution-payment-accounts-audit-2026-04-22.md)

**Důležité:** v1 obsahovala halucinovaná čísla (NN PS 2270100, Allianz PS 1234567, UNIQA PS 3024900010, KB PS 786786786, ČPP 2727272727, ČSOB pojišťovna 35-1003970707 univerzální, Direct 2102262727, Pillow 107-9876543210, NN životní 2270200, Generali 2220002227 a Conseq s `/0100` templatem). v2 je provádí `DELETE WHERE tenant_id IS NULL` a znovu naseeduje pouze ověřené řádky. Tenant overrides (tenant_id != NULL) migrace neřeší.

</details>

<details>
<summary><strong>rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql</strong> — WS-2 Batch M1-SQL: SECURITY DEFINER funkce pro bootstrap/pre-auth (provision_workspace_v1, resolve_public_booking_v1, lookup_invite_metadata_v1) + RLS gap tabulky + NULLIF normalizace policies. HARD BLOCKER pro cutover na `aidvisora_app`.</summary>

Odkaz: [`packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql`](../packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql)

**SECURITY DEFINER funkce:**
- `public.provision_workspace_v1(p_user_id uuid, p_email text, p_slug text, p_trial_plan text, p_trial_days int) → uuid` — atomicky vytvoří `tenants + roles(6) + admin membership + opportunity_stages(6)`. Idempotentní přes membership lookup (1 user = 1 tenant). Volá se z `apps/web/src/lib/auth/ensure-workspace.ts`.
- `public.resolve_public_booking_v1(p_token text) → TABLE(tenant_id, user_id, tenant_name, advisor_name, slot_minutes, buffer_minutes, availability)` — pre-auth lookup veřejného booking URL. Volá se z `apps/web/src/lib/public-booking/data.ts`.
- `public.lookup_invite_metadata_v1(p_token text, p_kind text) → TABLE(kind, email, expires_at, first_name, tenant_name)` — pre-auth prefill invite formuláře (client i staff pozvánky). Volá se z `apps/web/src/app/api/invite/metadata/route.ts`.

**Nové RLS policies + FORCE RLS:**
- Bootstrap tier: `client_invitations_self_bootstrap_select`, `staff_invitations_self_bootstrap_select` (přes `auth_user_id = app.user_id` / `auth.uid()`).
- Gap tabulky: `user_terms_acceptance` (self/tenant append-only), `user_devices` (tenant-scoped), `unsubscribe_tokens` (přes contacts join), `opportunity_stages` (tenant), `partners` (read-all + tenant-write; globální katalog tenant_id IS NULL je read-only), `products` (read/write přes partner.tenant_id), `fund_add_requests`, `dead_letter_items`, `ai_generations`, `ai_feedback` (přes generation), `analysis_import_jobs`, `analysis_versions` (přes analysis).

**NULLIF normalizace existujících policies:**
- Drop + recreate tenant_* policies na: contacts, households, documents, document_extractions, document_extraction_fields, contract_upload_reviews, contract_review_corrections, contact_coverage, tasks, opportunities, financial_analyses, financial_shared_facts, fa_plan_items, fa_sync_log, consents, processing_purposes, aml_checklists, exports, audit_log (SELECT/INSERT only, append-only hardening drží), activity_log, communication_drafts, reminders, meeting_notes, portal_notifications, tenant_settings, contracts, messages, advisor_proposals (tenant scope; client scope přes `client_contacts` zůstává), advisor_notifications, assistant_conversations, assistant_messages, client_requests, client_request_files.
- Vzor: `tenant_id = NULLIF(current_setting('app.tenant_id', true), '')::uuid` + `IS NOT NULL` guard → bez GUC vrátí 0 řádků místo SQLSTATE 22P02.

**Sanity kontroly v migraci (RAISE EXCEPTION při neúspěchu):**
- všechny 3 SECURITY DEFINER funkce existují + `aidvisora_app` má EXECUTE.
- Každá gap tabulka má ≥1 policy po migraci.
- `client_invitations_self_bootstrap_select` obsahuje `aidvisora_app` v `pg_policies.roles`.
- Žádná policy na core tabulkách nemá křehký `(SELECT current_setting('app.tenant_id', true))::uuid` pattern bez NULLIF guardu.
- Všechny gap tabulky mají `relforcerowsecurity = true`.

**Post-deploy verify (ruční):**
```sql
-- Test fail-closed GUC guard pod aidvisora_app:
SET ROLE aidvisora_app;
SELECT count(*) FROM public.contacts;   -- očekáváno: 0 (bez GUC)

-- Test SECURITY DEFINER funkcí:
SELECT public.provision_workspace_v1(gen_random_uuid(), 'test@example.com', 'test-ws-' || floor(random()*1000)::text, 'pro', 14);
SELECT * FROM public.resolve_public_booking_v1('neplatny-token');      -- 0 rows
SELECT * FROM public.lookup_invite_metadata_v1('neplatny', 'client');  -- 0 rows
RESET role;
```

</details>

<!-- Nový záznam: přidej řádek do tabulky Log a nový blok <details> nad tento komentář (nejnovější v tabulce i v detailech vždy poslední). -->
