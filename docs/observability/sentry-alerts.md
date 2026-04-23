# Sentry alerts — konfigurace pro produkci

**Verze:** v1 · platnost od 2026-04-20 · maintainer: Marek  
**Interní dokument** — konfigurace Sentry alert rules a jejich vazba na [`incident-runbook.md`](../incident-runbook.md).

---

## 1. Zásady

- **Každý alert musí mít:** severity (P0–P3), příjemce, link na runbook sekci, threshold jasně zdůvodněný, escalation path.
- **Nikdy nevolat P0** pro regresi, kterou neumí on-call řešit do 30 min. Pokud ano → doplň do sekce 5.2 runbooku nový postup, nebo sniž severity.
- **Alert fatigue je reálné riziko** při single-person on-call. Raději 5 spolehlivých alertů než 25 hlučných.
- **Přeje se false-negative nad false-positive** pro věci, co lze zaznamenat i reaktivně (kosmetické bugy).
- **Přeje se false-positive nad false-negative** pro security / dataloss / billing.

## 2. Projektová konfigurace v Sentry

Projekt: `aidvisora-web` (Next.js runtime + server).

**Environments:** `production`, `preview`. **Alerty níže jsou nastavené jen na `production`** (preview nechceme budit on-call — vidíme je v dashboardu a řešíme v práci).

**Integrace e-mailem:**
- primární příjemce: `bezpecnost@aidvisora.cz`
- sekundární (CC): `support@aidvisora.cz` pro P2/P3 (vizibilita pro budoucí tým)

**Slack / Discord** — _zatím neaktivní_; připraveno pro rozšíření týmu. Do té doby stačí e-mail + Sentry mobile app push.

## 3. Alerty — definice

Následující alerty musí být v Sentry založeny (ručně přes UI — Sentry nemá deklarativní config file pro alerty v zdarma tieru).

### A1 · 5xx spike (P0)

| Pole | Hodnota |
|---|---|
| Název | `A1 · 5xx spike — production` |
| Filtr | `event.type:error level:fatal environment:production` |
| Condition | `count() > 20` za 5 min (okno) |
| Action | E-mail `bezpecnost@aidvisora.cz` + Sentry mobile push |
| Runbook | [`incident-runbook.md §4.3 Contain`](../incident-runbook.md#43-contain-c--nejdůležitější-fáze) |
| Severity | **P0** |

Zdůvodnění: normální provoz produkuje <5 errors/5min v beta fázi. 20+ během 5 min = regrese.

### A2 · Stripe webhook failure rate (P0)

| Pole | Hodnota |
|---|---|
| Název | `A2 · Stripe webhook handler failing` |
| Filtr | `message:"[stripe webhook]" OR transaction:"/api/stripe/webhook" level:error` |
| Condition | `count() > 3` za 10 min |
| Action | E-mail + push |
| Runbook | [`incident-runbook.md §5.3 Stripe`](../incident-runbook.md#53-stripe-billing) |
| Severity | **P0** |

Zdůvodnění: webhook failure → Stripe retryuje 3 dny, ale během toho se subscription stav rozjíždí s realitou. Musím reagovat rychle, jinak deaktivace workspaců pobude nepřítomná.

### A3 · Auth failure burst (P1)

| Pole | Hodnota |
|---|---|
| Název | `A3 · Auth failure burst` |
| Filtr | `message:"auth" (level:error OR tag:auth_failure) environment:production` |
| Condition | `unique(user.id) > 10` současně selhává za 15 min |
| Action | E-mail |
| Runbook | Vyhodnotit jako **credential stuffing podezření**. Akce: 1) zkontrolovat Supabase auth log; 2) pokud systematický, zapnout rate-limit / captcha (TBD v kódu); 3) pokud dotčeny konkrétní účty → `breach-playbook.md` decision tree. |
| Severity | **P1** |

Zdůvodnění: 10+ různých uživatelů nemůže přihlásit v 15min okně = buď outage u Supabase Auth (checknu status) nebo útok.

### A4 · LLM cost anomaly (P1)

| Pole | Hodnota |
|---|---|
| Název | `A4 · LLM cost spike` |
| Filtr | Custom metric `llm.cost_usd` (přes Sentry metrics SDK — TBD integrace) |
| Condition | Hourly spend > 3× 7denní průměr **AND** absolutně > 20 USD/h |
| Action | E-mail |
| Runbook | 1) Supabase query na `ai_generations` za poslední hodinu, top 10 uživatelů podle tokens. 2) Pokud jeden uživatel = pravděpodobně runaway loop → dočasně vypnout AI features pro toho workspace (TBD feature flag). 3) Pokud všichni → kontrola providers outage / špatný prompt template. |
| Severity | **P1** (billing risk, ne immediate outage) |

Zdůvodnění: jedna regrese v AI kódu může za hodinu sežrat měsíční rozpočet. Catch-all safety net nad existujícími per-workspace budgets.

