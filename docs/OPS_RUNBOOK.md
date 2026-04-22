# Aidvisor – Provozní příručka

## Uptime monitoring / statuspage

**Veřejný health endpoint:** `GET /api/health` (viz `apps/web/src/app/api/health/route.ts`).

- Vrací `200 { status: "ok", checks: { db: "up" }, … }` když aplikace i DB odpovídají.
- Vrací `503 { status: "degraded", checks: { db: "down", dbError } }` když selže `select 1` na primární DB.
- Podporuje `HEAD` pro levné polling přes uptime monitor.
- Je rate-limited na 60 req/min/IP, takže se hodí **nalepit statuspage monitor s frekvencí 1–2 min**.
- Neobsahuje žádné tajné hodnoty – jen env name, commit SHA (12 znaků) a response time.
- Cache headers `Cache-Control: no-store` → uptime monitor vidí real-time stav.

**Doporučená nastavení monitoru (Better Uptime / BetterStack / UptimeRobot):**

| Pole | Hodnota |
|---|---|
| URL | `https://<prod-domain>/api/health` |
| Metoda | `GET` (pro zachytávání body v alertu) nebo `HEAD` (levnější) |
| Frekvence | 1–2 min |
| Expect status | `200` |
| Expect body obsahuje | `"status":"ok"` (pro GET) |
| Alert P0 | downtime > 3 min nebo 503 ≥ 2x po sobě |
| Recipient | `bezpecnost@aidvisora.cz` + Sentry mobile push |
| Runbook | [`incident-runbook.md`](./incident-runbook.md) |

**MANUAL STEP** — Monitor je potřeba vytvořit ručně v uptime službě (repo pouze poskytuje endpoint). Po vytvoření zapiš odkaz do `docs/observability/sentry-alerts.md §7 Uptime`.

---

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

**Hobby plán Vercelu:** každý cron smí běžet **nejvýš jednou denně**. Výrazy typu `*/5 * * * *` (každých 5 minut) **deployment na Hobby shodí** a v logu / dokumentaci odkáže na *Usage & Pricing for Cron Jobs*. Kalendářní připomenutí (`/api/cron/event-reminders`) je v repu nastavené denně (`0 10 * * *` UTC). Pro opětovné **subdenní** připomínky je potřeba **Vercel Pro** (nebo externí scheduler volající stejný endpoint s `CRON_SECRET`).

**Připomenutí vs. kalendář:** samotný kalendář (události, sync, UI) na cronu nezávisí; omezený je jen job, který posílá CRM notifikace. Route používá výchozí okno **24 h** zpět od `reminderAt` (vhodné k dennímu cronu). Na Pro s častým cronem můžeš zúžit env **`EVENT_REMINDER_GRACE_PAST_MIN`** (např. `120` = jen poslední 2 h).

**Kde nastavit `CRON_SECRET`:** Vercel → tvůj projekt → **Settings** → **Environment Variables** → přidej `CRON_SECRET` (dlouhý náhodný řetězec, např. `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"`), scope **Production** (a případně Preview). Stejnou hodnotu musí route ověřit přes hlavičku `Authorization: Bearer <CRON_SECRET>` – Vercel u naplánovaných cronů **posílá tuto hlavičku automaticky**, pokud je proměnná nastavená.

**Pozn.:** Cursor / Vercel MCP nemá nástroj na zápis env proměnných – musíš to doplnit v dashboardu, nebo po `vercel login` z kořene projektu webu:  
`vercel env add CRON_SECRET` → vyber Production (a případně Preview) → vlož hodnotu.

Ověření ručně z terminálu:  
`curl -H "Authorization: Bearer TVUJ_CRON_SECRET" "https://tvoje-domena.cz/api/cron/fa-followup"`

**Nenastavuj ručně** env `VERCEL_GIT_COMMIT_SHA` (nebo ho smaž) – Vercel si commit SHA doplňuje sám; literál může rozházet Sentry release.

---

## Veřejná rezervace schůzek (`/rezervace/{token}`)

- **Migrace:** `packages/db/migrations/add_advisor_public_booking.sql` (sloupce na `advisor_preferences`, unikátní index na `public_booking_token`).
- **Odkaz pro klienty:** Kanonická báze musí být v **`NEXT_PUBLIC_APP_URL`** (bez koncového `/`) – stejně jako u pozvánek do klientské zóny; v Nastavení účtu se zobrazí `${NEXT_PUBLIC_APP_URL}/rezervace/{token}`.
- **Omezení v1:** Volné sloty a kolize se počítají z **událostí v Postgresu** (`events`) přiřazených danému poradci (`assigned_to`). Události, které existují **jen v Google Kalendáři** a nejsou uložené v CRM, se jako obsazené **nemusí** promítnout. Poradce si může dostupnost sladit v CRM nebo spoléhat na záznamy událostí v databázi.

