# Aidvisora – platform setup (pre-launch)

Checklist for **Supabase**, **Vercel**, and related services before production traffic.

## Supabase (recommend **Pro**)

- [ ] Upgrade project to **Pro** if you need higher connection limits, storage, and bandwidth.
- [ ] Set `DATABASE_URL` to the **connection pooler** (Supabase **Transaction** mode, port **6543**), not the direct DB port, for serverless (Vercel).
- [ ] Confirm `prepare: false` (or equivalent) in the DB client when using the pooler.
- [ ] Apply pending SQL migrations (including `fa_source_id` on `opportunities`, `fa_sync_log` table) — see `packages/db/migrations/`.
- [ ] Review **Auth** MAU and **Storage** bucket limits for documents.

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
