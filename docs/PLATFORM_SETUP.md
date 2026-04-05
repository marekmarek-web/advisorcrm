# Aidvisora – platform setup (pre-launch)

Checklist for **Supabase**, **Vercel**, and related services before production traffic.

## Supabase (recommend **Pro**)

- [ ] Upgrade project to **Pro** if you need higher connection limits, storage, and bandwidth.
- [ ] Set `DATABASE_URL` to the **connection pooler** (Supabase **Transaction** mode, port **6543**), not the direct DB port, for serverless (Vercel).
- [ ] Confirm `prepare: false` (or equivalent) in the DB client when using the pooler.
- [ ] Apply pending SQL migrations (including `fa_source_id` on `opportunities`, `fa_sync_log` table) — see `packages/db/migrations/` a `pnpm db:migrate` (`packages/db/drizzle/`).
- [ ] **Fondová knihovna + fronta požadavků:** spusť `pnpm db:migrate` (obsahuje `0020_fund_library_settings.sql`: `advisor_preferences.fund_library`, `fund_add_requests`, index, FK, normalizace stavů). Alternativa: ručně `packages/db/migrations/fund_library_settings_2026-04-06.sql` (+ volitelně `fund_library_z_status_normalize_2026-04-07.sql`). Reference: `packages/db/supabase-schema.sql`, `packages/db/migrations/README.md`.
- [ ] Review **Auth** MAU and **Storage** bucket limits for documents.

## Local development — Auth & debugging

When you run `pnpm dev` from the repo root, the web app uses `window.location.origin` for OAuth `redirectTo` (e.g. `http://localhost:3000/auth/callback?next=…`). If that URL is **not** listed under **Supabase → Authentication → URL Configuration → Redirect URLs**, Supabase typically falls back to the project **Site URL** (e.g. production), which looks like “Google login on localhost but I end up on www.aidvisora.cz”.

**Redirect URLs to add (adjust port if needed):**

- `http://localhost:3000/auth/callback`
- `http://127.0.0.1:3000/auth/callback`
- Optional: `http://localhost:3000/**` if your Supabase project allows wildcards for dev.

Google Cloud OAuth for Supabase usually keeps redirect to `https://<project-ref>.supabase.co/auth/v1/callback`; the usual fix is the **Supabase** allowlist, not a second Google client for localhost.

**Ways to work locally:**

| Goal | What to do |
|------|------------|
| Real Google OAuth on localhost | Add the redirect URLs above; keep using `pnpm dev`. |
| Real user without Google | Use email/password on `/prihlaseni` with a user in Supabase Auth and a matching `memberships` row (see `docs/COMMIT-TESTING.md`, `docs/ASSUMPTIONS.md`). |
| Fast UI / server flows without login | From repo root: `pnpm dev:demo` (`NEXT_PUBLIC_SKIP_AUTH=true`). Not the same as a real Google session; see `apps/web/src/lib/auth/demo.ts`. |

For local-only links in emails and server-generated URLs, set `NEXT_PUBLIC_APP_URL=http://localhost:3000` in `apps/web/.env.local` (do not use that in production).

**Logs:** Server Components, Route Handlers (`app/api/...`), and Server Actions log to the **terminal** where `pnpm dev` runs. Client components and browser `fetch` errors appear in **Chrome DevTools**. To debug from the terminal, add logging or move checks into a server action / API route.

## Vercel (recommend **Pro**)

- [ ] **Pro** is required for **more than 2 cron jobs** (this app defines several under `apps/web/src/app/api/cron/`).
- [ ] Long-running crons (e.g. `maxDuration` up to 300s) need a plan that allows that duration; verify in the Vercel project **Functions** settings.
- [ ] Set **`CRON_SECRET`** in production and ensure cron routes validate it.
- [ ] Set all required env vars (Supabase URL/keys, `DATABASE_URL`, Stripe, Resend, Sentry DSNs, etc.) — see `apps/web/.env.example` (copy to `apps/web/.env.local` locally).

## Security & GDPR

- [ ] **Do not** set `NEXT_PUBLIC_SKIP_AUTH=true` in production. Demo mode is disabled when `NODE_ENV === "production"` or `VERCEL_ENV === "production"`.
- [ ] Sentry: `sendDefaultPii` is off in production builds in app config; keep it that way for GDPR.
- [ ] Remove or restrict any dev-only bypass env vars (`DEV_*`) on production.

## PWA

- [ ] `public/site.webmanifest` is served at `/site.webmanifest` (linked from root layout metadata).
- [ ] Optional: add dedicated 192×192 / 512×512 app icons and update the manifest.

## Android (Capacitor) — Firebase Cloud Messaging / push

Without a real **`google-services.json`**, Firebase is not initialized on the device and **`PushNotifications.register()` can crash the app** (native `IllegalStateException: Default FirebaseApp is not initialized`). The Gradle build only applies the Google Services plugin when that file exists.

**Required once per Firebase project (manual):**

1. In [Firebase Console](https://console.firebase.google.com), open your project and add an **Android** app whose package name **must match** `applicationId` in Gradle: **`cz.aidvisora.app`** (`apps/web/android/app/build.gradle`).
2. Download **`google-services.json`** from Firebase for that Android app.
3. Copy it to **`apps/web/android/app/google-services.json`** only (not `apps/web/` root; not committed; contains API keys). A shape reference lives at `apps/web/android/app/google-services.json.example`.
4. Rebuild the Android app (`npx cap sync android` then Android Studio / Gradle).

The JS hook `usePushNotifications` wraps native bridge calls in **try/catch** so recoverable failures surface as UI error state instead of breaking the listener setup; **fatal native crashes still require a valid `google-services.json`.**

## After deploy

- [ ] Run smoke tests (login, contacts, pipeline).
- [ ] Confirm Sentry is clean (no missing-column or client bundle errors).
- [ ] Optional: load test critical API routes and monitor DB connection count.