---

## Kde co udělat (Supabase + Vercel + Sentry) – stručně

### 1) SQL migrace (Supabase)

1. Otevři **Supabase** → projekt → **SQL Editor**.
2. Vlož obsah souborů v tomto pořadí (nebo znovu celý opravený soubor):
   - `packages/db/migrations/pre-launch-data-integrity.sql`  
     *(nahoře teď přidává `archived_at` / `archived_reason` na `contacts` – bez toho padá index.)*
   - `packages/db/migrations/pre-launch-document-types.sql`
3. **Run**. Pokud už část první migrace proběhla, můžeš spustit jen chybějící řádky (např. jen `ALTER TABLE contacts ...` a pak `CREATE UNIQUE INDEX ...`).

#### Tabulka `documents` (portal upload, sken, quick-upload)

Po každém deployi, který mění dokumentová API nebo Drizzle schéma `documents`, ověř v produkci sloupce. Pokud upload padá na `column … does not exist`, spusť migrace v tomto pořadí (všechny používají `IF NOT EXISTS`, opakované spuštění je bezpečné):

1. `packages/db/migrations/add-document-upload-source.sql` — `upload_source` (legacy jednosouborová migrace)
2. `packages/db/migrations/ensure_documents_list_columns.sql` — sloupce pro seznam dokumentů
3. `packages/db/drizzle/0011_documents_sensitive.sql` — `sensitive`
4. `packages/db/drizzle/0016_document_processing.sql` — processing sloupce + `document_processing_jobs` *(přeskočitelné, pokud bod 5 už proběhl celý)*
5. **`packages/db/migrations/documents_schema_sync_2026.sql`** — **doplní všechny chybějící sloupce** vůči `packages/db/src/schema/documents.ts` včetně `source_channel`, `document_fingerprint`, `business_status`, JSON polí pro pipeline atd., a zajistí tabulku/indexy pro `document_processing_jobs`.

Pro nový projekt nebo jednorázový „catch-up“ často stačí jen spustit bod **5** (pokud základní tabulka `documents` už existuje). Ověření:

```sql
SELECT column_name
FROM information_schema.columns
WHERE table_schema = 'public' AND table_name = 'documents'
ORDER BY ordinal_position;
```

Lokálně / po nasazení SQL ověřte z kořene repa (`DATABASE_URL` musí mířit na stejnou DB):

`pnpm db:verify-documents-schema`

Pokud migrace chybí, serverová akce `listDocuments` může vrátit prázdný seznam a v logu označit pravděpodobný drift schématu — jde o měkký fallback; produkční stav je vždy po aplikaci SQL výše.

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

