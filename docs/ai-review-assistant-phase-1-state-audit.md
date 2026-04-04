# Fáze 1 — state audit AI Review + AI asistent (reality)

**Repo root:** `/Users/marekmarek/Developer/Aidvisora`  
**Datum auditu:** 2026-04-04  
**Zdroj pravdy:** lokální kód (ne veřejný GitHub).  
**Legenda:** Already exists | Already works | Broken | Missing | By design / neměnit | Do not rebuild

## Source of truth korpus (Fáze 1+)

Pro AI Review a AI asistenta v **dalších fázích** platí rozšířený reálný korpus: **`corpusDocuments` C001–C027** v [`fixtures/golden-ai-review/scenarios.manifest.json`](../fixtures/golden-ai-review/scenarios.manifest.json) (verze 2) + agregační scénáře **G01–G12**. Lidský přehled a tabulka: [ai-review-assistant-phase-1-corpus-inventory.md](./ai-review-assistant-phase-1-corpus-inventory.md). Minimální výstupy podle typu dokumentu: [ai-review-assistant-phase-1-corpus-buckets.md](./ai-review-assistant-phase-1-corpus-buckets.md). Nejedná se o „malý vzorek 9 PDF“ — ten byl nahrazen / rozšířen tímto inventářem.

---

## A) AI REVIEW

| Oblast | Stav | Kde v kódu / DB | Poznámka |
|--------|------|-----------------|----------|
| Upload flow | **Already exists**, **Already works** (s předpokladem env/storage) | `POST /api/contracts/upload` → `apps/web/src/app/api/contracts/upload/route.ts` — vytvoří řádek v `contract_upload_reviews`, upload do storage; klient pak volá `POST /api/contracts/review/[id]/process` | Starší docs někde uvádějí `/api/ai-review/upload` — v aktuálním stromu API není; kanon je contracts upload + process. |
| Preprocessing (OCR / markdown) | **Already exists** | `apps/web/src/lib/contracts/run-contract-review-processing.ts` → `preprocessForAiExtraction`, scan gate `contract-review-scan-gate.ts` | Při selhání Adobe se pokračuje file-only LLM. |
| Klasifikace + extrakce (hlavní větev) | **Already exists** | `runContractUnderstandingPipeline` v `apps/web/src/lib/ai/contract-understanding-pipeline.ts`; default **`AI_REVIEW_USE_V2_PIPELINE !== "false"`** → `runAiReviewV2Pipeline` v `ai-review-pipeline-v2.ts` (klasifikátor `ai-review-classifier.ts`, router `ai-review-extraction-router.ts`, prompty `prompt-model-registry.ts` + `document-schema-registry.ts`) | Legacy větev v souboru zůstává jako fallback historie — **Do not rebuild** paralelně. |
| Držení extrahovaného payloadu | **Already exists** | DB `contract_upload_reviews.extracted_payload`, `field_confidence_map`, `validation_warnings`, `extraction_trace`, `detected_document_type`, lifecycle sloupce — schema `packages/db/src/schema/contract-upload-reviews.ts` | Envelope typu `DocumentReviewEnvelope` — `document-review-types.ts`. |
| Review corrections (člověk) | **Already exists** | `approveContractReview` s `fieldEdits` + `mergeFieldEditsIntoExtractedPayload` (`ai-review/mappers.ts`) → `saveContractCorrection` → tabulka `contract_review_corrections` (`packages/db/src/schema/contract-review-corrections.ts`) | Sloupce `corrected_payload` / overrides také na hlavní review řádce. |
| Approve / reject | **Already exists**, **Already works** (logika) | `apps/web/src/app/actions/contract-review.ts` — `approveContractReview`, `rejectContractReview` | Stav `review_status` + permission `documents:write`. |
| Apply / publish do CRM | **Already exists**, **Partially broken** (reálné dokumenty) | `applyContractReviewDrafts` → `applyContractReview` (`apply-contract-review.ts`) — contracts, tasks, payment setups, portfolio attrs; quality gates `quality-gates.ts` | **Broken** v praxi = špatná extrakce / typ dokumentu / platby → gate nebo špatná data; ne jako „apply kód neexistuje“. |
| Link dokumentu / portál | **Already exists** | Po apply: `linkContractReviewFileToContactDocuments` v `contract-review.ts` (`visibleToClient`, `notifyClientAdvisorSharedDocument`); publish guard při linku | Rozhodnutí viditelnosti závisí na volání a stavu review. |
| Evidence / confidence / source mapping | **Already exists**, **Already works** (schema) | `extractedFieldSchema` — `confidence`, `sourcePage`, `evidenceSnippet`, `status` v `document-review-types.ts`; UI vrstva `review-ui-confidence.ts`, mapování `ai-review/mappers.ts` | **Broken** často u reálných PDF — model/UI ne vždy vyplní evidence konzistentně. |

---

## B) AI ASSISTANT

