# E-mailové kampaně — stav platformy (v2, 2026-04)

Tento dokument popisuje aktuální stav plné platformy e-mailových kampaní. Nahrazuje
předchozí MVP audit — MVP funkce jsou v produkci a rozšířené o plánování, queue,
tracking, automatizace, referraly, kurátované novinky a AI generátor.

## Hlavní moduly

### F1 — Draft / odeslání / šablony

- `email_campaigns` s poli pro draft, naplánované odeslání, preheader, `tracking_enabled`,
  `from_name_override`, `segment_id`, `segment_filter`, `template_id`, a A/B
  meta (`parent_campaign_id`, `ab_variant`, `ab_winner_at`).
- `email_templates` per tenant + globální katalog (seedovaná sada šablon
  `blank`, `birthday`, `newsletter`, `consultation`, `year_in_review`,
  `referral_ask`). UI má „Uložit jako šablonu".
- Personalizace `{{jmeno}}`, `{{cele_jmeno}}`, `{{unsubscribe_url}}`,
  `{{year_savings_total}}`, `{{products_list}}`, `{{meetings_count}}`,
  `{{referral_url}}`.
- Advisor `fromName` z `advisor_preferences` / `tenant_settings`, override
  per-kampaň.

### F2 — Queue & scheduling

- `email_send_queue` s per-job retry backoff, `FOR UPDATE SKIP LOCKED`.
- Vercel Cron `/api/cron/email-queue-worker` (každou minutu):
  - `activateDueScheduledCampaigns` → draft/scheduled → queued v čase `scheduled_at`,
  - `processEmailQueueBatch` (5× batch po 40),
  - `reapStuckQueueJobs`,
  - `finalizeCompletedCampaigns`,
  - `finalizeDueAbTests`.
- Kill-switch `EMAIL_SENDING_DISABLED=1`.
- Scheduling v UI (date-time picker na kampaň, progress bar na detailu).

### F3 — Tracking & deliverability

- `/api/t/o/[token]` — open pixel.
- `/api/t/c/[token]` — click wrapper s whitelist redirect ochranou proti
  open redirect útokům.
- Worker přepisuje `<a href>` v HTML a vkládá open pixel (respektuje
  `tracking_enabled` flag).
- `/api/email/resend-webhook` (Svix verify) — `delivered`, `bounced`,
  `complained`, `opened`, `clicked`. Hard bounce → `contacts.do_not_email = true`.
- `List-Unsubscribe` + `List-Unsubscribe-Post: One-Click` headery pro native
  unsubscribe v Gmailu / Apple Mailu.
- Detail kampaně: KPI karty (sent / delivered / opened / clicked / bounced /
  unsubscribed), recipient tabulka s per-uživatelem stavem, sparkline vývoje.

### F4 — Automations

- `email_automation_rules`, `email_automation_runs` tabulky s RLS a indexy.
- Visual **segment query builder** (`SegmentBuilder`) — AND/OR rules,
  pole: tag, city, birthMonth, createdWithinDays, hasActiveContract, hasEmail.
  Live preview počtu kontaktů přes `previewSegmentCount`.
- Cron `/api/cron/email-automations` (denně) — triggery:
  - `birthday`: offset dny před / po narozeninách,
  - `inactive_client`: N dnů bez updatu,
  - `year_in_review`: 1× ročně kolem konkrétního data.
  Idempotence přes `email_automation_runs` (dedup-window, kontaktID + rule).
- UI `/portal/email-campaigns/automations` — tabulka pravidel, modal pro
  create/edit (trigger, config, template, offset, send hour, aktivace).

### F5 — Year in review & referrals

- `generateYearInReviewDraft` — agreguje za kontakt nebo tenant počty smluv,
  objem pojistného, produktový list, počet schůzek. Personalizuje šablonu
  `year_in_review` a vrací draft k úpravě.
- `referral_requests` tabulka s per-request tokenem (60 dní expirace default).
- `createReferralRequest({ contactId, sendEmail })` — generuje token + URL,
  volitelně odešle e-mail přes šablonu `referral_ask`.
