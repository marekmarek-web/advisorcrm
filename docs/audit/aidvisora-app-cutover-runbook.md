# aidvisora_app runtime cutover — MANUAL runbook

> **Status dokumentu:** source-of-truth pro MANUAL fázi cutoveru runtime DB role
> z `postgres` (BYPASSRLS) na `aidvisora_app` (NOSUPERUSER, NOBYPASSRLS).
> Repo-side fáze (M1–M4, SQL migrace, static guard test, live integration test,
> smoke SQL pack, Sentry observability) je **DONE**.

---

## 0. Precheck — co už je v repu hotové

- `apps/web/src/lib/db/with-tenant-context.ts` — `withTenantContext`,
  `withUserContext`, Sentry error classification (`rls_deny`, `missing_guc`,
  `permission_denied`), UUID assert s test escape hatch.
- `apps/web/src/lib/auth/with-auth-context.ts` — `withAuthContext`,
  `withClientAuthContext`, `withTenantContextFromAuth`.
- `apps/web/src/lib/db/service-db.ts` — `dbService` + `withServiceTenantContext`
  pro cron/webhook dual identity (`DATABASE_URL_SERVICE`).
- `apps/web/src/lib/security/__tests__/ws2-batch6-full-swap-readiness.test.ts`
  — static guard s budget ratchet (`actions=0`, `api=0`, `lib=0`).
- `packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql`
  — bootstrap policies + NULLIF normalizace + audit_log append-only.
- `packages/db/migrations/rls-m9-bootstrap-sd-functions-2026-04-22.sql`
  — `accept_staff_invitation_v1`, `process_unsubscribe_by_token_v1`.
- `packages/db/migrations/rls-m10-storage-default-deny-2026-04-22.sql`
  — restrictive deny pro ne-`documents` buckety.
- `scripts/smoke-rls-aidvisora-app.sql` — 6-krokový SQL smoke pack.
- `apps/web/src/lib/db/__tests__/rls-live.test.ts` — gated live integration
  test (7 casů).

**Vitest baseline:** `main` = 107 failed / 3754 passed → s refactorem
= 79 failed / 3782 passed. Refactor **+28 green, 0 regression**.

---

## 1. Supabase — MANUAL (staging i prod)

Provést v tomto pořadí v obou prostředích (staging → prod).

### 1.1 Role `aidvisora_app`

V Supabase SQL Editor pod rolí `postgres`:

```sql
-- Ověření, že role existuje a má správné atributy
SELECT rolname, rolsuper, rolbypassrls, rolcanlogin
  FROM pg_roles
 WHERE rolname = 'aidvisora_app';
-- Očekávání: rolsuper=false, rolbypassrls=false, rolcanlogin=true.

-- Nastavit / rotovat heslo (NE commitovat do repa, ukládat do 1Password)
ALTER ROLE aidvisora_app WITH LOGIN PASSWORD '<vygenerované>';
```

### 1.2 SQL migrace v pořadí

Spustit přesně v tomto pořadí (každou jako samostatný transakční blok;
pokud kterákoliv skončí s `ERROR`, **STOP** a řešit).

1. `packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql`
2. `packages/db/migrations/rls-m9-bootstrap-sd-functions-2026-04-22.sql`
3. `packages/db/migrations/rls-m10-storage-default-deny-2026-04-22.sql`

Všechny tři jsou idempotentní (používají `CREATE POLICY IF NOT EXISTS` /
`DROP ... IF EXISTS` a `CREATE OR REPLACE FUNCTION`), takže se dají spustit
opakovaně.

### 1.3 Supabase hygiena

- `storage.objects` RLS ON (Supabase ji má default ON, ale verify
  `SELECT relrowsecurity FROM pg_class WHERE relname = 'objects';`).
- PITR / daily backup ON (Supabase Dashboard → Database → Backups).
- Pooler connect (Session mode nebo Transaction mode) otestovat přes psql
  s novým `aidvisora_app` heslem.

---

## 2. Repo-side smoke before swap

### 2.1 Live integration test proti staging

```bash
cd apps/web
DATABASE_URL_LIVE_RLS_TEST='postgres://aidvisora_app:<heslo>@<pooler>/postgres?sslmode=require' \
RLS_TEST_TENANT_A='<uuid staging tenant A>' \
RLS_TEST_TENANT_B='<uuid staging tenant B>' \
RLS_TEST_USER_A='<uuid staging user A>' \
RLS_TEST_USER_B='<uuid staging user B>' \
npx vitest run src/lib/db/__tests__/rls-live.test.ts
```

