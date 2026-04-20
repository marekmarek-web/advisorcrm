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

## 6. Review

- Po každém P0 incidentu → zkontrolovat, jestli stávající alerty incident detekovaly včas. Pokud ne → přidat / upravit.
- **Čtvrtletně** → review seznam alertů, zrušit ty, co za kvartál nestřelily ani jednou relevantně (noise elimination).
- Po migraci infrastrukturního partnera → kompletní revize (filtry jsou často vázané na strukturu log messages).

## 7. Historie změn

| Datum | Změna | Autor |
|---|---|---|
| 2026-04-20 | Initial v1 — definováno 7 alertů, mapping na runbook. | Marek |

---

_Dotazy: [`bezpecnost@aidvisora.cz`](mailto:bezpecnost@aidvisora.cz)._