- `/r/[token]` public landing (service role, bypass RLS) s `ReferralFormClient`:
  form pro doporučujícího, vytvoří nový `contacts` řádek s tagy
  `["lead","referral"]` a vazbou na zdrojový kontakt přes `lead_source="referral"`,
  `source_kind="manual"`.
- `ClientReferralSection` → tlačítka "Poslat žádost o doporučení" a
  "Zkopírovat referral odkaz".
- `/portal/email-campaigns/referrals` — KPI (total / opened / submitted /
  conversion rate) + tabulka všech requestů.

### F6 — Content & AI

- `email_content_sources` — kurátorovaný seznam článků (manual, vysvětlené
  explicitní rozhodnutí — automatický scraper v MVP ne). Tabulka obsahuje
  `url`, `canonical_url`, `title`, `description`, `image_url`, `source_name`,
  `tags`, `is_evergreen`.
- `fetchArticleMetadata(url)` — server-only fetcher, parsuje Open Graph /
  Twitter Card / HTML meta. Timeout 8s, content-type whitelist.
- `listContentSources`, `previewArticleMetadata`, `saveContentSource`,
  `deleteContentSource`, `markContentSourceUsed` — CRUD actions.
- `composeNewsletterHtml(templateHtml, articles)` injektuje karty mezi
  `<!-- articles:start -->` / `<!-- articles:end -->` markery
  šablony `newsletter`.
- `generateNewsletterDraft({ articleIds, subjectOverride?, preheaderOverride? })`
  sestaví draft z vybraných článků.
- **AI generátor** `generateCampaignDraft({ goal, audienceDescription?,
  baseTemplateKind?, articleIds?, toneHints? })` — OpenAI Responses API
  (structured output, `default` routing). Vrací `{ subject, preheader,
  bodyHtml, notes }` s povinnými placeholdery `{{jmeno}}` a `{{unsubscribe_url}}`.
- **A/B testing subjectu**:
  - `createAbVariant({ parentCampaignId, subjectB, preheaderB? })` — kopíruje
    body, liší se pouze subject; parent → `ab_variant='a'`, child →
    `ab_variant='b'` + `parent_campaign_id`.
  - `launchAbTest({ parentCampaignId, splitPercent=20, pickWinnerAfterMinutes=240 })`
    — shuffle audience, pošle 20 % na A, 20 % na B, zbytek uloží do metadata
    `segment_filter._ab.holdoutContactIds` s `finalizeAt`.
  - `finalizeAbTestWinner(parentId)` / `finalizeDueAbTests()` (cron) —
    po uplynutí `finalizeAt` vybere variantu s vyšším open-rate a rozesla
    holdout zbytek pod subjectem vítěze.

## Bezpečnost

- Všechny write akce gated přes `hasPermission(role, "contacts:write")`.
- Cron routes chráněné `CRON_SECRET` přes `cronAuthResponse`.
- Public routes (`/r/[token]`, `/t/o`, `/t/c`, `/unsubscribe`) používají
  `withServiceTenantContext` + bypass RLS, všechny operace idempotentní
  a scoped na konkrétní token.
- Resend webhook verifikovaný Svix signaturami.

## Provozní checklist

- [ ] `EMAIL_SENDING_DISABLED` kill-switch (environment).
- [ ] `RESEND_API_KEY`, `RESEND_WEBHOOK_SECRET` nastaveny ve Vercel env.
- [ ] Cron `email-queue-worker` běží každou minutu.
- [ ] Cron `email-automations` běží 1× denně (08:00 UTC).
- [ ] Seed `email_templates` (globální) proveden.
- [ ] Whitelist domén pro click-tracking (per tenant v DB / env).

## Ověření

- Vytvořit kampaň → uložit draft → naplánovat (+5 min) → ověřit, že cron ji
  zařadí do queue a odesílá.
- Ručně spustit `/api/email/resend-webhook` payloadem typu `email.opened` →
  stav recipienta musí přejít na `opened`.
- Vytvořit A/B test (createAbVariant + launchAbTest s pickWinnerAfterMinutes=5),
  otevřít pár e-mailů pouze v jedné variantě → po 5 minutách musí cron
  automaticky rozeslat zbytek s vítězným subjectem.