**Resend (klíč a doména):** `RESEND_API_KEY` nikdy necommitovat – jen Vercel / lokální `.env.local`. Po úniku klíče ho v [Resend → API Keys](https://resend.com/api-keys) zruš, vytvoř nový, nastav na Vercelu a **Redeploy**. Vlastní odesílatel (`RESEND_FROM_EMAIL` nebo generovaný From přes `RESEND_FROM_DOMAIN`) vyžaduje ověřenou doménu v Resend **Domains** (DNS).

**E-maily (From / Reply-To):** U přihlášeného poradce aplikace sestaví **From** jako zobrazované jméno + adresa `jmeno.prijmeni.<suffix>@RESEND_FROM_DOMAIN` (suffix z userId kvůli jednoznačnosti), pokud je doména známa. **Reply-To** = `user_profiles.email` → jinak Supabase **user.email** → jinak `RESEND_REPLY_TO`. Cron **service-reminders** (bez přihlášeného uživatele): **Reply-To** = `tenants.notification_email`, pak `RESEND_REPLY_TO`. Viz [`advisor-mail-headers.ts`](../apps/web/src/lib/email/advisor-mail-headers.ts).

4. Po změně env často stačí **Redeploy** posledního deploye (Deployments → … → Redeploy).

### 3) Sentry

V repu je manuální setup podle [sentry-for-ai `sentry-nextjs-sdk/SKILL.md`](https://github.com/getsentry/sentry-for-ai/blob/main/skills/sentry-nextjs-sdk/SKILL.md): `instrumentation-client.ts`, `sentry.server.config.ts`, `sentry.edge.config.ts`, `instrumentation.ts`, `app/global-error.tsx`, `withSentryConfig` v `next.config.js`, tunel `/monitoring`.

1. V Sentry vytvoř projekt (Next.js), zkopíruj **DSN**.
2. Na Vercel přidej **`NEXT_PUBLIC_SENTRY_DSN`** (a volitelně `SENTRY_DSN`). Pro čitelné stack trace v produkci: `SENTRY_AUTH_TOKEN`, `SENTRY_ORG`, `SENTRY_PROJECT` (viz [Auth tokens](https://sentry.io/settings/auth-tokens/)).
3. Volitelně interaktivní wizard (jiný výstup než ruční soubory): `npx @sentry/wizard@latest -i nextjs` ve `apps/web`.
4. Ověření: dočasně `throw new Error("Sentry test")` v API route → Issues v Sentry do ~30 s.

**Verbose log SDK (debug):**

- **Server / Edge:** `SENTRY_DEBUG=true` — podrobný výstup Sentry SDK v logu Node (Vercel Functions / lokální terminál).
- **Prohlížeč:** `NEXT_PUBLIC_SENTRY_DEBUG=true` — stejné v konzoli devtools (běžné `SENTRY_DEBUG` se do client bundle nepropíše).

### 3b) Langfuse + souhrnný health

- Env: `LANGFUSE_SECRET_KEY`, `LANGFUSE_PUBLIC_KEY`, volitelně `LANGFUSE_HOST` (self-hosted nebo jiný region), `LANGFUSE_ENVIRONMENT`, vypnutí `LANGFUSE_ENABLED=false`.
- OpenAI volání v `lib/openai.ts` končí `OpenAiResponsesLangfuseObservation` + `flushAsync()` — trace by měly jít do Langfuse, pokud jsou klíče nastavené.
- **Rychlá kontrola (po přihlášení poradce):** `GET /api/ai/health` vrací v těle `observability.sentry` a `observability.langfuse` (bez tajných hodnot): DSN jen boolean „nastaveno“, u Langfuse i `sdkClientActive` a `hostReachable` (HTTP ping na `…/api/public/health`).

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
| `ADOBE_OCR_LANG` | ❌ | Jazyk pro OCR. Výchozí `cs-CZ` (Aidvisora = CZ-only); přepnout na `en-US` jen pro non-CZ tenanty. S2-O1: en-US OCR mrvil české diakritiky → chybné klasifikace smluv. |
| `AI_REVIEW_SCAN_VISION_FALLBACK` | ❌ | Batch 2: když scan-PDF má příliš slabý OCR text (gate by vrátil stub), místo stubu se PDF pošle do OpenAI Responses API jako `input_file` — model sám provede per-page rendering + vision extraction. Confidence je capnutá na 0.55 → vždy `review_required`. Default `false`; zapnout po ověření v testovacích datech. |

**Extract PDF** vrací ZIP (`structuredData.json` + přílohy). Aplikace ukládá ZIP i vyextrahovaný JSON do bucketu `documents`.

**Bez Adobe credentials systém funguje normálně** – upload, viewer a AI review s fallback kvalitou. Adobe je volitelný enhancement.

### AI Review — klasifikační pipelines (V1 legacy vs V2 aktivní)

Aidvisora má **dvě klasifikační cesty**, které běží paralelně. Pro support a troubleshooting je důležité rozlišit, která cesta byla použita.

| Pipeline | Entry point | Kdo ji volá | Override funkce |
|----------|-------------|-------------|-----------------|
| **V2 (aktivní — Plán 3)** | `apps/web/src/lib/ai/ai-review-pipeline-v2.ts` | `/app/api/contract-reviews/[id]/extract`, quick-upload processor, scan upload | `applyProductFamilyTextOverride`, `applyRouterInputTextOverrides` |
| **V1 (legacy)** | `apps/web/src/lib/ai/contract-understanding-pipeline.ts` | staré volání z `/contract-intake-combined.ts`, specifické golden eval harnessy | `applyRuleBasedClassificationOverride` (RULES[]) |

**Pravidlo**: Každý nový override musí být přidaný do **obou** cest, jinak je mrtvý v produkci (nebo v V1 — podle toho, kterou cestu běžně pipeline používá). Golden eval často volá V1, produkční upload volá V2.

**V2 router-input overrides — pořadí priorit** (`applyRouterInputTextOverrides`):

1. **AML/FATCA compliance** → `compliance/consent_or_identification_document/aml_kyc_form`
   - Guard 2a: přeskočí, pokud ≥2 markery ŽP smluv (je to hlavní kontrakt s AML přílohou).
   - Guard 2b: přeskočí, pokud ≥2 markery investment service smlouvy (Komisionářská s AML přílohou — poletí dál do Priority 4).
2. **Leasing** → `leasing/contract/leasing_contract`
3. **Life insurance modelation → contract** (reclassify když modelace má ≥2 headery smlouvy)
4. **Investment service agreement** → `investment/contract/investment_service_agreement`
   - Markers: Komisionářská, mandátní, obhospodařování, zprostředkování investic.
   - Guards: přeskočí already-correct investment/contract, a všechny non-investment produkty (DIP/DPS/PP/loan/mortgage/leasing/non-life).

Testy: `apps/web/src/lib/ai/__tests__/document-classification-overrides.test.ts` (R01–R16).

### Attach-only silent-fail guard (apply contract review)

Apply flow pro supporting/attach-only dokumenty (AML/FATCA, souhlas, prohlášení) dřív tiše vracel `ok=true + "Uloženo"` toast, i když dokument zůstal bez napojení. Od P2-S1:

- `apply-contract-review.ts` nastaví `resultPayload.documentLinkWarning` s konkrétním důvodem:
  - `attach_only_missing_contact` — attach akce bez resolvnutého klienta
  - `attach_only_missing_storage_path` — chybí zdrojový soubor
  - `attach_only_link_not_persisted` — in-tx link neproběhl
  - `document_link_failed` / `document_link_exception` — pre-existing kódy (z write-through layer)
- `contract-review.ts` action tyto důvody převede na `warning: {code, message}` přes pure mapper `apply-warning-mapper.ts` → UI zobrazí error toast místo success.
- `AIReviewExtractionShell` zobrazí amber badge "⚠ Dok. link selhal".

**H3 audit log enrichment**: Audit záznam `apply_contract_review` teď v `meta` nese:
- `documentLinkWarning` (string | undefined) — pro dohledání silent-fail patternu napřímo v audit logu bez bridge přes payload dump.
- `hasAttachOnlyAction` (true | undefined) — indikátor, že apply běžel přes attach handlery (umožní filtrovat "attach-only plans" v dashboardu).

Mapper sám má 12 unit tests (`apps/web/src/lib/ai/__tests__/apply-warning-mapper.test.ts`), včetně garantie, že unknown/future kódy neprojdou tiše, ale surfujou přes generic fallback.

### `/portal/scan` quick-upload retry + diagnostics (H1–H4)

**Retry button**: Když processing status dokumentu spadne do `failed` nebo `preprocessing_failed`, `/portal/scan` zobrazí tlačítko **Zkusit zpracovat znovu**. Tlačítko POST na `/api/documents/[id]/process`, což spustí pipeline znovu (bez nového uploadu). Už uložený dokument zůstane.

**Retry diagnostics (H2)**: Retry banner teď mapuje backend signály na actionable cause+remedy. Poller `/portal/scan` pollne `GET /api/documents/[id]/process` a z odpovědi čte:
- `processingError` — raw error message z orchestrátoru
- `detectedInputMode` — `text | image_only | scan_low_text | …`
- `readabilityScore` — 0–1 estimate text-layer coverage

Helper `quickFailureDetails` převede tyto signály na:
- `scan_or_ocr_unusable | scan_quality` → "Scan má příliš nízkou kvalitu pro OCR" + "Přefoťte při lepším světle"
- `heic | unsupported` → "HEIC / nepodporovaný typ" + "Zkuste JPEG nebo PDF"
- `adobe | ocr_timeout | timeout` → "Adobe neodpověděl včas" + "Zkuste zpracování znovu"
- `too_large | size_limit` → "Soubor je větší, než pipeline akceptuje" + "Rozdělte dokument"
- `image_only | scan_low_text` + readability < 0.25 → image-only message s readability score

**Completed-but-low-readability warning (H4)**: Pokud processing proběhne (`completed`) ale `readabilityScore < 0.25`, banner zobrazí amber notice, že AI Review tohle flagne jako `scan_or_ocr_unusable` a vytěžení bude jen orientační. Advisor dostane signál ještě před otevřením review.

### Komisionářská V2 integration test (H1)

E2E integration test `komisionarska-pipeline-integration.test.ts` prokazuje, že oprava P1-K1 drží napříč celou V2 cestou:

`classifier (mis-classified) → applyRouterInputTextOverrides (Priority 4) → mapAiClassifierToClassificationResult → resolveAiReviewExtractionRoute (§3) → investmentContractExtraction`

Pokryté mis-classification scénáře:
- K01: `compliance / consent_or_identification_document / declaration`
- K02: `life_insurance / contract / forte` (IŽP look-alike s mandátní smlouvou)
- K03: `unknown / unknown / unknown` (fallback bucket)
- K04: false-positive guard (čistá ŽP smlouva NEsmí triggernout Priority 4)
- K05: idempotence (already correctly classified)
- K06: DIP guard (komisionářské slovo uvnitř DIP smlouvy NEsmí přebít DIP extraction)

Každý krok stage-gate asserts se testuje, takže regrese kdekoli v chainu rozbije test.

## Backup

- **Automatické**: Supabase provádí denní zálohy (viz Supabase Dashboard → Database → Backups)
- **Manuální**: `pg_dump` příkaz výše
- **Storage**: Supabase Storage bucket "documents" – zálohovat podle potřeby

## Support flow

1. Bugy od uživatelů: GitHub Issues nebo dedicovaný kanál
2. Kritické chyby: Sentry alerts → email/Slack
3. Eskalace: kontaktovat vývojový tým

---

## Cursor MCP: PostHog, Postman, Clerk, Langfuse (nástroje pro AI v editoru)

Tyto integrace **nejsou** nasazené závislosti webu samy o sobě – jde o **MCP servery v Cursoru**, které rozšiřují asistenta (dokumentace, přístup k účtům po přihlášení). Stav aplikace `apps/web` je níže.

### PostHog MCP (`plugin-posthog-posthog`)

- **K čemu:** produktová analytika (události, feature flags, …) na posthog.com; MCP po přihlášení umožní asistentovi pracovat s obsahem tvého PostHog workspace.
- **Ověření:** Cursor → nastavení MCP → u serveru PostHog dokonči přihlášení (nástroj `mcp_auth` otevře flow v prohlížeči). Po úspěchu by měly být k dispozici další PostHog nástroje kromě `mcp_auth`.
- **Aplikace:** v `apps/web/package.json` **není** `posthog-js` – sledování v CRM až po záměru přidat SDK a env klíče.

### Postman MCP (`plugin-postman-postman`)

- **K čemu:** kolekce a workspace na postman.com; MCP po přihlášení napojí asistenta na tvůj účet.
- **Ověření:** v **Cursor → Settings → MCP** u serveru Postman musí být přihlášení v pořádku (zelený / connected). V detailu serveru uvidíš seznam nástrojů (např. `getWorkspaces`, `getCollections`, `getCollection` – záleží na verzi pluginu). Rychlý test v **novém** chatu s agentem: *„Pomocí Postman MCP vyjmenuj moje workspace.“* Pokud agent nástroje nevidí, zkus znovu otevřít projekt nebo restart Cursoru po dokončení OAuth.
- **Aplikace:** lokální běh API a e2e testy zůstávají u `pnpm dev`, Playwright, vlastních skriptů; MCP nespouští server za tebe.

### Clerk MCP (`plugin-clerk-clerk`)

- **K čemu:** oficiální **SDK snippetů** (ne přímý dashboard). Asistent může volat např. `list_clerk_sdk_snippets` (filtr tag `auth`) a `clerk_sdk_snippet` se slugy jako `server-auth-nextjs`, `b2b-saas`, `use-auth`.
- **Ověření:** v chatu s agentem požádej o Clerk snippet pro Next.js App Router – očekávej obsah pro `@clerk/nextjs/server` a `clerkMiddleware`.
- **Aplikace:** Aidvisor používá **Supabase Auth** (`apps/web/src/lib/auth/require-auth.ts`), ne Clerk. Clerk MCP slouží k návrhu/migraci, ne k auditu současného přihlášení.

### Langfuse

- **V této workspace není** samostatný Langfuse MCP server v `mcps/`. Pro dokumentaci a CLI existuje Cursor skill **langfuse** (`npx langfuse-cli`, env `LANGFUSE_PUBLIC_KEY`, `LANGFUSE_SECRET_KEY`, `LANGFUSE_HOST`).
- **Kdy ověřovat:** až po přidání LLM tracingu do kódu – pak Langfuse UI a/nebo CLI nad trace/prompt daty.

### Shrnutí stacku webu (kontrola reality)

| Oblast | Stav v repu |
|--------|-------------|
| Přihlášení | Supabase (`@supabase/ssr`, `@supabase/supabase-js`), viz `require-auth` |
| Chyby / výkon | Sentry (`@sentry/nextjs`), Vercel Speed Insights |
| PostHog / Clerk / Langfuse v závislostech | **Nejsou** v `apps/web/package.json` |
| API testy | Vitest, Playwright (`test:e2e`) |