### A5 · Database connection saturation (P1)

| Pole | Hodnota |
|---|---|
| Název | `A5 · DB connection pool saturation` |
| Filtr | `message:"remaining connection slots" OR message:"pool exhausted" environment:production` |
| Condition | `count() > 5` za 5 min |
| Action | E-mail |
| Runbook | 1) Supabase dashboard → Database → Reports → Connections. 2) Pokud saturace = kill long-running queries (pg_stat_activity). 3) Pokud trvale → zvýšit poolsize nebo přepnout na transaction mode v pgbouncer config. |
| Severity | **P1** |

### A6 · Webhook replay skew (P2)

| Pole | Hodnota |
|---|---|
| Název | `A6 · Stripe webhook out-of-order` |
| Filtr | `message:"resolveTenantIdForSubscription returned null"` (TBD instrumented logging) |
| Condition | `count() > 10` za den |
| Action | E-mail (pracovní doba) |
| Runbook | Analyzovat — obvykle race mezi `checkout.completed` a `subscription.updated`. Akce reaktivní, ne on-call. |
| Severity | **P2** |

### A8 · Client portal payments load failure (P1)

| Pole | Hodnota |
|---|---|
| Název | `A8 · client_portal.payments_load_fail` |
| Filtr | `message:"client_portal.payments_load_fail" environment:production` |
| Condition | `count() > 5` za 15 min |
| Action | E-mail `bezpecnost@aidvisora.cz` |
| Runbook | 1) DB check na `client_payment_setups` (existuje-li `visible_to_client=true`?). 2) Supabase pool stav. 3) Pokud trvalé → fallback UI na klientském portále (feature flag). |
| Severity | **P1** |

Zdůvodnění (B3.13): payments list je nejčastější route, kterou klient otevře po přihlášení. Pokud ji systematicky neumíme dotáhnout, ztrácíme důvěru okamžitě.

### A9 · Client portal profile render failure (P2)

| Pole | Hodnota |
|---|---|
| Název | `A9 · client_portal.profile_render_fail` |
| Filtr | `message:"client_portal.profile_render_fail" environment:production` |
| Condition | `count() > 5` za 30 min |
| Action | E-mail |
| Runbook | Profile page padá obvykle na chybějících `contactForClientPortal` prop. Ověř šablonu a feature flag `client_portal_profile_v2`. |
| Severity | **P2** |

### A10 · Assistant ledger degraded (P1)

| Pole | Hodnota |
|---|---|
| Název | `A10 · assistant.ledger_degraded` |
| Filtr | `message:"assistant.ledger_degraded" environment:production` |
| Condition | `count() > 3` za 10 min |
| Action | E-mail |
| Runbook | 1) Přečíst poslední commit v `apps/web/src/lib/ai/assistant-ledger-*`. 2) Zkontrolovat Redis latency (degraded ledger = in-memory fallback, cross-instance session loss). |
| Severity | **P1** |

### A11 · Contract review apply failed (P1)

| Pole | Hodnota |
|---|---|
| Název | `A11 · contract_review.apply_failed` |
| Filtr | `message:"contract_review.apply_failed" environment:production` |
| Condition | `count() > 5` za 30 min |
| Action | E-mail |
| Runbook | 1) `SELECT id, tenant_id, processing_status FROM contract_upload_reviews WHERE processing_status = 'failed' AND updated_at > now() - interval '1 hour'`. 2) Pokud 1 tenant → escalace support. 3) Pokud všichni → regrese `apply-contract-review.ts`, rollback. |
| Severity | **P1** |

### A12 · Prompt injection detected burst (P2)

| Pole | Hodnota |
|---|---|
| Název | `A12 · assistant.prompt_injection_detected` |
| Filtr | `message:"assistant.prompt_injection_detected" environment:production` |
| Condition | `count() > 20` za 1 h |
| Action | E-mail |
| Runbook | 20+ hits/h = buď targeted probe, nebo copy-paste jailbreak viral. 1) Grep `ai_generations` za posledních 60 min + tenant IDs. 2) Pokud 1 tenant → zablokovat dočasně; 3) pokud rozptylený → noise pattern v detektoru, tune heuristics. |
| Severity | **P2** |

### A13 · DB role cutover guard — `db_error_kind` spike (P0)