- Vytvořit referral request z kontaktu, otevřít `/r/[token]` v inkognito,
  vyplnit formulář → nový `contacts` řádek s tagy `lead,referral` musí
  vzniknout, referral_request status = `submitted`.

## Zadluženější body / next steps

- Per-tenant whitelist domén pro click-tracking (teď globální).
- Media knihovna pro e-mail editor (uploads do storage).
- TipTap / Lexical WYSIWYG (současný `contenteditable` je funkční, ale
  limitovaný).
- Advisor / tenant preference pro preferovaný čas odeslání automatizací
  (lokální TZ; nyní pouze UTC `send_hour`).
- Rozdělit `EmailCampaignsClient.tsx` na Editor / Preview / History
  subcomponenty.
- Statistický test významnosti u A/B (nyní jen porovnání open rate) —
  Wilson confidence interval + minimum sample threshold.

## Gap closure v2 (2026-04-23)

Druhá vlna uzavírá rezidua z původního 3+ měsíčního plánu: chybějící
automation triggery, rozšířený segment builder, year-in-review nad
skutečnými datovými zdroji, referral thank-you automation, whitelist
domén pro article fetcher, editor UI pro článek / AI návrh / A/B test,
GDPR consent check, mass-send audit log a feature flags.

### Feature flag matrix

| Kód flagu | Scope | Default | Kde se kontroluje |
| --- | --- | --- | --- |
| `email_campaigns_v2_queue` | tenant | **ON** | `queueEmailCampaign` ([email-campaigns.ts](../apps/web/src/app/actions/email-campaigns.ts)) |
| `email_campaigns_v2_tracking` | tenant | **ON** | `processEmailQueueBatch` ([queue-worker.ts](../apps/web/src/lib/email/queue-worker.ts)) |
| `email_campaigns_v2_automations` | tenant | OFF | `runDueAutomations` ([automation-worker.ts](../apps/web/src/lib/email/automation-worker.ts)) + navigační link |
| `email_campaigns_v2_ai` | tenant | OFF | `generateCampaignDraft` + toolbar button (Wand2) |
| `email_campaigns_v2_ab` | tenant | OFF | `createAbVariant` + `launchAbTest` + toolbar button (SplitSquareHorizontal) |
| `email_campaigns_v2_referrals` | tenant | OFF | `createReferralRequest` + navigační link |

Flagy jsou definované v `apps/web/src/lib/admin/feature-flags.ts`. Admin je
může per tenant přepnout přes `setFeatureOverride(code, tenantId, enabled)`.

### Rollout postup

