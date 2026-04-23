# Pre-launch verification checklist

**Verze:** 2026-04-22
**Kdo spouští:** Marek (před každým batch deployem + před go-live).
**Doba trvání:** ~90 min pro kompletní run.

Tento checklist NENÍ něco, co agent dokáže projet sám — vyžaduje přístup do
Vercel, Stripe, Sentry, Supabase a fyzická zařízení. Slouží jako kontrolní
runbook, aby se na žádný kritický krok nezapomnělo.

---

## 1. Prod DB dotazy (Supabase SQL editor)

Spustit `scripts/ops/pre-launch-verify.sql` (viz B2.19) v Supabase Dashboard.
Očekávané výsledky:

| Check | Očekávání | Poznámka |
|---|---|---|
| memberships unique per auth user | 0 | Jinak multi-membership user exploatuje získat cross-tenant přístup. |
| household duplicates | 0 | Po migraci `household-unique-contact-2026-04-22`. |
| contracts.note leak | 0 | Po B1.2 mapping `note: null` pro klientský portál. |
| PII backfill missing | 0 | Všechny `personal_id` musí mít `personal_id_ciphertext`. |
| ZDRAV segment | 0 | Po `catalog-dedup-*` a regression fixtures. |
| Ghost payment setups | 0 | `visible=false AND status=active` > 30 dní staré. |
| Stuck AI reviews | 0 | `processing > 30 min` — zachytává cron (B1.9). |
| Applied migrations | všechny | Sekce 8a–8e z verify scriptu. |

## 2. Vercel crony (Vercel Dashboard → Crons)

Potvrdit za posledních 24 h success run pro:
- `stuck-contract-reviews`
- `grace-period-check`
- `image-intake-cleanup`

Pokud poslední run FAIL nebo chybí, check Vercel Function logs → nejčastější
root cause: chybějící `CRON_SECRET`.

## 3. Vercel env variables (Production scope)

Požadovaný minimum:
- `DATABASE_URL` (BYPASSRLS role pre-B4.1 cutover)
- `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- `SUPABASE_SERVICE_ROLE_KEY`
- `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `NEXT_PUBLIC_STRIPE_PUBLISHABLE_KEY`
- `RESEND_API_KEY`
- `OPENAI_API_KEY` (+ `ANTHROPIC_API_KEY`, pokud aktivní)
- `CRON_SECRET`
- `NEXT_PUBLIC_SENTRY_DSN`, `SENTRY_AUTH_TOKEN`
- `VERCEL_EDGE_CONFIG` (kill-switches)
- **Nepovinné, ale doporučené:** `MFA_ENFORCE_ADVISORS=true` (B3.3),
  `TURNSTILE_SECRET` (B3.7).
- **Povinné před aidvisora_app cutover (B4.1 / SL-094):**
  `DATABASE_URL_SERVICE` (postgres role, BYPASSRLS) — vymáháno runtime
  guardem v `apps/web/src/lib/db/service-db.ts`, který throwne, pokud
  `DATABASE_URL` ukazuje na `aidvisora_app` roli a `DATABASE_URL_SERVICE`
  chybí. Bez této env var cron/webhook flows spadnou nebo vrátí prázdná data.

## 4. Sentry alerts (Sentry UI → Alerts)

- A1–A12 z `docs/observability/sentry-alerts.md` aktivní v `production` env.
- Test-trigger: poslat faux 500 na staging, ověřit, že A1 nealerty prod
  (environment filter).
- Mobile push subscription aktivní pro příjemce `bezpecnost@aidvisora.cz`.

## 5. Stripe

- Stripe Tax povolen pro CZ (Settings → Tax → Registrations).
- Webhook endpoint `/api/stripe/webhook` status `enabled`, secret v env
  shoduje.
- Test tenant: trigger `stripe trigger invoice.payment_failed --add
  subscription:metadata:tenantId=<tenant>` → email přišel na `notification_email`
  (fallback viz B1.10).

## 6. Resend

- DKIM, DMARC, SPF pro `aidvisora.cz` zeleně v Resend Dashboard → Domains.
- Test send: `support@aidvisora.cz` → `test@example.com` (Mail-Tester) ≥ 9/10.

## 7. Supabase PITR drill

- Viz `docs/security/pitr-restore-drill.md`. Drill proveden, signed off,
  datum nahráno do changelogu. Max. 90 dní stará.

## 8. iOS fyzické zařízení (iPhone SE + iPhone Pro Max)

- Invite link z advisor portal → otevření v Mail → klik → native sign-in.
- Login OAuth cancel mid-flow → clean state, možno pokračovat.
- Scan (dvě stránky) → upload → AI review open → dokončit apply.
- HEIC upload z camera → AI review → payment extract.
- Mobile UI shell (`mobile_ui_v1_beta=1` cookie) → safe-area OK, bez overflow.
- Dunning banner render po `stripe trigger invoice.payment_failed` (B3.11).

## 9. Android fyzické zařízení

- Invite → login → scan (simulated nebo camera) → upload.
- Push prompt se NEOBJEVÍ (Android push intentional deferred, B4.8).
- Safe-area + status bar čerstvé na Pixel / Samsung.

## 10. Maintenance mode smoke

- `vercel edge-config set MAINTENANCE_MODE true` → web vrátí 503 + HTML
  placeholder.
- `/api/healthcheck` stále 200 (kritická DB ok).
- `vercel edge-config set MAINTENANCE_MODE false` → obnova do 60 s.

## 11. Maintenance mode pro `/portal/*` nebo `/client/*`

- Ověřit, že banner v mobile shellu se renderuje i v `MobilePortalApp`
  (B3.11).

## 12. Legal copy spot-check

- `/privacy`, `/cookies`, `/dpa` obsahuje `Aidvisora` všude tam, kde to plán
  B1.6 definuje (neinflektovat na „Aidvisory").
- Pricing page zobrazuje „včetně 21 % DPH" (B1.5).
- Landing neobsahuje nezakrytý `AES-256-GCM` claim (B1.4).

## 13. Sitemap + robots

- `/sitemap.xml` neobsahuje `/rezervace` (B2.16).
- `/robots.txt` disallowne `/portal`, `/client`, `/api`.

## 14. Cookie banner + Sentry Replay

- Produkční build: Network tab neobsahuje `sentry-replay-*.js` call na
  `ingest.sentry.io` bez erroru (B2.17).
- Cookie banner zmiňuje Sentry jako essential / legitimate interest.

## 15. Release gate

- Batch 1 complete + všechny „Prod DB dotazy" ≤ očekávaná hodnota
  = **go pro live demo + beta poradce**.
- Batch 2 complete + device tests pass = **go pro první placené klienty**.
- Batch 3 complete + Sentry alerts aktivní 48 h bez triggered
  = **go pro public marketing launch**.
- Batch 4 = rolling, ne blokuje launch.

---

## Sign-off

| Datum | Batch | Sign-off (initialy) | Poznámka |
|---|---|---|---|
|  |  |  |  |
