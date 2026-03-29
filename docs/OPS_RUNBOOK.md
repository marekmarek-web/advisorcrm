# Aidvisor – Provozní příručka

## Rollback

### Vercel deploy rollback
1. Jdi na https://vercel.com → projekt → Deployments
2. Najdi poslední funkční deploy
3. Klikni "..." → "Promote to Production"

### DB migrace rollback
- Záloha je automatická (Supabase daily backup)
- Pro manuální: `pg_dump -Fc -h <host> -U postgres -d postgres > backup_$(date +%Y%m%d).dump`
- Obnovení: `pg_restore -h <host> -U postgres -d postgres backup.dump`

## Cron jobs

| Cron | Cesta | Frekvence | CRON_SECRET |
|------|-------|-----------|-------------|
| FA follow-up | /api/cron/fa-followup | Denně 06:00 UTC | Povinný v production |
| Service reminders | /api/cron/service-reminders | Denně 07:00 UTC | Povinný v production |

V repu je `apps/web/vercel.json` s polem `crons` – po deployi zkontroluj **Vercel → Project → Cron Jobs**, že se zobrazily (na některých plánech může být cron placený).

**Kde nastavit `CRON_SECRET`:** Vercel → tvůj projekt → **Settings** → **Environment Variables** → přidej `CRON_SECRET` (dlouhý náhodný řetězec, např. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), scope **Production** (a případně Preview). Stejnou hodnotu musí route ověřit přes hlavičku `Authorization: Bearer <CRON_SECRET>` – Vercel u naplánovaných cronů **posílá tuto hlavičku automaticky**, pokud je proměnná nastavená.

**Pozn.:** Cursor / Vercel MCP nemá nástroj na zápis env proměnných – musíš to doplnit v dashboardu, nebo po `vercel login` z kořene projektu webu:  
`vercel env add CRON_SECRET` → vyber Production (a případně Preview) → vlož hodnotu.

Ověření ručně z terminálu:  
`curl -H "Authorization: Bearer TVUJ_CRON_SECRET" "https://tvoje-domena.cz/api/cron/fa-followup"`

**Nenastavuj ručně** env `VERCEL_GIT_COMMIT_SHA` (nebo ho smaž) – Vercel si commit SHA doplňuje sám; literál může rozházet Sentry release.

---

## Kde co udělat (Supabase + Vercel + Sentry) – stručně

### 1) SQL migrace (Supabase)

1. Otevři **Supabase** → projekt → **SQL Editor**.
2. Vlož obsah souborů v tomto pořadí (nebo znovu celý opravený soubor):
   - `packages/db/migrations/pre-launch-data-integrity.sql`  
     *(nahoře teď přidává `archived_at` / `archived_reason` na `contacts` – bez toho padá index.)*
   - `packages/db/migrations/pre-launch-document-types.sql`
3. **Run**. Pokud už část první migrace proběhla, můžeš spustit jen chybějící řádky (např. jen `ALTER TABLE contacts ...` a pak `CREATE UNIQUE INDEX ...`).

#### Tabulka `documents` (portal upload, sken, quick-upload)

Po každém deployi, který mění dokumentová API nebo Drizzle schéma `documents`, ověř v produkci sloupce. Pokud upload padá na `column … does not exist`, spusť migrace v tomto pořadí (všechny používají `IF NOT EXISTS`, opakované spuštění je bezpečné):

1. `packages/db/migrations/add-document-upload-source.sql` — `upload_source` (legacy jednosouborová migrace)
2. `packages/db/migrations/ensure_documents_list_columns.sql` — sloupce pro seznam dokumentů
3. `packages/db/drizzle/0011_documents_sensitive.sql` — `sensitive`
4. `packages/db/drizzle/0016_document_processing.sql` — processing sloupce + `document_processing_jobs` *(přeskočitelné, pokud bod 5 už proběhl celý)*
5. **`packages/db/migrations/documents_schema_sync_2026.sql`** — **doplní všechny chybějící sloupce** vůči `packages/db/src/schema/documents.ts` včetně `source_channel`, `document_fingerprint`, `business_status`, JSON polí pro pipeline atd., a zajistí tabulku/indexy pro `document_processing_jobs`.