**Musí být 7/7 green.** Pokud cokoliv failne → STOP, nepřepínat.

### 2.2 SQL smoke pack v Supabase SQL Editor

```sql
\i scripts/smoke-rls-aidvisora-app.sql
```

nebo ručně okopírovat obsah. Každý krok zkontrolovat proti sekci
`=== VERDIKT ===` na konci skriptu. Všechny `leak_*` musí být 0, cross-tenant
INSERT musí hodit RLS violation.

### 2.3 Static guard lock

```bash
cd apps/web
npx vitest run src/lib/security/__tests__/ws2-batch6-full-swap-readiness.test.ts
```

Musí projít. Budget = 0/0/0 pro actions/api/lib.

---

## 3. Staging cutover (14-denní burn-in hold)

> **Sjednocení 2026-04-23:** původní "72h hold" nahrazen **14-denním burn-inem**
> v souladu s [`post-launch-roadmap-2026-04-22.md` B4.1](post-launch-roadmap-2026-04-22.md#b41--cutover-na-aidvisora_app-runtime-role)
> a SL-112. 72h je příliš krátké okno na zachycení tenant-specifických race
> conditions (týdenní cron cykly, měsíční billing ticks, low-frequency admin
> akce). Evidence log vyplňuj průběžně dle
> [`docs/launch/cutover-evidence-template.md`](../launch/cutover-evidence-template.md) §6.

1. Vercel staging → Environment Variables:
   - Uložit aktuální `DATABASE_URL` jako `DATABASE_URL_ROLLBACK` (postgres role).
   - Přepsat `DATABASE_URL` na `aidvisora_app` pooler string.
   - Nastavit `DATABASE_URL_SERVICE` na `postgres` role pooler string
     (service identity pro cron + webhooky).
2. Vercel staging → Redeploy.
3. Smoke manuálně (nebo přes Playwright ci):
   - Login (advisor + client portal)
   - Dashboard summary (kontakty, smlouvy, úkoly)
   - Contact detail + timeline
   - Contract list + detail
   - Document upload + preview + AI review read
   - Messages
   - Notifications
   - Events / Calendar
   - Client portal — sign in, overview, requests
   - Pre-auth: invite URL, unsubscribe URL
4. **14-denní burn-in** pod mixem syntetického + reálného staging traffiku
   (interní + pilot tenanti). Sentry filtr (alert A13, viz
   [`docs/observability/sentry-alerts.md`](../observability/sentry-alerts.md#a13--db-role-cutover-guard--db_error_kind-spike-p0)):
   - `db_error_kind:rls_deny` → **hard red**, rollback.
   - `db_error_kind:missing_guc` → **hard red**, fix před prod.
   - `db_error_kind:permission_denied` → hard red, chybí GRANT.
5. Rollback drill (povinný v rámci 14 dní): swap `DATABASE_URL` ↔
   `DATABASE_URL_ROLLBACK`, redeploy, smoke. Dokumentovat elapsed time
   (target < 10 min) v evidence packu §5.
6. Denní check-in do evidence packu §6 (min. D+1, D+3, D+7, D+14).

**GO gate pro prod:** 14 dní staging bez `db_error_kind` eventů + rollback
drill provedený a zdokumentovaný v evidence packu.

---

## 4. Prod cutover (maintenance window)

### 4.1 Pre-cutover (T-30 min)

- Oznámit maintenance (status.aidvisora.cz / in-app banner).
- Snapshot Sentry baseline error rate (poslední 24h).
- Otevřít Supabase Dashboard, Vercel Dashboard, Sentry Dashboard ve 3 tabech.
- Verify `aidvisora_app` heslo v Supabase prod odpovídá tomu, co je v Vercel
  `DATABASE_URL`.

### 4.2 SQL migrace (T-0)

Stejné pořadí jako v §1.2. Verify po každé migraci:

```sql
-- rls-m8 sanity (součást migrace; vyhodí EXCEPTION, pokud policies nejsou normalizované)
-- rls-m9 sanity
SELECT proname FROM pg_proc WHERE proname IN
  ('accept_staff_invitation_v1', 'process_unsubscribe_by_token_v1');
-- rls-m10 sanity
SELECT policyname FROM pg_policies WHERE tablename = 'objects' AND schemaname = 'storage'
  AND policyname LIKE 'storage_non_documents_deny_%';
```

### 4.3 Swap `DATABASE_URL` (T+5)

Vercel prod → Environment Variables → stejně jako v §3.1. Redeploy.

### 4.4 Canary rollout

- **Fáze A (T+10)**: interní uživatelé (founders + PB pilot advisors). 15 min.
- **Fáze B (T+25)**: 10 % traffic. 30 min.
- **Fáze C (T+55)**: 50 % traffic. 60 min.
- **Fáze D (T+115)**: 100 % traffic.

Mezi fázemi: Sentry `db_error_kind` filter, žádné `rls_deny` / `missing_guc` /
`permission_denied`. Pokud cokoliv → rollback (§5).

### 4.5 Smoke po 100 %

Stejný set jako §3.3. Navíc zkontrolovat:

- `SELECT count(*) FROM audit_log WHERE created_at > now() - interval '30 min';`
  — audit log stále píše.
- Cron joby: další tick `analytics-snapshot`, `grace-period-check`, projít
  bez chyby (Vercel Cron logs).

### 4.6 Soft-watch (24h)

- Sentry `db_error_kind:*` — 0.
- Error rate ≤ baseline.
- 0-row anomalies (alert na náhlý drop tenant-scoped čtení).

### 4.7 Post-cutover (po 24h soft-watch)

- **Rotate** staré `postgres` heslo (Supabase Dashboard → Settings → Database
  → Reset Password). Stále potřebné pro `DATABASE_URL_SERVICE` — takže rotovat
  a update env var.
- Smazat `DATABASE_URL_ROLLBACK` z Vercel (nebo nechat pro případ pozdějšího
  rollbacku, ale password už je rotated → rollback by vyžadoval re-reset).

---

## 5. Rollback (v kterékoliv fázi)

Pokud v canary nebo soft-watch objevíme `rls_deny` / `missing_guc` /
`permission_denied` spike:

1. Vercel prod → swap `DATABASE_URL` ↔ `DATABASE_URL_ROLLBACK`. Redeploy.
2. Ověř Sentry error rate klesá zpět na baseline.
3. Collect repro: tenantId, userId, route, full error message z Sentry.
4. Fixnout v repu (policy / wrapper), re-run staging cutover znovu.

**Rollback nevyžaduje SQL rollback** — rls-m8/m9/m10 jsou aditivní a běží
i pod `postgres` rolí. Policies se jen nepoužijí (BYPASSRLS je bypasuje).

---

## 6. Registration safety verdict

Po úspěšném cutoveru + 24h soft-watch:

- **Premium Brokers pilot (uzavřená skupina)** — GO.
- **Uzavřená beta (pozvánky přes `accept_staff_invitation_v1`)** — GO.
- **Veřejná self-serve registrace** — NO-GO, dokud nebude projet samostatný
  audit registrace (MFA gate, rate limit, workspace bootstrap quota, email
  deliverability). Tento runbook řeší pouze DB role cutover.

---

## 7. Artefakty (repo paths)

| Artefakt | Path |
| --- | --- |
| Bootstrap + NULLIF migration | `packages/db/migrations/rls-m8-bootstrap-provision-and-gaps-2026-04-22.sql` |
| SECURITY DEFINER funkce | `packages/db/migrations/rls-m9-bootstrap-sd-functions-2026-04-22.sql` |
| Storage default-deny | `packages/db/migrations/rls-m10-storage-default-deny-2026-04-22.sql` |
| SQL smoke pack | `scripts/smoke-rls-aidvisora-app.sql` |
| Live integration test | `apps/web/src/lib/db/__tests__/rls-live.test.ts` |
| Static guard ratchet | `apps/web/src/lib/security/__tests__/ws2-batch6-full-swap-readiness.test.ts` |
| Runtime tenant wrapper | `apps/web/src/lib/db/with-tenant-context.ts` |
| Auth wrappers | `apps/web/src/lib/auth/with-auth-context.ts` |
| Service identity wrapper | `apps/web/src/lib/db/service-db.ts` |

---

## 8. Kontakty / rozhodovatelé

- **GO / NO-GO** na staging → prod: majitel repo.
- **Rollback trigger**: kdokoliv s Vercel prod access, pokud vidí Sentry
  `db_error_kind:*` spike. Nečekat na eskalaci.
