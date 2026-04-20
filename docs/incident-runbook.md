# Incident Response Runbook — Aidvisora

**Verze:** v1 · platnost od 2026-04-20 · maintainer: Marek (zakladatel / on-call)  
**Interní dokument** — neveřejný. Reference na `/bezpecnost` (oddíl 4 · Audit, monitoring a obnova) odkazuje na existenci tohoto runbooku; samotný obsah je k dispozici v rámci enterprise due diligence na vyžádání (`bezpecnost@aidvisora.cz`).

---

## 1. Účel

Tento runbook definuje, jak Aidvisora:

1. **detekuje** provozní incidenty (errory, pády, výpadky integrací, degradace),
2. **klasifikuje** jejich závažnost,
3. **kontejnuje** dopad (rollback, feature flag off, rate-limit),
4. **komunikuje** uživatelům i interně,
5. **obnoví** provoz,
6. **zpětně vyhodnotí** (post-mortem).

Neřeší datové průniky (ty pokrývá samostatný dokument [`breach-playbook.md`](./breach-playbook.md)). Řeší **všechno ostatní**: regrese po deployi, webhook failures, degradace Supabase / Vercel / Stripe, DoS podobné události.

## 2. Severity klasifikace

| Severity | Příklad | Reakční lhůta on-call | Komunikace mimo tým |
|---|---|---|---|
| **P0 — Critical** | Kompletní výpadek aplikace (login nefunguje, 5xx >50 % na `/portal`, DB nedostupná). Ztráta dat nebo její vysoké riziko. Stripe webhook nepřijímá >1h. | **≤ 15 min** detekce → zahájení response | okamžitě statuspage + e-mail všem aktivním workspace adminům (viz šablona níže) |
| **P1 — High** | Degradace pro ≥20 % uživatelů (pomalé odpovědi, výpadek jedné core feature — např. AI review, upload dokumentů). Problém se Stripe checkout, ale portál funguje. | **≤ 30 min** | statuspage + e-mail dotčeným workspace |
| **P2 — Medium** | Bug ovlivňující jednu neklíčovou funkci (např. calendar sync degraded, notifikace se posílají s prodlevou). Jednotkoví uživatelé se stěžují. | do **4 hodin** v pracovní době, do konce dne mimo | jen pokud trvá >8h |
| **P3 — Low** | Kosmetické bugy, textové chyby, edge cases bez dopadu na data. | do **48 hodin** | žádná externí komunikace |

Řídí se horší klasifikací mezi **rozsahem** a **dopadem na data**. Pokud existuje podezření na úniku dat → okamžitě **breach flow** (viz `breach-playbook.md`), **ne** klasický incident flow.

## 3. On-call (beta fáze)

Během beta (do veřejného launche) je on-call **Marek** jako single-person. Záskok v době nedostupnosti:

| Role | Osoba | Kontakt | Poznámka |
|---|---|---|---|
| Primární on-call | Marek | (telefon v password manageru) | |
| Záskok | _bude doplněn po rozšíření týmu_ | — | do té doby v době Markovy nedostupnosti platí best-effort |

**Single-person alerting je přijaté riziko do launche.** Pro enterprise DD dokumentujeme, že plánujeme rotaci po získání druhého on-call schopného inženýra.

Kanály alertů:

- **Sentry** — kritické erroy (P0/P1 signály) → e-mail `bezpecnost@aidvisora.cz` + push notifikace v Sentry mobile app.
- **Supabase** — health alerty přes e-mail.
- **Vercel** — deploy failures přes e-mail.
- **Stripe** — webhook failures přes dashboard + e-mail.
- **Uptime** — externí monitor (doplnit po spuštění statuspage).

Konfigurace alertů v [`docs/observability/sentry-alerts.md`](./observability/sentry-alerts.md).

## 4. Response flow

### 4.1 Detect (D)

Signály:

- Sentry alert (viz definice alertů),
- uživatelské hlášení (e-mail na `support@aidvisora.cz`, `bezpecnost@aidvisora.cz`),
- vlastní zjištění (release smoke test, monitoring dashboard),
- Supabase / Vercel / Stripe hlášení v dashboardu.

**Akce:** Založ „incident ticket" (privátní poznámka nebo GitHub Issue v privátním repu s labelem `incident`). Zachyť:

- čas detekce (UTC),
- zdroj (Sentry link, user report ID, …),
- první odhad severity,
- initial hypothesis (co je zřejmě špatně).

### 4.2 Triage (T)

Během prvních **15 minut u P0/P1**:

1. Ověř **rozsah** — kolik workspace, které funkce.
2. Rozhodni, jestli je to **incident** (provozní) nebo **breach** (dotčena důvěrnost/integrita osobních dat). Při podezření na breach → **okamžitě** přejít na `breach-playbook.md`.
3. Urči **kategorii**: app bug / infra / 3rd-party / security.
4. Update severity v ticketu.
5. U P0/P1 rovnou přejdi na **Containment** paralelně s dalším zkoumáním.

### 4.3 Contain (C) — nejdůležitější fáze

Cíl: **zastavit šíření dopadu**, i když root cause ještě neznám. Preferuj **reverzibilní akce** před fixováním.

Dostupné páky (od nejrychlejších):

| Páka | Kdy | Jak |
|---|---|---|
| **Rollback Vercel deployu** | regrese po deployi < 24h | Vercel dashboard → Project → Deployments → klik na předchozí healthy → **Promote to Production** |
| **Feature flag off** | konkrétní feature regresí | (TBD — zatím ručně přes env var změnu) |
| **Rate-limit / disable veřejný endpoint** | spike / DoS / chyba v public endpointu (checkout, webhook) | Vercel → Firewall → dočasné pravidlo; alternativně dočasné `return 503` v kódu |
| **Supabase read-only mode** | riziko korupce dat | Supabase dashboard → Settings → Database → pozastavit writes (poslední možnost, sdělit uživatelům) |
| **Stripe webhook disable** | pokud webhook shazuje opakovaně a riskuje double-charge efekty | Stripe dashboard → Developers → Webhooks → **Disable endpoint**. **Pozor:** Stripe retryuje 3 dny, během disable se eventy nebudou přehrávat do doby re-enable + replay. |

Dokumentuj **každé** provedené containment action v ticketu (čas, kdo, co).

### 4.4 Communicate (Comm)

**P0 template — statuspage a e-mail adminům:**

```
Předmět: [Aidvisora · probíhající incident] ⚠︎ <krátký popis>

Ahoj,

momentálně řešíme problém s <funkcí/službou>. Zhruba od <HH:MM CET> má
dopad na <rozsah>. Pracujeme na nápravě a dáme vědět hned, jak bude
provoz obnoven.

Co teď nejde: <seznam>
Co funguje normálně: <seznam>
Doporučená náhrada (pokud existuje): <…>

Děkujeme za trpělivost.
Tým Aidvisora
```

**P0 rozšířená interní komunikace** (v budoucnu Slack / Discord kanál `#incidents`):

- status aktualizovat **každých 30 min**, i když „zkoumáme",
- jasně oddělovat **fakta** od **domněnek**,
- nelaškuj ani v interní zprávě se spekulacemi o příčině vůči klientům („Stripe má výpadek" → jen pokud to stripe.com/status potvrzuje).

**Recovery komunikace (P0/P1):**

```
Předmět: [Aidvisora · incident vyřešen] ✅ <krátký popis>

Incident z <datum + čas> je vyřešen od <čas>.
Dopad: <rozsah>. Příčina: <jedna věta lidsky>.
Post-mortem zveřejníme do 5 pracovních dnů.
```

### 4.5 Recover (R)

- Ověř, že containment lze bezpečně odstranit (monitoring dashboard, sentry graf, ruční smoke test klíčových flow).
- Znovuotevři dotčené endpointy / features.
- Odešli recovery komunikaci (viz šablona výše).
- Zaznamenej **čas plné obnovy** do ticketu.

### 4.6 Retrospective (post-mortem)

**Do 5 pracovních dnů** od P0/P1 incidentu. Blameless, zaměřeno na systém, ne na osoby. Template níže.

## 5. Rollback postupy — step-by-step

### 5.1 Vercel (aplikace)

1. Vercel dashboard → **aidvisora** projekt → **Deployments**.
2. Najdi poslední deploy před problematickým (status = Ready, časový razítko zřejmé).
3. Tři tečky → **Promote to Production**.
4. Ověř na `https://aidvisora.cz` otočením CTRL+F5 — v footeru je commit hash.
5. Zapiš do ticketu čas promote + commit hash healthy verze.

Rollback **neřeší migrační změny schématu** — pokud problematický deploy změnil DB schéma, sama promote sam neopraví. Viz 5.2.

### 5.2 Supabase (databáze)

**Dva režimy:**

**A) Point-in-Time Recovery** (ztráta dat / korupce)
1. Supabase dashboard → **Database → Backups**.
2. **Point-in-time recovery** → zvol časový bod **před incidentem**.
3. PITR obnoví databázi do nové instance — ověř data v nové instanci **předtím**, než přesměruješ prod.
4. Přesměrování connection stringu: Vercel env var `DATABASE_URL` (+ Supabase `service_role_key` pokud se mění instance) → redeploy production.
5. **Důsledek:** data zapsaná **po** obnoveném bodu jsou ztracena. Komunikuj toto jasně uživatelům.

