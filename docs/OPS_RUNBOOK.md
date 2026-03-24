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
