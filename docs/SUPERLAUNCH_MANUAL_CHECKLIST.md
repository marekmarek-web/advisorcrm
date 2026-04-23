# Superlaunch — konsolidovaný manuální checklist

**Verze:** 2026-04-23  
**Účel:** Jediný vstupní bod pro všechny **ruční** kroky před/po superlaunchu (operátor, admin, produkt). Nezahrnuje automatizované CI úkoly — ty zůstávají v [apps/web/RELEASE_GATE.md](../apps/web/RELEASE_GATE.md) a modulových runbucích.

**Jak používat:** Zaškrtávej `- [ ]` → `- [x]`. U každé položky je **ID** (`SL-NNN`) pro dohledání v [Appendix A](#appendix-a-mapování-zdrojových-dokumentů--id-položek).

---

## Legenda priorit

| Značka | Význam |
|--------|--------|
| **P0** | Pre-launch blocker — bez splnění riskovatelný nebo neproveditelný go-live |
| **P1** | Pre-launch doporučené — ideálně před launch nebo do 24 h po |
| **P2** | Post-launch (48 h–30 d) — provoz, cutovery, rotace |
| **P3** | Long-term backlog — kvartály, v1.1+, obsah |

---

## Známé konflikty scope (sjednotit před exekucí)

1. **Universal Links / App Links:** [docs/release-v1-decisions.md](release-v1-decisions.md) říká **NE pro v1.0**; runbooky popisují plnou konfiguraci. V tomto checklistu jsou UL položky **P3** s poznámkou „pouze pokud scope překlopíte“.
2. **Android push:** v1.0 **NE** dle release-v1-decisions — FCM jen **P3 / v1.1**.
3. **`STRIPE_CHECKOUT_DISABLED`:** pokud incident-runbook slibuje env guard, musí být v kódu/env nebo odstraněn z runbooku (**P0 ověření**).

---

# FÁZE A — Pre-launch blockery (P0)

## A.1 SQL migrace a integrita dat

- [ ] **SL-001** [P0] V produkci spusť `scripts/ops/pre-launch-verify.sql`; ověř nulové hodnoty u memberships/household/PII/ZDRAV/ghost payments/stuck reviews dle tabulky očekávání. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §1
- [ ] **SL-002** [P0] Projdi chronologicky log v [docs/SQL-DOPOJENI.md](SQL-DOPOJENI.md) a aplikuj v produkci vše, co ještě neběží (RLS, billing, katalog, team, `rls-m8`–`m10` dle cutover plánu). → [docs/SQL-DOPOJENI.md](SQL-DOPOJENI.md), [docs/OPS_RUNBOOK.md](OPS_RUNBOOK.md) §1
- [ ] **SL-003** [P0] Aplikuj / ověř skripty z OPS: `pre-launch-data-integrity.sql`, `pre-launch-document-types.sql`, řetězec k `documents` / `documents_schema_sync_2026.sql` dle runbooku. → [docs/OPS_RUNBOOK.md](OPS_RUNBOOK.md) §1
- [ ] **SL-004** [P0] Pro cutover na roli `aidvisora_app`: dokonči migrace `rls-m8` / `m9` / `m10` dle cutover runbooku. → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §1.2, §4.2
- [ ] **SL-005** [P0] Po `rls-m8` proveď post-deploy verify z SQL-DOPOJENI (`SET ROLE aidvisora_app`, SECURITY DEFINER funkce). → [docs/SQL-DOPOJENI.md](SQL-DOPOJENI.md) (sekce u rls-m8)
- [ ] **SL-006** [P0] Client Portal sanity SQL: memberships >1, ghost payments, skryté AI smlouvy, contracts visible bez portal access = očekávané nuly. → [docs/CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md) §C.2

## A.2 Supabase — role, storage, zálohy

- [ ] **SL-007** [P0] Ověř / vytvoř roli `aidvisora_app`, nastav atributy, **nastav nebo rotuj heslo**, ulož mimo repozitář (např. 1Password). → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §1.1
- [ ] **SL-008** [P0] Ověř RLS na `storage.objects` a obecně Supabase hygienu (PITR/denní zálohy ON). → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §1.3
- [ ] **SL-009** [P0] Otestuj pooler s přihlášením jako `aidvisora_app` před produkčním swapem. → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §1.3

## A.3 Vercel — env, cron, Edge Config

- [ ] **SL-010** [P0] Production env minimum: `DATABASE_URL`, `NEXT_PUBLIC_SUPABASE_*`, `SUPABASE_SERVICE_ROLE_KEY`, Stripe (`SECRET`, `WEBHOOK_SECRET`, `NEXT_PUBLIC_PUBLISHABLE`), `RESEND_API_KEY`, `OPENAI_API_KEY` (+ Anthropic pokud aktivní), `CRON_SECRET`, Sentry DSN + `SENTRY_AUTH_TOKEN`, `VERCEL_EDGE_CONFIG`. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §3, [docs/OPS_RUNBOOK.md](OPS_RUNBOOK.md) §2
- [ ] **SL-011** [P0] Vygeneruj `CRON_SECRET`, nastav ve Vercelu, ověř `curl` s Bearer na cron endpointy. → [docs/OPS_RUNBOOK.md](OPS_RUNBOOK.md) (Cron jobs)
- [ ] **SL-012** [P0] Vytvoř Edge Config store `aidvisora-ops`, propoj projekt, nastav initial kill-switch položky (výchozí safe), ověř `/portal/admin/kill-switches`. → [docs/security/edge-config-kill-switches.md](security/edge-config-kill-switches.md) §Setup, [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §3
- [ ] **SL-013** [P0] Ověř poslední 24 h success u crons: `stuck-contract-reviews`, `grace-period-check`, `image-intake-cleanup`. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §2

## A.4 Stripe

- [ ] **SL-014** [P0] Zapni Stripe Tax, registruj CZ (a EU dle plánu), ověř Tax → Registrations / Monitoring. → [docs/billing/stripe-tax-cz-setup.md](billing/stripe-tax-cz-setup.md) §2, [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §5
- [ ] **SL-015** [P0] Webhook `/api/stripe/webhook` enabled; secret v env shoduje s Dashboard. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §5
- [ ] **SL-016** [P0] Customer Portal (Test + Live): funkce, branding, legal URLs, return URL; **Tax ID collector vypnut** pokud dokument vyžaduje. → [docs/billing/stripe-customer-portal-config.md](billing/stripe-customer-portal-config.md)
- [ ] **SL-017** [P0] Proveď regresní test první platby dle stripe-tax runbooku (test mode → live checklist). → [docs/billing/stripe-tax-cz-setup.md](billing/stripe-tax-cz-setup.md) §4

## A.5 DNS / e-mail (Resend + Supabase Auth mail)

- [ ] **SL-018** [P0] Resend: doména `aidvisora.cz`, DNS (SPF/DKIM/DMARC) zeleně v Dashboard. → [docs/ops/email-dns-deliverability.md](ops/email-dns-deliverability.md) §1–3, [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §6
- [ ] **SL-019** [P0] Supabase Custom SMTP na Resend; šablony e-mailů v CZ; otestuj auth e-mail. → [docs/ops/email-dns-deliverability.md](ops/email-dns-deliverability.md) §5
- [ ] **SL-020** [P0] Mail-Tester skóre ≥ 9/10 pro transakční e-mail. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §6

## A.6 Observability

- [ ] **SL-021** [P0] V Sentry UI aktivuj alerty A1–A12 pro `production` dle [docs/observability/sentry-alerts.md](observability/sentry-alerts.md). → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §4
- [ ] **SL-022** [P0] Test-trigger: faux 500 na staging; ověř filtr env (prod nešumí špatně). → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §4
- [ ] **SL-023** [P0] Mobile push notifikace pro alerty → `bezpecnost@aidvisora.cz`. → [docs/observability/sentry-alerts.md](observability/sentry-alerts.md) §3

## A.7 PITR

- [ ] **SL-024** [P0] PITR zapnuto, retention nastaveno; proveď PITR drill dle runbooku; sign-off + datum (max 90 dní staré v checklistu). → [docs/security/pitr-restore-drill.md](security/pitr-restore-drill.md), [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §7

## A.8 Supabase Auth / OAuth redirecty

- [ ] **SL-025** [P0] Redirect URLs: web (`https://www…`), native (`aidvisora://…`), staging; Site URL konzistentní. → [docs/PLATFORM_SETUP.md](PLATFORM_SETUP.md), [docs/security/native-oauth-redirect-urls.md](security/native-oauth-redirect-urls.md) §1
- [ ] **SL-026** [P0] Apple Sign-In: Services ID, Return URL = Supabase callback; shoda s [docs/runbook-apple-signin.md](runbook-apple-signin.md). → [docs/runbook-apple-signin.md](runbook-apple-signin.md) §A–B
- [ ] **SL-027** [P0] Po konfiguraci OAuth proveď curl/flow test redirectů. → [docs/security/native-oauth-redirect-urls.md](security/native-oauth-redirect-urls.md) §1

## A.9 Apple — App Store / TestFlight / SIWA / APNs

- [ ] **SL-028** [P0] Apple Developer Program, certifikáty, provisioning, Associated Domains v profilu pokud je v aktuálním scope. → [docs/runbook-signing.md](runbook-signing.md), [apps/web/ios/APP_STORE.md](../apps/web/ios/APP_STORE.md)
- [ ] **SL-029** [P0] App Store Connect: app záznam, metadata, **Privacy Nutrition Labels v souladu s realitou** (blocker). → [docs/legal/app-store-privacy-labels.md](legal/app-store-privacy-labels.md), [docs/runbook-app-store-connect.md](runbook-app-store-connect.md)
- [ ] **SL-030** [P0] Capacitor sync, verze, Archive, Validate, Upload, TestFlight processing. → [docs/runbook-release.md](runbook-release.md) §B, [docs/ios/SUBMISSION-CHECKLIST.md](ios/SUBMISSION-CHECKLIST.md)
- [ ] **SL-031** [P0] App Review: demo účty, Review Notes, credentials v 1Password. → [docs/ios/REVIEW-NOTES.md](ios/REVIEW-NOTES.md), [docs/ios/SUBMISSION-CHECKLIST.md](ios/SUBMISSION-CHECKLIST.md)
- [ ] **SL-032** [P0] Apple Sign-In kompletní (P8, Key ID, Team ID, Supabase provider). → [docs/runbook-apple-signin.md](runbook-apple-signin.md)
- [ ] **SL-033** [P0] Smoke SIWA na fyzickém iPhonu před TestFlight submit. → [docs/runbook-apple-signin.md](runbook-apple-signin.md) §C
- [ ] **SL-034** [P0] APNs P8 nahraný; env na Vercelu/push backendu (`APNS_*`). → [docs/runbook-push.md](runbook-push.md) §2, [docs/release-v1-decisions.md](release-v1-decisions.md) §1

## A.10 Google Play / Android (v1.0 scope)

- [ ] **SL-035** [P0] Play Console účet, app záznam, Data Safety, privacy URL, test credentials. → [docs/runbook-play-console.md](runbook-play-console.md), [apps/web/android/PLAY_STORE.md](../apps/web/android/PLAY_STORE.md)
- [ ] **SL-036** [P0] Upload keystore, `key.properties`, záloha mimo git, Play App Signing; po uploadu **SHA-256** do `ANDROID_SHA256_FINGERPRINTS` pokud používáte App Links v budoucnu. → [docs/runbook-signing.md](runbook-signing.md), [docs/ios/universal-links-and-app-links.md](ios/universal-links-and-app-links.md) §Android
- [ ] **SL-037** [P0] Build AAB, Internal testing, rollout dle [docs/runbook-release.md](runbook-release.md) §C.
- [ ] **SL-038** [P0] Zapiš rozhodnutí **Android day-1 vs deferred** do tabulky rozhodnutí. → [docs/launch/android-day1-vs-deferred.md](launch/android-day1-vs-deferred.md)

## A.11 Legal / DPA / terms

- [ ] **SL-039** [P0] DPA register: doplnit **Resend, Sentry (EU + DPA), OpenAI, Anthropic** před prvním placeným zákazníkem dle tabulky. → [docs/legal/dpa-register.md](legal/dpa-register.md)
- [ ] **SL-040** [P0] Terms acceptance: dokonči produktové kontexty (`register`, `staff-invite`, `client-invite`, `beta-terms`) dle integračního dokumentu. → [docs/legal/terms-acceptance-integration.md](legal/terms-acceptance-integration.md)
- [ ] **SL-041** [P0] Právní spot-check: privacy, cookies, DPA, pricing DPH, žádné neopatrné security claimy. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §12–14

## A.12 Review tenant a credentials

- [ ] **SL-042** [P0] Spusť seed `review-tenant-seed` v produkci dle [docs/launch/review-tenant-seed.md](launch/review-tenant-seed.md); před submitem přepiš hesla.
- [ ] **SL-043** [P0] Zadej credentials do ASC a Play; GPG/secure channel dle runbooku.
- [ ] **SL-044** [P0] Ověř account deletion flow v UI (Guideline). → [docs/ios/SUBMISSION-CHECKLIST.md](ios/SUBMISSION-CHECKLIST.md)

## A.13 Env guard / incident konzistence

- [ ] **SL-045** [P0] Ověř, že `STRIPE_CHECKOUT_DISABLED` (nebo ekvivalent) je implementován v kódu/env pokud na něj incident-runbook spoléhá — jinak runbook uprav. → [docs/incident-runbook.md](incident-runbook.md)

## A.14 RLS cutover předchozí příprava (bez samotného swapu)

- [ ] **SL-046** [P0] Lokálně/na stagingu: `rls-live.test.ts`, `scripts/smoke-rls-aidvisora-app.sql`, static guard dle cutover runbooku. → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §2
- [ ] **SL-047** [P0] Ulož rollback `DATABASE_URL` a postup rollback drillu (<10 min) nacvičený. → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §3–5

---

# FÁZE B — Pre-launch doporučené (P1)

## B.1 Stripe / účetnictví

- [ ] **SL-048** [P1] **Uzavři s účetní** variantu číslování faktur (A vs B) před první live platbou. → [docs/billing/cz-vat-invoice-numbering.md](billing/cz-vat-invoice-numbering.md)
- [ ] **SL-049** [P1] Stripe Customer Portal: doladit cancellation důvody, invoice history, update PM dle [docs/billing/stripe-customer-portal-config.md](billing/stripe-customer-portal-config.md).

## B.2 DNS / e-mail — pokročilé

- [ ] **SL-050** [P1] DMARC fáze (none → quarantine → reject); inbox `dmarc@`. → [docs/ops/email-dns-deliverability.md](ops/email-dns-deliverability.md)
- [ ] **SL-051** [P1] Kampaně: ověř `RESEND_*`, whitelists, provozní checklist. → [docs/EMAIL_CAMPAIGNS_STATUS.md](EMAIL_CAMPAIGNS_STATUS.md)
- [ ] **SL-052** [P1] Kill-switch / env: `EMAIL_SENDING_DISABLED` dle kampaní checklistu. → [docs/EMAIL_CAMPAIGNS_STATUS.md](EMAIL_CAMPAIGNS_STATUS.md)

## B.3 Vercel / provoz

- [ ] **SL-053** [P1] Zvaž Vercel Pro kvůli cron frekvencím dle OPS. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §2
- [ ] **SL-054** [P1] `MFA_ENFORCE_ADVISORS=true`, `TURNSTILE_SECRET`, `DATABASE_URL_SERVICE` pro crony (cutover). → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §3
- [ ] **SL-055** [P1] Maintenance mode test: Edge Config `MAINTENANCE_MODE`, `/api/healthcheck` 200. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §10
- [ ] **SL-056** [P1] `ANDROID_PACKAGE_NAME` konzistentní s Play. → [docs/PLATFORM_SETUP.md](PLATFORM_SETUP.md)
- [ ] **SL-128** [P1] Ověř, že se **nenastavuje ručně** `VERCEL_GIT_COMMIT_SHA` (nechává platforma). → [docs/OPS_RUNBOOK.md](OPS_RUNBOOK.md)
- [ ] **SL-129** [P1] Projdi outbound mail audit a uzavři mezery v konfiguraci. → [docs/ops/outbound-mail-audit.md](ops/outbound-mail-audit.md)
- [ ] **SL-130** [P1] Projdi [docs/security/rls-production-snapshot-2026-04-19.md](security/rls-production-snapshot-2026-04-19.md) a potvrď aktuálnost vůči produkci.
- [ ] **SL-131** [P1] Native release build: injektuj `google-services` přes CI secrets dle runbooku (když pipeline vyžaduje). → [docs/CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md) §D.1

## B.4 Observability — rozšíření

- [ ] **SL-057** [P1] Externí uptime monitor na `/api/health` nebo `/api/healthcheck`. → [docs/ops/uptime-monitoring.md](ops/uptime-monitoring.md), [docs/OPS_RUNBOOK.md](OPS_RUNBOOK.md)
- [ ] **SL-058** [P1] Client Portal: vlastní prahy alertů dle launch runbooku. → [docs/CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md) §C.3

## B.5 Klientský portál — QA

- [ ] **SL-059** [P1] Appendix A Client Portal (15 bodů) + Appendix B (10) + Appendix D native — projdi na zařízeních. → [docs/CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md)
- [ ] **SL-060** [P1] Smoke **1–20** P2.2/P2.3 release gate. → [docs/client-portal-p22-p23-release-gate.md](client-portal-p22-p23-release-gate.md)
- [ ] **SL-061** [P1] `clientPortalEnabled=false` rollback otestován ve stagingu. → [docs/CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md) §C.5
- [ ] **SL-062** [P1] Studené kontakty: `NEXT_PUBLIC_PORTAL_COLD_CONTACTS_ENABLED=true` na Preview/Production dle potřeby. → [docs/ui-polish-2026-04-20.md](ui-polish-2026-04-20.md)

## B.6 Pre-launch checklist — zařízení a web

- [ ] **SL-063** [P1] iOS fyzická zařízení (SE + Pro Max) — §8–9 pre-launch checklistu. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §8–9
- [ ] **SL-064** [P1] Android zařízení — totéž. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §8–9
- [ ] **SL-065** [P1] Sitemap/robots, cookie banner + Sentry replay pravidla. → [docs/audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) §13–14

## B.7 Release gate (web)

- [ ] **SL-066** [P1] Spusť `pnpm test:f9-release-gate` před web release. → [apps/web/RELEASE_GATE.md](../apps/web/RELEASE_GATE.md)

## B.8 Native scan / AI / asistent

- [ ] **SL-067** [P1] Native scan acceptance matice 1–5 na každý TF/Internal build; sign-off Eng/Product/QA. → [docs/NATIVE_SCAN_ACCEPTANCE.md](NATIVE_SCAN_ACCEPTANCE.md)
- [ ] **SL-068** [P1] AI drawer smoke desktop (17 kroků) + iPhone (12 kroků); vyplň sekce I–VIII. → [docs/ai-drawer-smoke-2026-04-22.md](ai-drawer-smoke-2026-04-22.md)
- [ ] **SL-069** [P1] F2 wave B: uvedené `pnpm` testy + publish flow po větších změnách. → [docs/release-checklist-f2-wave-b.md](release-checklist-f2-wave-b.md)
- [ ] **SL-070** [P1] AI Review page-image fallback: staging env `AI_REVIEW_PAGE_IMAGE_FALLBACK`, smoke, pak prod. → [docs/AI_REVIEW_PAGE_IMAGE_FALLBACK.md](AI_REVIEW_PAGE_IMAGE_FALLBACK.md)
- [ ] **SL-071** [P1] Prompt rollout: OpenAI Prompt Builder → `pmpt_*` do Vercel env, redeploy, smoke tabulka D. → [docs/ai-review-prompt-rollout.md](ai-review-prompt-rollout.md)
- [ ] **SL-072** [P1] Image intake: postupné env rollout (`IMAGE_INTAKE_*`, canary), health cron, incident vypnutí. → [docs/image-intake-release.md](image-intake-release.md)

## B.9 Perf landing

- [ ] **SL-073** [P1] Po deployi: `pnpm --filter web analyze`, Lighthouse, volitelně WebPageTest; 48 h Speed Insights. → [docs/PERF_LANDING_2026-04.md](PERF_LANDING_2026-04.md)
- [ ] **SL-074** [P1] Landing smoke checklist (hero, CTA, cookie, FAQ, JSON-LD, portal regrese). → [docs/PERF_LANDING_2026-04.md](PERF_LANDING_2026-04.md)

## B.10 Pricing / billing UI

- [ ] **SL-075** [P1] Pricing regression checklist (tarify, metadata, capability matrix). → [docs/pricing-regression-checklist.md](pricing-regression-checklist.md)
- [ ] **SL-076** [P1] Synchronizuj částky UI ↔ Stripe Price IDs dle roadmapy. → [docs/pricing-packaging-roadmap.md](pricing-packaging-roadmap.md)

## B.11 Katalog / instituce / fund library

- [ ] **SL-077** [P1] Před migrací katalogu: `COUNT ZDRAV = 0`. → [docs/catalog-audit-2026-04-21.md](catalog-audit-2026-04-21.md)
- [ ] **SL-078** [P1] Spusť `catalog-fill-tbd-products-2026-04-22.sql` + `pnpm run db:seed-catalog`. → [docs/catalog-product-fills-2026-04-22.md](catalog-product-fills-2026-04-22.md)
- [ ] **SL-079** [P1] Institucionální účty: migrace + manuální ověření poradci (Direct FALLBACK, symboly, NN product code). → [docs/institution-payment-accounts-audit-2026-04-22.md](institution-payment-accounts-audit-2026-04-22.md)
- [ ] **SL-080** [P1] Fund library: migrace `0020_fund_library_settings`, `pnpm db:migrate` nebo SQL; **7-bod post-deploy smoke**. → [docs/fund-library-deploy.md](fund-library-deploy.md)
- [ ] **SL-081** [P1] Fund library manuální QA checklist. → [docs/fund-library-manual-qa.md](fund-library-manual-qa.md)

## B.12 Team overview

- [ ] **SL-082** [P1] Release checklist Team Overview (role, KPI, responsive, testy dle dokumentu). → [docs/team-overview-release-checklist.md](team-overview-release-checklist.md)
- [ ] **SL-083** [P1] Manager: doplnit `parent_id` reportingové vazby v Nastavení → Tým. → [docs/team-overview-masterplan.md](team-overview-masterplan.md)
- [ ] **SL-084** [P1] Demo script 6 kroků pro live demo. → [docs/team-overview-release-checklist.md](team-overview-release-checklist.md)

## B.13 Security / compliance čtení

- [ ] **SL-085** [P1] Projdi upload safety, reauth guard, audit log coverage, PII encryption, RLS matrix — ověř že provoz odpovídá. → [docs/security/upload-safety-policy.md](security/upload-safety-policy.md), [docs/security/reauth-guard.md](security/reauth-guard.md), [docs/security/audit-log-coverage.md](security/audit-log-coverage.md), [docs/security/pii-encryption.md](security/pii-encryption.md), [docs/security/rls-policy-matrix.md](security/rls-policy-matrix.md)

## B.14 Lidská rozhodnutí D2–D5

- [ ] **SL-086** [P1] **D2:** PII backfill script v maintenance okně + sign-off po SQL verify. → [docs/audit/human-decisions-required-2026-04-22.md](audit/human-decisions-required-2026-04-22.md) §D2
- [ ] **SL-087** [P1] **D3:** Rozhodnutí ceny net vs gross + úprava pricing. → [docs/audit/human-decisions-required-2026-04-22.md](audit/human-decisions-required-2026-04-22.md) §D3
- [ ] **SL-088** [P1] **D4:** Re-roll review hesel po demích + checklist. → [docs/audit/human-decisions-required-2026-04-22.md](audit/human-decisions-required-2026-04-22.md) §D4
- [ ] **SL-089** [P1] **D5:** Dokumentace v release-v1-decisions + issue. → [docs/audit/human-decisions-required-2026-04-22.md](audit/human-decisions-required-2026-04-22.md) §D5

## B.15 Komunikace / partneři

- [ ] **SL-090** [P1] PB invite distribuce odkazu partnerům. → [docs/billing/pb-invite-flow.md](billing/pb-invite-flow.md)
- [ ] **SL-091** [P1] AI review fix plan: code review + staging replay před širším rolloutem. → [docs/audit/ai-review-fix-plan-2026-04-21.md](audit/ai-review-fix-plan-2026-04-21.md) §8–9

---

# FÁZE C — Launch day (cutover a komunikace)

## C.1 Komunikace a baseline

- [ ] **SL-092** [P2] Ohlas maintenance (status/banner); Sentry baseline před cutoverem. → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §4.1
- [ ] **SL-093** [P2] Slack `#client-portal-launch`, on-call kontakt, git revert hash v kanálu. → [docs/CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md) §C.5–C.6

## C.2 DB URL swap (pokud je v plánu v launch okně)

- [ ] **SL-094** [P2] Nastav `DATABASE_URL` + `DATABASE_URL_SERVICE`, redeploy, manuální smoke (login, CRM, portál, cron). → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §3–4
- [ ] **SL-095** [P2] 14-denní staging burn-in (sjednoceno s B4.1) + prod soft-watch 24 h dle runbooku. → [docs/audit/aidvisora-app-cutover-runbook.md §3](audit/aidvisora-app-cutover-runbook.md)
- [ ] **SL-096** [P2] Po stabilizaci: rotace hesla `postgres`, update `DATABASE_URL_SERVICE`; uklidit `DATABASE_URL_ROLLBACK`. → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §4.7
- [ ] **SL-097** [P2] Audit log tick + Vercel cron logy po cutoveru. → [docs/audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) §4.5

## C.3 App Store — po schválení

- [ ] **SL-098** [P2] Manual release v naplánovaný slot. → [docs/ios/SUBMISSION-CHECKLIST.md](ios/SUBMISSION-CHECKLIST.md) §Post-submit

## C.4 Post-launch okamžitý monitoring

- [ ] **SL-099** [P2] 48 h monitoring: Sentry, support, konverze. → [docs/CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md) Post-launch

---

# FÁZE D — Post-launch (48 h – 30 d)

## D.1 Review credentials rotace

- [ ] **SL-100** [P2] Po review cyklu: reset tenantu, `rotate-review-credentials`, update ASC/Play. → [docs/launch/review-tenant-seed.md](launch/review-tenant-seed.md) §Post-review

## D.2 Incident response (běžná příprava)

- [ ] **SL-101** [P2] Založ šablonu incident ticketu (čas UTC, severity, hypotéza). → [docs/incident-runbook.md](incident-runbook.md)
- [ ] **SL-102** [P2] Doplň on-call tabulku a externí statuspage odkaz. → [docs/incident-runbook.md](incident-runbook.md)
- [ ] **SL-103** [P2] P0/P1 triage do 15 min; kontainment páky (Vercel promote, env flag, firewall). → [docs/incident-runbook.md](incident-runbook.md)
- [ ] **SL-104** [P2] PITR obnova: nová instance → ověř data → přepni `DATABASE_URL` → redeploy → komunikuj data loss window. → [docs/incident-runbook.md](incident-runbook.md)
- [ ] **SL-105** [P2] Reverse migrace: `rollback-*.sql` v SQL editoru + sladit kód. → [docs/incident-runbook.md](incident-runbook.md)
- [ ] **SL-106** [P2] Post-mortem do 5 dnů u P0/P1 → `docs/post-mortems/YYYY-MM-DD-<slug>.md`. → [docs/incident-runbook.md](incident-runbook.md)

## D.3 Breach (při incidentu)

- [ ] **SL-107** [P2] t0 zapsat (72 h ÚOOÚ); kontainment do 30 min. → [docs/breach-playbook.md](breach-playbook.md)
- [ ] **SL-108** [P2] Forenzní exporty před mazáním (Auth log, Sentry, Stripe, audit CSV). → [docs/breach-playbook.md](breach-playbook.md)
- [ ] **SL-109** [P2] Notifikace workspace adminů (čl. 28), ÚOOÚ formulář (čl. 33), subjekty při vysokém riziku (čl. 34). → [docs/breach-playbook.md](breach-playbook.md)
- [ ] **SL-110** [P2] Rotace tajemství dle tabulky + zápis kdo/kdy. → [docs/breach-playbook.md](breach-playbook.md)
- [ ] **SL-111** [P2] `docs/breach-log/YYYY-MM-DD-<slug>.md` evidence. → [docs/breach-playbook.md](breach-playbook.md)

## D.4 Post-launch roadmap Batch 4

- [ ] **SL-112** [P2] **B4.1:** Po triggerech maintenance window, 14 dní staging burn-in, pak prod swap `DATABASE_URL` na `aidvisora_app`; samostatně `DATABASE_URL_SERVICE` BYPASSRLS pro crony. → [docs/audit/post-launch-roadmap-2026-04-22.md](audit/post-launch-roadmap-2026-04-22.md)
- [ ] **SL-113** [P2] **B4.6:** Kill-switch rozšíření — ověř admin UI. → [docs/audit/post-launch-roadmap-2026-04-22.md](audit/post-launch-roadmap-2026-04-22.md)
- [ ] **SL-114** [P2] **B4.10:** Po implementaci hard dunning ověř 402 gate. → [docs/audit/post-launch-roadmap-2026-04-22.md](audit/post-launch-roadmap-2026-04-22.md)
- [ ] **SL-115** [P2] A7 dunning batch/SQL mimo Sentry dle observability runbooku (až dostupné). → [docs/observability/sentry-alerts.md](observability/sentry-alerts.md)

## D.5 Asistent / DB

- [ ] **SL-116** [P2] Ověř migraci `execution_actions` na prostředích s asistentem (bez tabulky degradovaný režim). → [docs/release-checklist-f2-wave-b.md](release-checklist-f2-wave-b.md)

---

# FÁZE E — Long-term backlog (P3)

## E.1 Universal Links / App Links (deferred v1.0)

- [ ] **SL-117** [P3] Pokud scope překlopíte z [docs/release-v1-decisions.md](release-v1-decisions.md): `APPLE_TEAM_ID`, AASA na webu, Associated Domains v Xcode, validátor, test na zařízení. → [docs/ios/UNIVERSAL-LINKS.md](ios/UNIVERSAL-LINKS.md), [docs/ios/universal-links-and-app-links.md](ios/universal-links-and-app-links.md)

## E.2 Android FCM / Native Sentry (v1.1+)

- [ ] **SL-118** [P3] Firebase Android app, `google-services.json` mimo git, FCM env, znovu povolit push hook. → [docs/release-v1-decisions.md](release-v1-decisions.md) §1, [docs/PLATFORM_SETUP.md](PLATFORM_SETUP.md) §Android, [docs/runbook-push.md](runbook-push.md) §Android
- [ ] **SL-119** [P3] Native Sentry Capacitor, FCM escrow v 1Password dle post-launch roadmapy. → [docs/audit/post-launch-roadmap-2026-04-22.md](audit/post-launch-roadmap-2026-04-22.md) B4.7–B4.9

## E.3 Data / architektura

- [ ] **SL-120** [P3] **B4.2:** Po 30 dnech bez plaintext read — koordinovat DROP sloupce s DBA. → [docs/audit/post-launch-roadmap-2026-04-22.md](audit/post-launch-roadmap-2026-04-22.md)

## E.4 Obsah / kvalita

- [ ] **SL-121** [P3] Website positioning backlog (screenshoty, case studies, důkazní vrstva). → [docs/website-positioning-backlog.md](website-positioning-backlog.md)
- [ ] **SL-122** [P3] Perf: komprese favicon, assety dle PERF dokumentu. → [docs/PERF_LANDING_2026-04.md](PERF_LANDING_2026-04.md)
- [ ] **SL-123** [P3] Golden AI review korpus mimo git — koordinace fixtures. → [docs/ai-review-phase1-release-gate.md](ai-review-phase1-release-gate.md)
- [ ] **SL-124** [P3] Lint debt: `pnpm --filter web lint:report`, postupné snižování. → [docs/lint-debt.md](lint-debt.md)

## E.5 Periodické revize

- [ ] **SL-125** [P3] Incident runbook: min. 2× ročně (duben, říjen) + po P0 + po změně partnera. → [docs/incident-runbook.md](incident-runbook.md)
- [ ] **SL-126** [P3] Breach playbook: ročně (duben) + po breach + po změně GDPR. → [docs/breach-playbook.md](breach-playbook.md)
- [ ] **SL-127** [P3] Sentry alerty Q review. → [docs/observability/sentry-alerts.md](observability/sentry-alerts.md)

---

## Appendix A — Mapování zdrojových dokumentů → ID položek

| Zdrojový dokument | Položky (SL-ID) |
|-------------------|-----------------|
| [audit/pre-launch-verify-checklist-2026-04-22.md](audit/pre-launch-verify-checklist-2026-04-22.md) | SL-001, SL-010, SL-013, SL-020–SL-023, SL-053–SL-055, SL-063–SL-065 |
| [audit/human-decisions-required-2026-04-22.md](audit/human-decisions-required-2026-04-22.md) | SL-086–SL-089 |
| [audit/aidvisora-app-cutover-runbook.md](audit/aidvisora-app-cutover-runbook.md) | SL-004, SL-007–SL-009, SL-046–SL-047, SL-092, SL-094–SL-097 |
| [audit/ai-review-fix-plan-2026-04-21.md](audit/ai-review-fix-plan-2026-04-21.md) | SL-091 |
| [audit/post-launch-roadmap-2026-04-22.md](audit/post-launch-roadmap-2026-04-22.md) | SL-112–SL-114, SL-119–SL-120 |
| [CLIENT_PORTAL_LAUNCH_RUNBOOK.md](CLIENT_PORTAL_LAUNCH_RUNBOOK.md) | SL-006, SL-058–SL-061, SL-093, SL-099, SL-131 |
| [OPS_RUNBOOK.md](OPS_RUNBOOK.md) | SL-002–SL-003, SL-010–SL-011, SL-057, SL-128 |
| [ops/outbound-mail-audit.md](ops/outbound-mail-audit.md) | SL-129 |
| [security/rls-production-snapshot-2026-04-19.md](security/rls-production-snapshot-2026-04-19.md) | SL-130 |
| [SQL-DOPOJENI.md](SQL-DOPOJENI.md) | SL-002, SL-005 |
| [apps/web/RELEASE_GATE.md](../apps/web/RELEASE_GATE.md) | SL-066 |
| [launch/review-tenant-seed.md](launch/review-tenant-seed.md) | SL-042–SL-043, SL-100 |
| [launch/android-day1-vs-deferred.md](launch/android-day1-vs-deferred.md) | SL-038 |
| [ios/SUBMISSION-CHECKLIST.md](ios/SUBMISSION-CHECKLIST.md) | SL-030–SL-031, SL-044, SL-098 |
| [ios/REVIEW-NOTES.md](ios/REVIEW-NOTES.md) | SL-031 |
| [ios/UNIVERSAL-LINKS.md](ios/UNIVERSAL-LINKS.md) | SL-117 |
| [ios/universal-links-and-app-links.md](ios/universal-links-and-app-links.md) | SL-036, SL-117 |
| [runbook-app-store-connect.md](runbook-app-store-connect.md) | SL-029 |
| [runbook-apple-signin.md](runbook-apple-signin.md) | SL-026, SL-032–SL-033 |
| [runbook-play-console.md](runbook-play-console.md) | SL-035, SL-037 |
| [runbook-push.md](runbook-push.md) | SL-034, SL-118 |
| [runbook-release.md](runbook-release.md) | SL-030, SL-037 |
| [runbook-signing.md](runbook-signing.md) | SL-028, SL-036 |
| [security/edge-config-kill-switches.md](security/edge-config-kill-switches.md) | SL-012 |
| [security/native-oauth-redirect-urls.md](security/native-oauth-redirect-urls.md) | SL-025, SL-027 |
| [security/pitr-restore-drill.md](security/pitr-restore-drill.md) | SL-024 |
| [security/upload-safety-policy.md](security/upload-safety-policy.md) | SL-085 |
| [security/reauth-guard.md](security/reauth-guard.md) | SL-085 |
| [security/audit-log-coverage.md](security/audit-log-coverage.md) | SL-085 |
| [security/pii-encryption.md](security/pii-encryption.md) | SL-085 |
| [security/rls-policy-matrix.md](security/rls-policy-matrix.md) | SL-085 |
| [billing/stripe-tax-cz-setup.md](billing/stripe-tax-cz-setup.md) | SL-014, SL-017 |
| [billing/stripe-customer-portal-config.md](billing/stripe-customer-portal-config.md) | SL-016, SL-049 |
| [billing/cz-vat-invoice-numbering.md](billing/cz-vat-invoice-numbering.md) | SL-048 |
| [billing/pb-invite-flow.md](billing/pb-invite-flow.md) | SL-090 |
| [legal/dpa-register.md](legal/dpa-register.md) | SL-039 |
| [legal/terms-acceptance-integration.md](legal/terms-acceptance-integration.md) | SL-040 |
| [legal/app-store-privacy-labels.md](legal/app-store-privacy-labels.md) | SL-029 |
| [ops/email-dns-deliverability.md](ops/email-dns-deliverability.md) | SL-018, SL-050 |
| [ops/uptime-monitoring.md](ops/uptime-monitoring.md) | SL-057 |
| [observability/sentry-alerts.md](observability/sentry-alerts.md) | SL-021–SL-023, SL-115, SL-127 |
| [EMAIL_CAMPAIGNS_STATUS.md](EMAIL_CAMPAIGNS_STATUS.md) | SL-051–SL-052 |
| [apps/web/android/PLAY_STORE.md](../apps/web/android/PLAY_STORE.md) | SL-035 |
| [apps/web/ios/APP_STORE.md](../apps/web/ios/APP_STORE.md) | SL-028 |
| [PLATFORM_SETUP.md](PLATFORM_SETUP.md) | SL-025, SL-056, SL-118 |
| [release-v1-decisions.md](release-v1-decisions.md) | SL-034, SL-117–SL-118 |
| [incident-runbook.md](incident-runbook.md) | SL-045, SL-101–SL-106, SL-125 |
| [breach-playbook.md](breach-playbook.md) | SL-107–SL-111, SL-126 |
| [PERF_LANDING_2026-04.md](PERF_LANDING_2026-04.md) | SL-073–SL-074, SL-122 |
| [ui-polish-2026-04-20.md](ui-polish-2026-04-20.md) | SL-062 |
| [ai-drawer-smoke-2026-04-22.md](ai-drawer-smoke-2026-04-22.md) | SL-068 |
| [pricing-regression-checklist.md](pricing-regression-checklist.md) | SL-075 |
| [pricing-packaging-roadmap.md](pricing-packaging-roadmap.md) | SL-076 |
| [catalog-product-fills-2026-04-22.md](catalog-product-fills-2026-04-22.md) | SL-078 |
| [catalog-audit-2026-04-21.md](catalog-audit-2026-04-21.md) | SL-077 |
| [institution-payment-accounts-audit-2026-04-22.md](institution-payment-accounts-audit-2026-04-22.md) | SL-079 |
| [team-overview-release-checklist.md](team-overview-release-checklist.md) | SL-082, SL-084 |
| [team-overview-masterplan.md](team-overview-masterplan.md) | SL-083 |
| [client-portal-p22-p23-release-gate.md](client-portal-p22-p23-release-gate.md) | SL-060 |
| [release-checklist-f2-wave-b.md](release-checklist-f2-wave-b.md) | SL-069, SL-116 |
| [NATIVE_SCAN_ACCEPTANCE.md](NATIVE_SCAN_ACCEPTANCE.md) | SL-067 |
| [AI_REVIEW_PAGE_IMAGE_FALLBACK.md](AI_REVIEW_PAGE_IMAGE_FALLBACK.md) | SL-070 |
| [ai-review-prompt-rollout.md](ai-review-prompt-rollout.md) | SL-071 |
| [ai-review-phase1-release-gate.md](ai-review-phase1-release-gate.md) | SL-123 |
| [fund-library-deploy.md](fund-library-deploy.md) | SL-080 |
| [fund-library-manual-qa.md](fund-library-manual-qa.md) | SL-081 |
| [image-intake-release.md](image-intake-release.md) | SL-072 |
| [lint-debt.md](lint-debt.md) | SL-124 |
| [website-positioning-backlog.md](website-positioning-backlog.md) | SL-121 |

---

*Konec dokumentu. Pro SQL detaily vždy použij primární zdroj [SQL-DOPOJENI.md](SQL-DOPOJENI.md) a [OPS_RUNBOOK.md](OPS_RUNBOOK.md).*