**B) Reverse migrace** (schema drift po špatné migraci)
1. V Supabase SQL editoru spusť **reverzní DDL** — musí být připravený v `packages/db/migrations/rollback-<název>.sql` už v době PR (vždy psát zároveň s migrací).
2. Rollnout kód v 5.1 na verzi kompatibilní s předchozím schématem.
3. Ověř funkčnost.
4. **Nesmaž** forward migrační script — zachovej ho v `packages/db/migrations/.archive/` pro historii.

### 5.3 Stripe (billing)

| Scénář | Akce |
|---|---|
| Duplicitní charge detekován | Stripe dashboard → Customers → najdi customer → Charges → **Refund** s poznámkou „incident <ID>, duplicitní charge". |
| Subscription omylem aktivována (špatná migrace dat) | Subscription → **Cancel immediately** + **Refund** poslední invoice. |
| Webhook shodil neodbavené eventy | Stripe dashboard → Developers → Webhooks → endpoint detail → **Resend** jednotlivé události po vyřešení; nebo CLI `stripe events resend <evt_…>`. |
| Celkové pozastavení nových přihlášení | Nastav `STRIPE_CHECKOUT_DISABLED=true` env var na Vercelu → redeploy (kód checkout route vrátí 503 v tom případě). **TBD:** tenhle env check v kódu ještě nemám, doplnit před launchem. |

### 5.4 Auth / Supabase Auth

Pokud je podezření na kompromitaci accountu:
1. Supabase dashboard → **Authentication → Users** → uživatel → **Logout all devices** (invalid sessions).
2. Reset password (magic-link z dashboardu).
3. Uživatele kontaktuj přes `bezpecnost@aidvisora.cz` — NIKOLI přes příchozí e-mail, který hlášení spustil (anti phishing).

## 6. Externí kontakty

| Služba | Kanál | Poznámka |
|---|---|---|
| Supabase support | `support@supabase.io` + dashboard chat (paid plan) | u kritické degradace DB |
| Vercel support | dashboard chat | degradace edge/buildů |
| Stripe support | dashboard chat / `support@stripe.com` | duplicitní charge, API issues |
| Sentry support | dashboard chat | problém s příjmem eventů |
| Právník (doplnit) | — | před externí komunikací o incidentu s PR dopadem |

## 7. Post-mortem template

Vytvoř soubor v `docs/post-mortems/YYYY-MM-DD-<krátký-slug>.md`:

```markdown
# Post-mortem — <název incidentu>

- **Datum:** YYYY-MM-DD
- **Severity:** P0 / P1 / P2
- **Trvání:** HH:MM → HH:MM CET (celkem X minut)
- **Autor:** <jméno>
- **Stav:** Resolved

## Timeline (UTC)

- `HH:MM` — <detekce, první hypotéza, …>
- `HH:MM` — …
- `HH:MM` — full recovery potvrzen

## Dopad

- Dotčení uživatelé: <rozsah>
- Dotčené funkce: <seznam>
- Ztráta dat: ano / ne (pokud ano → aktivovat breach-playbook)
- Finanční dopad (charge-back, refund): <částka / žádný>

## Root cause

<Technicky přesná příčina, bez viny osobám. Commit hash, change ID apod.>

## Co fungovalo

- <aspekty detekce / response, které pomohly>

## Co nefungovalo

- <chybějící alert, pomalá reakce, zmatená komunikace, …>

## Akční položky (follow-up)

| # | Item | Vlastník | Termín | Stav |
|---|------|----------|--------|------|
| 1 | <konkrétní akce, ne „být opatrnější">. | | | open |
```

Post-mortem se **nezveřejňuje veřejně**. U P0 se shrnutí pošle **dotčeným workspace adminům** bez rootcause detailů, které by umožnily reprodukci útoku.

## 8. Retenční a evidenční pravidla

- Incident tickety: archivace **5 let** od uzavření (pro případnou regulatorní kontrolu).
- Post-mortem dokumenty: v `docs/post-mortems/` **neomezeně** (historie učení se).
- Osobní údaje v log entries: po 90 dnech rotace / anonymizace — viz retence dat v Privacy Policy.

## 9. Review tohoto runbooku

- Minimálně **2× ročně** (dubna, října) → revize severities, kontaktů, rollback kroků.
- Po každém P0 incidentu ad-hoc update na základě learnings.
- Po změně infrastrukturního partnera (např. migrace z Supabase / Vercel / Stripe) → obligatorní update.

---

_Dotazy na tento runbook: [`bezpecnost@aidvisora.cz`](mailto:bezpecnost@aidvisora.cz)._
