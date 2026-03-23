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

**Kde nastavit `CRON_SECRET`:** Vercel → tvůj projekt → **Settings** → **Environment Variables** → přidej `CRON_SECRET` (dlouhý náhodný řetězec), scope **Production** (a případně Preview). Stejnou hodnotu musí route ověřit přes hlavičku `Authorization: Bearer <CRON_SECRET>` – Vercel u naplánovaných cronů často posílá tuto hlavičku automaticky, pokud je proměnná nastavená; jinak zkus ručně z terminálu:

`curl -H "Authorization: Bearer TVUJ_CRON_SECRET" "https://tvoje-domena.cz/api/cron/fa-followup"`

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
| ostatní | viz tabulka výše v tomto dokumentu |

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
| GOOGLE_CLIENT_ID | ⚠️ | Google OAuth integrace |
| GOOGLE_CLIENT_SECRET | ⚠️ | Google OAuth integrace |
| NEXT_PUBLIC_SENTRY_DSN | ❌ | Sentry v prohlížeči (+ server fallback) |
| SENTRY_DSN | ❌ | Sentry jen server/edge (volitelný override) |
| SENTRY_AUTH_TOKEN / SENTRY_ORG / SENTRY_PROJECT | ❌ | Upload source maps při buildu |

## Backup

- **Automatické**: Supabase provádí denní zálohy (viz Supabase Dashboard → Database → Backups)
- **Manuální**: `pg_dump` příkaz výše
- **Storage**: Supabase Storage bucket "documents" – zálohovat podle potřeby

## Support flow

1. Bugy od uživatelů: GitHub Issues nebo dedicovaný kanál
2. Kritické chyby: Sentry alerts → email/Slack
3. Eskalace: kontaktovat vývojový tým