| Pole | Hodnota |
|---|---|
| Název | `A13 · db_error_kind spike — aidvisora_app runtime` |
| Filtr | `tags[db_error_kind]:[rls_deny,missing_guc,permission_denied] environment:production` |
| Condition | `count() > 0` za 5 min (tj. **jakýkoli** výskyt okamžitě) |
| Action | E-mail `bezpecnost@aidvisora.cz` + Sentry mobile push |
| Runbook | [`docs/audit/aidvisora-app-cutover-runbook.md §5 Rollback`](../audit/aidvisora-app-cutover-runbook.md#5-rollback-v-kterékoliv-fázi) — swap `DATABASE_URL` ↔ `DATABASE_URL_ROLLBACK`, redeploy. |
| Severity | **P0** |

Zdůvodnění: wrapper `withTenantContext` / `withUserContext` / `withServiceTenantContext` tagují Postgres chyby přes `db_error_kind` (viz `apps/web/src/lib/db/with-tenant-context.ts`). Po cutoveru runtime role na `aidvisora_app` (NOBYPASSRLS + FORCE RLS) je **jakýkoli** výskyt `rls_deny` / `missing_guc` / `permission_denied` = chybějící policy / GRANT / GUC a okamžitý trigger pro rollback podle runbook §5.

**Pre-cutover stav:** runtime role = `postgres` BYPASSRLS; kind tagy se v praxi nevyskytují (alert je de facto tichý). Staging burn-in (14 dní dle roadmap B4.1) slouží k ověření, že alert zůstává na 0 pod aidvisora_app rolí.

**Dodatečné facets pro triage:** `db_wrapper` (`withTenantContext` | `withUserContext` | `withServiceTenantContext`), `tenant_id`, `user_id`.

### A7 · Dunning grace period started (P2)

| Pole | Hodnota |
|---|---|
| Název | `A7 · Dunning grace period started` |
| Trigger | SQL / scheduled job (Supabase Scheduled Function), **ne Sentry alert** |
| Frekvence | denní batch 09:00 CET |
| Akce | E-mail `support@aidvisora.cz` se seznamem workspaců, kde `subscriptions.grace_period_ends_at` prošel za posledních 24h |
| Runbook | 1) Ověř že dunning komunikace se stala (Stripe posílá automaticky). 2) Customer success — osobní dotaz přes e-mail. 3) Pokud expiruje do 48h → rozhodnout o restricted mode (TBD kód). |
| Severity | **P2** |

_Poznámka: A7 není Sentry alert — je to scheduled SQL dotaz. Kód dotazu v `docs/observability/dunning-report.sql` (TBD po spuštění)._ 

## 4. Co vědomě NEalertujeme

| Scénář | Proč ne |
|---|---|
| Individuální 500 error | noise; Sentry issue sám o sobě stačí |
| Slow page (< 3 s) | nedostatek kapacity na on-call odpovídání |
| Missing translations / i18n | P3 v workflow, ne alert |
| Sentry quota warning | operativní, dostačuje e-mail od Sentry samotného |
| Vercel build failure na preview | PR-level feedback, ne on-call |

## 5. Runbook mapping

Každý alert výše **musí** mít v `incident-runbook.md` dohledatelný postup. Pokud ho nenajdeš, doplň — nesmí existovat alert bez dokumentované reakce.

| Alert | Runbook sekce |
|---|---|
| A1 5xx spike | §4.3 Contain + §5.1 Vercel rollback |
| A2 webhook failing | §5.3 Stripe |
| A3 auth burst | breach-playbook.md §3 Decision tree (pokud potvrzená exploitace) |
| A4 LLM cost | §4.3 Contain (feature flag off) |
| A5 DB saturation | §5.2 Supabase |
| A6 webhook skew | retrospective only |
| A7 dunning | Customer success handoff |
| A8 client portal payments | Client portal runbook A§3 payments |
| A9 client portal profile | Client portal runbook A§11 profile |
| A10 assistant ledger | `docs/assistant-multimodal-crm-live-readiness.md` §ledger |
| A11 contract review apply | AI review fix plan §apply-failed fallback |
| A12 prompt injection | security-audit log review + tune heuristics |
| A13 db_error_kind spike | [`docs/audit/aidvisora-app-cutover-runbook.md §5 Rollback`](../audit/aidvisora-app-cutover-runbook.md) |

## 6. Review

- Po každém P0 incidentu → zkontrolovat, jestli stávající alerty incident detekovaly včas. Pokud ne → přidat / upravit.
- **Čtvrtletně** → review seznam alertů, zrušit ty, co za kvartál nestřelily ani jednou relevantně (noise elimination).
- Po migraci infrastrukturního partnera → kompletní revize (filtry jsou často vázané na strukturu log messages).

## 7. Historie změn

| Datum | Změna | Autor |
|---|---|---|
| 2026-04-20 | Initial v1 — definováno 7 alertů, mapping na runbook. | Marek |
| 2026-04-22 | B3.13 — přidáno A8–A12 (client portal payments/profile, assistant ledger, contract review apply, prompt injection burst). | Marek |
| 2026-04-23 | B4.1 prep — přidáno A13 (`db_error_kind` spike guard pro `aidvisora_app` cutover). | Marek |

---

_Dotazy: [`bezpecnost@aidvisora.cz`](mailto:bezpecnost@aidvisora.cz)._