| Oblast | Stav | Kde v kódu | Poznámka |
|--------|------|------------|----------|
| Chat route | **Already exists** | `POST` `apps/web/src/app/api/ai/assistant/chat/route.ts` | SSE optional `?stream=1`, rate limit, Sentry. |
| Request body | **Already exists** | `message`, `sessionId`, `activeContext`, `confirmExecution`, `cancelExecution`, `selectedStepIds`, `orchestration` / `useCanonicalOrchestration`, `bootstrapPostUploadReviewPlan`, `channel` | Kanonický confirm vyžaduje `orchestration: canonical`. |
| Session / historie | **Already exists** | In-memory `assistant-session.ts` (TTL 30 min, lock fields); DB `assistant-conversation-repository.ts` (hydration, append) | Digest `conversationDigest` pro kontinuitu — **Already works** pro základní scénáře. |
| Client lock / conversation lock | **Already exists** | `lockAssistantClient`, `clearAssistantClientLock`, `lockedClientId`, `pendingClientDisambiguation` v `assistant-session.ts` | **Partially broken** = edge cases více klientů ve vlákně (měřit ve Fázi 2+). |
| Execution preview | **Already exists** | `AssistantResponse.executionState.stepPreviews` z `assistant-execution-plan.ts` / `assistant-execution-ui.ts` | |
| Selectable actions | **Already exists** | `selectedStepIds` v route; `applyConfirmationSelection` v execution plan | |
| Confirm / execute | **Already exists** | `handleAssistantAwaitingConfirmation`, `executePlan` (`assistant-execution-engine.ts`) | Guard `_confirmationInProgress` na session. |
| Upload dokumentu / review context | **Already exists** | `buildReviewDetailContext` v `assistant-context-builder.ts`; `bootstrapPostUploadReviewPlan` v chat route; E2E `assistant-p3-upload-review-context.spec.ts` | |
| Filtrace debug výstupů | **Already exists**, **Already works** (intencionálně) | `assistant-message-sanitizer.ts` — strip `[TOOL:`, `[RESULT:`, UUID řádky, JSON bloky; testy `assistant-message-sanitizer.test.ts` | **Broken** = nové leaky formáty z modelu — doplnit podle golden scénářů ve Fázi 2+. |

---

## C) CRM NAPOJENÍ (souvislost s review + asistentem)

| Oblast | Stav | Kde | Poznámka |
|--------|------|-----|----------|
| Contracts | **Already exists** | `apply-contract-review.ts` — insert/update `contracts`, `portfolioAttributes` z extrakce | |
| Coverage / contact_coverage | **Missing** jako přímý AI Review apply krok | Portfolio jde přes `buildPortfolioAttributesFromExtracted` / merge — není samostatná `contact_coverage` tabulka v tomto souboru | Ověřit produktové mapování v další fázi — není „rebuild“, ale **gap**. |
| Opportunities / board | **Already exists** (asistent) | `assistant-crm-writes.ts`, entity resolution | |
| Tasks | **Already exists** | `create_task` v apply draft actions | |
| Meetings / notes | **Already exists** (asistent tools) | `assistant-tools` / execution engine | Není centrálně v tomto auditu rozpitváno. |
| Documents (trezor) | **Already exists** | `documents` tabulka + `linkContractReviewFileToContactDocuments` | |
| Client portal / notifikace | **Already exists** | `notifyClientAdvisorSharedDocument`, `portal-sentry` publish guards | |
| Rating / catalog / top-lists | **Already exists** (asistent) | `ratings/toplists.ts` v `assistant-tool-router.ts` | Vedlejší kanál — **By design**. |

---

## D) TEST / RELEASE / DOCS

| Oblast | Stav | Kde | Poznámka |
|--------|------|-----|----------|
| Regression (assistant) | **Already exists** | `package.json` skripty `test:assistant-regression`, `test:f2-wave-b-release-gate`, řada `assistant-*.test.ts` | |
| Regression (review) | **Already exists** | `ai-review-pipeline-v2.test.ts`, `coerce-partial-review-envelope.test.ts`, `phase-2-review-regression.test.ts`, atd. | |
| E2E | **Already exists** | Playwright `apps/web/tests/e2e/` vč. assistant + review kontext | |
| Docs | **Already exists** | `docs/ai-review-publish-flow.md`, `docs/ai-review-phase-0-1-audit-and-ux.md`, `docs/ai-review-corpus-acceptance.md`, … | Publish flow má zastaralou cestu uploadu — opravit reference ve Fázi 2 nebo samostatný doc PR; **tento audit je nová pravda pro upload cesty.** |
| Admin / ai-quality | **Partially exists** | Telemetry `assistant-telemetry.ts`, Sentry bridges | |

---

## Shrnutí „Do not rebuild“

- Jeden kanonický **AI Review** řetězec: upload → process → DB řádek → UI `/portal/contracts/review/[id]` → actions `contract-review.ts`.
- Jeden **DocumentReviewEnvelope** + v2 pipeline jako default — nepřidávat druhý paralelní produkční pipeline bez měření.
- Jeden **assistant** chat endpoint + canonical execution plan — nepřepisovat orchestrátor ve Fázi 1.

---

## SQL migrace (Fáze 1 — tento audit + dokumentace)

Žádné nové SQL migrace z této fáze nevznikly. Existující tabulky `contract_upload_reviews` a `contract_review_corrections` zůstávají zdrojem pravdy pro payload a korekce.

```sql
-- Žádný nový skript pro Fázi 1. Použij existující migrace v packages/db/migrations/ a drizzle/
-- pro contract_upload_reviews / contract_review_corrections.
```
