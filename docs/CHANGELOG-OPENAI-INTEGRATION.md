# Changelog: Produkční integrace OpenAI (apps/web)

## Změněné / nové soubory

- **apps/web/src/lib/openai.ts** – Lazy singleton klient, `createResponse` / `createResponseSafe`, fallback na gpt-4o-mini, `logOpenAICall`, typy `CreateResponseResult`.
- **apps/web/src/app/api/ai/health/route.ts** – Endpoint vrací `ok`, `provider`, `apiKeyPresent`, `model`, `fallbackModel`, `latencyMs`, `error`; detekce fallbacku, logování.
- **apps/web/src/app/portal/setup/SetupView.tsx** – Integrace OpenAI: načtení `/api/ai/health`, stav Připojeno/Odpojeno, model, varování při fallbacku, tlačítko „Otestovat připojení“. Karta OpenAI bez konfiguračních polí (klíč pouze v env).
- **apps/web/src/app/actions/ai-extract.ts** – Pouze `createResponse` z `@/lib/openai`; validace výstupu přes `validateContactExtraction()` z extraction-schemas, při selhání řízená chyba.
- **apps/web/src/lib/ai/extraction-schemas.ts** – Zod schémata pro kontakt a placeholder pro smlouvu, `validateContactExtraction()` s řízenou chybou při nevalidním výstupu.
- **apps/web/src/lib/ai/upload-pipeline.ts** – Rozhraní a stub pro upload smluv (metadata, storage, TODO na plný flow a PDF jako input_file).
- **apps/web/src/lib/ai/review-queue.ts** – Typy pro frontu revizí: `ConfidenceScore`, `NeedsHumanReview`, `ExtractedClientMatchCandidate`, `DraftActionBase`, `ReviewQueueItem`.
- **apps/web/.env.example** (dříve `.env.local.example`) – šablona včetně `OPENAI_API_KEY=` a modelů.
- **package.json (apps/web)** – Přidána závislost `zod`.

## Hotovo

- OpenAI klient: lazy init, pouze server-side, API klíč nikdy v kódu ani v klientu.
- Model: `process.env.OPENAI_MODEL ?? "gpt-5-mini"`, fallback `gpt-4o-mini` při chybě modelu.
- Health endpoint: `GET /api/ai/health` s požadovaným JSON tvarem a logováním.
- SetupView: živý stav AI (Connected/Not connected), model, fallback warning, tlačítko testu.
- ai-extract: pouze helper z `@/lib/openai`, zachovaná business logika, příprava na structured outputs.
- Structured extraction: Zod schémata a `validateContactExtraction()` s řízenou chybou.
- Upload pipeline: rozhraní a stub (metadata, storage service, TODO).
- Review queue: návrhové typy a datové struktury.
- Logging: model, latence, success/failure, endpoint; bez API klíče a bez celých dokumentů.
- Env: příklad v `apps/web/.env.example` → lokálně `.env.local`.

## Připraveno pro další fázi

- **Upload smluv:** Implementace `uploadContractFile`, storage service, DB tabulka pro metadata, volání Responses API s `input_file` pro PDF.
- **Structured outputs pro contracts:** Rozšíření `extractedContractSchema` a validace výstupu modelu pro smlouvy.
- **Review queue:** UI a API pro položky s `needsHumanReview`, přiřazení kandidátů a draft akcí.