Pro nový projekt nebo jednorázový „catch-up“ často stačí jen spustit bod **5** (pokud základní tabulka `documents` už existuje). Ověření:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'documents'
ORDER BY ordinal_position;
```

Lokálně / po nasazení SQL ověřte z kořene repa (`DATABASE_URL` musí mířit na stejnou DB):

`pnpm db:verify-documents-schema`

Pokud migrace chybí, serverová akce `listDocuments` může vrátit prázdný seznam a v logu označit pravděpodobný drift schématu — jde o měkký fallback; produkční stav je vždy po aplikaci SQL výše.

### 2) Env proměnné na Vercelu

**Lokální `.env.local` se na Vercel nepřenáší** – každou proměnnou, kterou máš v `apps/web/.env.local` a kterou aplikace v produkci potřebuje, musíš znovu zadat v dashboardu (nebo `vercel env add`). U Adobe PDF Services viz tabulku **Document Processing (Adobe PDF Services)** níže.

1. **vercel.com** → vyber **projekt** (web app).
2. **Settings** → **Environment Variables**.
3. Přidej/uprav proměnné (Production; případně Preview):

| Klíč | Kde vzít hodnotu |
|------|------------------|
| `DATABASE_URL` | Supabase → Settings → Database → connection string |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase → Settings → API |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase → anon public key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase → service_role (tajné) |
| `CRON_SECRET` | **ne** z Sentry – vlastní tajný náhodný řetězec (např. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`) |
| `NEXT_PUBLIC_SENTRY_DSN` | DSN z Sentry (prohlížeč + fallback na serveru) |
| `SENTRY_DSN` | volitelně stejný DSN jen pro server (jinak stačí public) |
| `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` | volitelně pro upload source maps při `next build` / na Vercelu |
| `RESEND_API_KEY` | Resend → API Keys (tajné) |
| `RESEND_FROM_EMAIL` | Fallback odesílatele; pro přihlášeného poradce se často generuje **From** z jména + domény (viz níže) |
| `RESEND_FROM_DOMAIN` | Např. `aidvisora.cz` – doména ověřená v Resend pro tvar `jmeno.prijmeni.xxxxxx@aidvisora.cz` (jinak se bere z `RESEND_FROM_EMAIL`) |
| `RESEND_REPLY_TO` | Globální fallback pro **Reply-To**; u akcí přihlášeného poradce má přednost e-mail z profilu / Supabase účtu |
| ostatní | viz tabulka „Env proměnné (production)“ níže |