1. **Pilot (1 tenant, interní)** — nastavit všechny `email_campaigns_v2_*`
   flagy na **ON** pro interní testovací tenant. Ověřit queue, tracking,
   automations, AI, A/B i referraly přes jeden end-to-end scénář
   (viz sekce „Verifikace po nasazení").
2. **10 % tenantů (early adopters)** — vybrané poradenské firmy, které
   mají ve zpětné vazbě požádáno o beta přístup. Postupně zapnout
   `automations`, pak `referrals`, nakonec `ai` a `ab`. Sledovat
   `incident_logs` (mass-send audit) a Resend bounce rate denně týden.
3. **100 % tenantů** — `queue` a `tracking` už jsou default ON. Zbytek
   flagů zapnout hromadně po 2 týdnech od začátku 10% vlny bez
   negativních signálů (open rate > 15 %, bounce < 3 %, žádné Svix
   verifikační chyby).

### GDPR consent a mass-send audit

- `hasValidConsent(contactId, "marketing_emails")` v
  [consent-check.ts](../apps/web/src/lib/compliance/consent-check.ts)
  joinuje `consents` + `processing_purposes`. Kill-switch
  `EMAIL_CONSENT_ENFORCEMENT=0` consent check přeskočí (pro testovací
  prostředí). Seed migrace
  `email-campaigns-marketing-consent-2026-04-23.sql` přidává
  `marketing_emails` purpose pro všechny existující tenanty a
  `contacts.birth_greeting_opt_out` bool sloupec.
- `queueEmailCampaign` + `automation-worker` vždy filtruje kontakty
  bez platného consentu z příjemců a loguje skipped count v
  `email_automation_runs`.
- Při ≥ 50 příjemcích se zavolá `createIncident` (severity: `low`) v
  [incident-service.ts](../apps/web/src/lib/security/incident-service.ts)
  s meta `{ campaignId, recipientCount, segmentId }`. Auditní stopa
  pro compliance a DPO.

### Article fetcher — SSRF guard

[article-fetcher.ts](../apps/web/src/lib/email/article-fetcher.ts) má
whitelist domén `ARTICLE_FETCHER_ALLOWED_DOMAINS` (kurzy.cz, penize.cz,
hypoindex.cz, idnes.cz, aktualne.cz, e15.cz, seznamzpravy.cz,
novinky.cz, roklen24.cz) a funkci `isPrivateOrInvalidHost`, která
odmítá privátní IP, loopback, link-local a cloud metadata IP. URL se
kontroluje před fetchem i po redirectu (final URL).

### Verifikace po nasazení (SQL queries)

Po každé rollout vlně spustit tyto kontroly:

```sql
-- Automations běží denně a zpracovávají pravidla
SELECT
  date_trunc('day', started_at) AS day,
  count(*) AS runs,
  sum(matched_count) AS matched,
  sum(queued_count) AS queued,
  sum(skipped_count) AS skipped
FROM email_automation_runs
WHERE started_at > now() - interval '7 days'
GROUP BY 1
ORDER BY 1;

-- Tracking eventy tečou z Resendu
SELECT event_type, count(*)
FROM email_campaign_events
WHERE occurred_at > now() - interval '24 hours'
GROUP BY 1
ORDER BY 2 DESC;

-- Consent check filtruje kontakty bez souhlasu (hledej 'no consent' v důvodech)
SELECT skipped_reason, count(*)
FROM email_automation_runs
WHERE skipped_reason IS NOT NULL
  AND started_at > now() - interval '7 days'
GROUP BY 1;

-- Mass send audit log má stopu
SELECT created_at, title, meta
FROM incident_logs
WHERE title LIKE 'Mass email send%'
  AND created_at > now() - interval '7 days'
ORDER BY created_at DESC;

-- A/B testy finalizují automaticky
SELECT
  c.id AS parent_id,
  c.subject AS subject_a,
  (SELECT subject FROM email_campaigns WHERE parent_campaign_id = c.id AND ab_variant = 'b') AS subject_b,
  (c.segment_filter->'_ab'->>'finalizeAt')::timestamptz AS finalize_at,
  (c.segment_filter->'_ab'->>'finalizedAt')::timestamptz AS finalized_at,
  c.segment_filter->'_ab'->>'pickedWinnerVariant' AS winner
FROM email_campaigns c
WHERE c.parent_campaign_id IS NULL
  AND c.segment_filter ? '_ab'
ORDER BY c.created_at DESC
LIMIT 20;

-- AI generator log — kontrola, že drafty jsou logované
SELECT
  date_trunc('day', created_at) AS day,
  count(*) FILTER (WHERE status = 'success') AS ok,
  count(*) FILTER (WHERE status = 'failure') AS failed
FROM ai_generations
WHERE prompt_type = 'email_campaign_draft'
  AND created_at > now() - interval '14 days'
GROUP BY 1
ORDER BY 1;
```

Pokud `queued` je 0 u vybraného tenanta po aktivaci flagu, zkontrolovat:
- zda pro daný tenant běží `isFeatureEnabled("email_campaigns_v2_automations", tenantId) = true`,
- zda `email_automation_rules.is_active = true` a `trigger_type` patří mezi implementované (`birthday`, `inactive_client`, `year_in_review`, `contract_anniversary`, `service_due`, `proposal_accepted`, `contract_activated`, `analysis_completed`, `referral_ask_after_proposal`, `referral_ask_after_anniversary`),
- zda existuje `email_templates` se shodným `kind` (např. `birthday`, `referral_ask`, `year_in_review`).