**Resend (klíč a doména):** `RESEND_API_KEY` nikdy necommitovat – jen Vercel / lokální `.env.local`. Po úniku klíče ho v [Resend → API Keys](https://resend.com/api-keys) zruš, vytvoř nový, nastav na Vercelu a **Redeploy**. Vlastní odesílatel (`RESEND_FROM_EMAIL` nebo generovaný From přes `RESEND_FROM_DOMAIN`) vyžaduje ověřenou doménu v Resend **Domains** (DNS).

**E-maily (From / Reply-To):** U přihlášeného poradce aplikace sestaví **From** jako zobrazované jméno + adresa `jmeno.prijmeni.<suffix>@RESEND_FROM_DOMAIN` (suffix z userId kvůli jednoznačnosti), pokud je doména známa. **Reply-To** = `user_profiles.email` → jinak Supabase **user.email** → jinak `RESEND_REPLY_TO`. Cron **service-reminders** (bez přihlášeného uživatele): **Reply-To** = `tenants.notification_email`, pak `RESEND_REPLY_TO`. Viz [`advisor-mail-headers.ts`](../apps/web/src/lib/email/advisor-mail-headers.ts).

4. Po změně env často stačí **Redeploy** posledního deploye (Deployments → … → Redeploy).

### 3) Sentry

V repu je manuální setup podle [sentry-for-ai `sentry-nextjs-sdk/SKILL.md`](https://github.com/getsentry/sentry-for-ai/blob/main/skills/sentry-nextjs-sdk/SKILL.md): `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`, `withSentryConfig` v `next.config.js`, tunel `/monitoring`.

1. V Sentry vytvoř projekt (Next.js), zkopíruj **DSN**.
2. Na Vercel přidej **`NEXT_PUBLIC_SENTRY_DSN`** (a volitelně `SENTRY_DSN`). Pro čitelné stack trace v produkci: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (viz [Auth tokens](https://sentry.io/settings/auth-tokens/)).
3. Volitelně interaktivní wizard (jiný výstup než ruční soubory): `npx @sentry/wizard@latest -i nextjs` ve `apps/web`.
4. Ověření: dočasně `throw new Error("Sentry test")` v API route → Issues v Sentry do ~30 s.

### 4) Ověření cronů

1. Vercel → **Cron Jobs** (nebo **Settings → Cron Jobs**) – měly by být cesty z `vercel.json`.
2. Ověř v **Functions / Logs**, že v čase běhu přišel request a vrátil 200 (ne 401 – špatný secret, ne 500 – chybí `CRON_SECRET`).

## Monitoring

- **Error tracking**: Sentry (`NEXT_PUBLIC_SENTRY_DSN` / `SENTRY_DSN`) – viz soubory v `apps/web/src` výše
- **Logy**: Vercel Function Logs (real-time)
- **Rate limiting**: In-memory per instance (viz lib/security/rate-limit.ts)

## Env proměnné (production)

| Proměnná | Povinná | Popis |
|----------|---------|-------|
| DATABASE_URL | ✅ | Postgres connection string |
| NEXT_PUBLIC_SUPABASE_URL | ✅ | Supabase project URL |
| NEXT_PUBLIC_SUPABASE_ANON_KEY | ✅ | Supabase anon key |
| SUPABASE_SERVICE_ROLE_KEY | ✅ | Supabase service role key |
| OPENAI_API_KEY | ⚠️ | Potřeba pro AI funkce |
| CRON_SECRET | ⚠️ | Potřeba pro cron endpointy |
| INTEGRATIONS_ENCRYPTION_KEY | ⚠️ | Šifrování OAuth tokenů |
| RESEND_API_KEY | ⚠️ | E-mailové notifikace |
| RESEND_FROM_EMAIL | ⚠️ | Ověřený odesílatel v Resend |
| RESEND_REPLY_TO | ❌ | Globální fallback Reply-To |
| RESEND_FROM_DOMAIN | ❌ | Doména pro generovaný From (`jmeno.prijmeni…@domain`) |
| GOOGLE_CLIENT_ID | ⚠️ | Google OAuth integrace |
| GOOGLE_CLIENT_SECRET | ⚠️ | Google OAuth integrace |
| NEXT_PUBLIC_SENTRY_DSN | ❌ | Sentry v prohlížeči (+ server fallback) |
| SENTRY_DSN | ❌ | Sentry jen server/edge (volitelný override) |
| SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT | ❌ | Upload source maps při buildu |

### Stripe (předplatné workspace)

| Proměnná | Popis |
|----------|--------|
| `STRIPE_SECRET_KEY` | Secret API key (stejný režim test/live jako ceny) |
| `STRIPE_WEBHOOK_SECRET` | Signing secret z webhooku mířícího na `/api/stripe/webhook` |
| `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY` | Publishable key (volitelné pro budoucí Stripe.js) |
| `STRIPE_PRICE_STARTER_MONTHLY` / `_YEARLY` | Price ID (`price_…`) ze Stripe Products |
| `STRIPE_PRICE_PRO_MONTHLY` / `_YEARLY` | Stejně |
| `STRIPE_PRICE_TEAM_MONTHLY` / `_YEARLY` | Stejně |
| `STRIPE_TRIAL_PERIOD_DAYS` | Zkušební dny před první fakturací (výchozí 14; `0` = bez trial) |
| `STRIPE_PRICE_ID` | Legacy: jedna cena, jen pokud **není** nastavená žádná `STRIPE_PRICE_*_*` |

**Důležité:** Price ID z test režimu nefungují s `sk_live_…` a naopak. Webhook URL musí být plná cesta, např. `https://www.aidvisora.cz/api/stripe/webhook`.

### Document Processing (Adobe PDF Services)

| Proměnná | Povinné | Popis |
|----------|---------|--------|
| `DOCUMENT_PROCESSING_PROVIDER` | ❌ | `"adobe"` / `"disabled"` / `"none"` (výchozí `"none"`) |
| `DOCUMENT_PROCESSING_ENABLED` | ❌ | `"true"` zapne processing pipeline |
| `DOCUMENT_EXTRACT_ENABLED` | ❌ | `"true"` zapne strukturovanou extrakci (stojí extra Adobe transakce) |
| `ADOBE_PDF_SERVICES_CLIENT_ID` | ❌ | Client ID (povinné když provider=adobe). Alias: `PDF_SERVICES_CLIENT_ID` (Adobe ukázky). |
| `ADOBE_PDF_SERVICES_CLIENT_SECRET` | ❌ | Client secret. Alias: `PDF_SERVICES_CLIENT_SECRET`. |
| `ADOBE_PDF_SERVICES_REGION` | ❌ | `ew1` = host `pdf-services-ew1.adobe.io` (EU), `ue1` = `pdf-services-ue1.adobe.io`, jinak výchozí `pdf-services.adobe.io`. Výchozí v aplikaci: `ew1`. |
| `ADOBE_OCR_LANG` | ❌ | Jazyk pro OCR (např. `en-US`). Výchozí `en-US`; `cs-CZ` jen pokud Adobe API přijme. |

**Extract PDF** vrací ZIP (`structuredData.json` + přílohy). Aplikace ukládá ZIP i vyextrahovaný JSON do bucketu `documents`.

**Bez Adobe credentials systém funguje normálně** – upload, viewer a AI review s fallback kvalitou. Adobe je volitelný enhancement.

## Backup

- **Automatické**: Supabase provádí denní zálohy (viz Supabase Dashboard → Database → Backups)
- **Manuální**: `pg_dump` příkaz výše
- **Storage**: Supabase Storage bucket "documents" – zálohovat podle potřeby

## Support flow

1. Bugy od uživatelů: GitHub Issues nebo dedicovaný kanál
2. Kritické chyby: Sentry alerts → email/Slack
3. Eskalace: kontaktovat vývojový tým

---

## Cursor MCP: PostHog, Postman, Clerk, Langfuse (nástroje pro AI v editoru)

Tyto integrace **nejsou** nasazené závislosti webu samy o sobě – jde o **MCP servery v Cursoru**, které rozšiřují asistenta (dokumentace, přístup k účtům po přihlášení). Stav aplikace `apps/web` je níže.

### PostHog MCP (`plugin-posthog-posthog`)

- **K čemu:** produktová analytika (události, feature flags, …) na posthog.com; MCP po přihlášení umožní asistentovi pracovat s obsahem tvého PostHog workspace.
- **Ověření:** Cursor → nastavení MCP → u serveru PostHog dokonči přihlášení (nástroj `mcp_auth` otevře flow v prohlížeči). Po úspěchu by měly být k dispozici další PostHog nástroje kromě `mcp_auth`.
- **Aplikace:** v `apps/web/package.json` **není** `posthog-js` – sledování v CRM až po záměru přidat SDK a env klíče.

### Postman MCP (`plugin-postman-postman`)

- **K čemu:** kolekce a workspace na postman.com; MCP po přihlášení napojí asistenta na tvůj účet.
- **Ověření:** v **Cursor → Settings → MCP** u serveru Postman musí být přihlášení v pořádku (zelený / connected). V detailu serveru uvidíš seznam nástrojů (např. `getWorkspaces`, `getCollections`, `getCollection` – záleží na verzi pluginu). Rychlý test v **novém** chatu s agentem: *„Pomocí Postman MCP vyjmenuj moje workspace.“* Pokud agent nástroje nevidí, zkus znovu otevřít projekt nebo restart Cursoru po dokončení OAuth.
- **Aplikace:** lokální běh API a e2e testy zůstávají u `pnpm dev`, Playwright, vlastních skriptů; MCP nespouští server za tebe.

### Clerk MCP (`plugin-clerk-clerk`)

- **K čemu:** oficiální **SDK snippetů** (ne přímý dashboard). Asistent může volat např. `list_clerk_sdk_snippets` (filtr tag `auth`) a `clerk_sdk_snippet` se slugy jako `server-auth-nextjs`, `b2b-saas`, `use-auth`.
- **Ověření:** v chatu s agentem požádej o Clerk snippet pro Next.js App Router – očekávej obsah pro `@clerk/nextjs/server` a `clerkMiddleware`.
- **Aplikace:** Aidvisor používá **Supabase Auth** (`apps/web/src/lib/auth/require-auth.ts`), ne Clerk. Clerk MCP slouží k návrhu/migraci, ne k auditu současného přihlášení.

### Langfuse

- **V této workspace není** samostatný Langfuse MCP server v `mcps/`. Pro dokumentaci a CLI existuje Cursor skill **langfuse** (`npx langfuse-cli`, env `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`).
- **Kdy ověřovat:** až po přidání LLM tracingu do kódu – pak Langfuse UI a/nebo CLI nad trace/prompt daty.

### Shrnutí stacku webu (kontrola reality)

| Oblast | Stav v repu |
|--------|-------------|
| Přihlášení | Supabase (`@supabase/ssr`, `@supabase/supabase-js`), viz `require-auth` |
| Chyby / výkon | Sentry (`@sentry/nextjs`), Vercel Speed Insights |
| PostHog / Clerk / Langfuse v závislostech | **Nejsou** v `apps/web/package.json` |
| API testy | Vitest, Playwright (`test:e2e`) |
