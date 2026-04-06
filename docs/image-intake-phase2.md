# AI Photo / Image Intake — Phase 2: Live Route Integration

> Scope: first real, end-to-end traversable path from assistant chat to image intake pipeline.
> Phase 1 foundation stays intact. Phase 2 adds routing, classifier v1, binding v1, and first live preview.

---

## What Phase 2 Adds

| Component | Phase 1 | Phase 2 |
|---|---|---|
| Chat route integration | ✗ stub | ✅ real, feature-flagged |
| Feature flag | ✗ | ✅ `IMAGE_INTAKE_ENABLED=true` |
| Classifier | stub (uncertain) | ✅ cheap-first two-layer v1 |
| Client binding | session only (stub) | ✅ session → UI context → unresolved |
| Action planning | stub (no actions) | ✅ conservative v1 with canonical surface |
| Response mapping | ✗ | ✅ `AssistantResponse` reuse |
| Route handler | ✗ | ✅ glue + error fallback |
| Preview/confirm reuse | mapped skeleton | ✅ stores in `session.lastExecutionPlan` |

---

## Architecture

```
POST /api/ai/assistant/chat
  ↓ parse body.imageAssets
  ↓ isImageIntakeEnabled() check (IMAGE_INTAKE_ENABLED=true)
  ↓
handleImageIntakeFromChatRoute()   ← route-handler.ts
  ↓ validateAssetsBasic (cheap)
  ↓
processImageIntake()               ← orchestrator.ts
  ├── runBatchPreflight()          ← preflight.ts (deterministic)
  ├── decideLane()                 ← always image_intake
  ├── resolveClientBindingV1()     ← session lock → active → UI context → none
  ├── resolveCaseBindingV1()       ← same priority chain
  ├── classifyBatch()              ← classifier.ts (cheap-first two-layer)
  │     ├── Layer 1: deterministic (filename hints, dimensions, quality)
  │     └── Layer 2: model call (metadata text only, NOT multimodal)
  ├── buildActionPlanV1()          ← planner.ts (canonical actions only)
  └── enforceImageIntakeGuardrails() ← guardrails.ts (lane sep, binding, surface)
  ↓
mapImageIntakeToAssistantResponse()  ← response-mapper.ts
  ↓ stores ExecutionPlan in session.lastExecutionPlan
  ↓
AssistantResponse (existing format) — existing confirm/cancel flow works unchanged
```

---

## Feature Flag

```env
IMAGE_INTAKE_ENABLED=true   # enable
# Default (unset or any other value) = disabled
```

Optional model override:
```env
IMAGE_INTAKE_CLASSIFIER_MODEL=gpt-5-mini   # override classifier model
```

**Behavior by state:**

| State | Behavior |
|---|---|
| `IMAGE_INTAKE_ENABLED=true` | image assets route to intake lane |
| `IMAGE_INTAKE_ENABLED=false` (or unset) | imageAssets ignored, text flow unchanged |
| Misconfigured (any non-"true" string) | treated as disabled (safe default) |

---

## Route Integration

The assistant chat route (`POST /api/ai/assistant/chat`) now accepts `imageAssets` in request body:

```json
{
  "imageAssets": [
    {
      "url": "https://storage.example.com/img.jpg",
      "mimeType": "image/jpeg",
      "filename": "WhatsApp Image 2025-01-01.jpg",
      "sizeBytes": 500000,
      "width": 1080,
      "height": 1920,
      "contentHash": "abc123"
    }
  ],
  "message": "Tohle přišlo od klienta",    // optional accompanying text
  "sessionId": "...",
  "activeContext": { "clientId": "..." }
}
```

**Routing decision:**
- If `imageAssets.length > 0` AND `IMAGE_INTAKE_ENABLED=true` AND NOT confirmExecution/cancelExecution → image intake lane
- Otherwise → existing text flow (canonical or legacy), completely unchanged

**Text-only requests:** Zero overhead. `parseImageAssetsFromBody` returns empty array in O(1) when `imageAssets` is absent. No cost increase for existing usage.

---

## Classifier v1 — Cheap-First

Two-layer classification. Model is only called when deterministic layer is uncertain.

### Layer 1: Deterministic (free)

| Signal | Classification | Skip Model? |
|---|---|---|
| Filename: "WhatsApp", "viber", "SMS", etc. | `screenshot_client_communication` | ✅ yes |
| Filename: "platba", "faktura", "qr", etc. | `screenshot_payment_details` | ✅ yes |
| Filename: "banka", "ucet", "transakce", etc. | `screenshot_bank_or_finance_info` | ✅ yes |
| Filename: "smlouva", "scan", "dokument", etc. | `photo_or_scan_document` | ✅ yes |
| Both filename + text agree | any | ✅ yes (boosted confidence) |
| Conflicting signals | `mixed_or_uncertain_image` | ❌ model confirms |
| Text hint only | detected type | ❌ model confirms |
| Tiny image (< 200×200 px) | `general_unusable_image` | ✅ **early exit** (no further processing) |
| No signal | null | ❌ model call |

### Layer 2: Light model call (cheap)

- Uses `createResponseStructured` with `routing: { category: "copilot" }` 
- Input: text description of metadata (filename, MIME, dimensions, accompanying text) — NOT the image itself
- Structured JSON output via schema (`gpt-5-mini`)
- Conservative: uncertain cases → `mixed_or_uncertain_image`
- Fallback on model failure → `mixed_or_uncertain_image`, confidence 0.0

> **Phase 3** will add multimodal image input (actual image pixels sent to model).

---

## Client / Case Binding v1

Priority chain (highest → lowest):

1. `session.lockedClientId` → `bound_client_confident` (confidence 0.95)
2. `session.activeClientId` → `bound_client_confident` (confidence 0.80)  
3. `activeContext.clientId` from request → `bound_client_confident` (confidence 0.70)
4. None → `insufficient_binding`

**Safety rule:** No write-ready plan is created without `bound_client_confident` or `bound_case_confident`. Any other state → `ambiguous_needs_input`, no actions.

> **Phase 3** will add lightweight CRM lookup for name-based identification when no session context exists.

---

## Action Planning v1

Conservative action set, only via canonical write actions:

| Output mode | Allowed actions |
|---|---|
| `client_message_update` | `createInternalNote`, `createTask`, `attachDocumentToClient` |
| `structured_image_fact_intake` | `createInternalNote`, `attachDocumentToClient` |
| `supporting_reference_image` | `attachDocumentToClient`, `createInternalNote` |
| `ambiguous_needs_input` | no actions |
| `no_action_archive_only` | no actions |

**All actions require confirmation.** No auto-write, no auto-send. Plans are stored in `session.lastExecutionPlan` → standard confirm/cancel flow handles execution.

---

## Preview / Confirm Flow Reuse

When actions are proposed:
1. `ExecutionPlan` is stored in `session.lastExecutionPlan`
2. Response returns `executionState.status = "awaiting_confirmation"` with `stepPreviews`
3. User confirms → existing `handleAssistantAwaitingConfirmation` executes → existing write adapters run
4. Canonical write surface is the ONLY write path (no parallel system)

---

## Live Outcomes in Phase 2

| Outcome | Trigger | Actions proposed? |
|---|---|---|
| `no_action_archive_only` | unusable image, tiny/corrupt, unsupported MIME | No |
| `ambiguous_needs_input` | no client binding / low confidence / mixed input | No |
| `supporting_reference_image` | reference/podklad type | Optional attach/note |
| `client_message_update` | communication screenshot + confident binding | note + task |
| `structured_image_fact_intake` | doc/payment/bank + confident binding | note + attach |

---

## Guardrails (unchanged from Phase 1, still enforced)

1. **Lane separation:** client communication screenshots never go to AI Review
2. **Binding safety:** no write-ready plan without confident client binding
3. **No over-structuring:** supporting/reference images never forced into structured contract fields
4. **Action surface restriction:** only `IMAGE_INTAKE_ALLOWED_INTENTS` and `IMAGE_INTAKE_ALLOWED_WRITE_ACTIONS`
5. **Preview required:** all write actions require confirmation — no auto-execution

---

## Runtime Cost Guardrails

| Rule | Implementation |
|---|---|
| Deterministic-first | filename hints skip model entirely |
| Early exit for dead ends | tiny/unusable images exit before planning, classifier, or session writes |
| No model for unsupported MIME | preflight rejects before classifier |
| No duplicate model calls | classifier called once per request, result reused for planning/preview |
| No image re-analysis during planning | planner reuses classifier output, does not call model again |
| Text path unaffected | `parseImageAssetsFromBody` is O(1) when no imageAssets key present |

---

## Observability

Route handler logs these structured audit actions (no sensitive image content):

| Action | When |
|---|---|
| `image_intake.route_rejected` | invalid/unsupported assets, flag off |
| `image_intake.pipeline_error` | unhandled exception in pipeline |
| `image_intake.pipeline_done` | successful pipeline run |

Each log includes: `intakeId`, `outputMode`, `inputType`, `clientBindingState`, `guardrailsTriggered` (count), `classifierUsedModel`, `writeReady`, `flagState`.

Full `ImageIntakeTrace` is available in the pipeline result for debugging.

---

## What is Intentionally Deferred to Phase 3+

| Feature | Phase |
|---|---|
| Multimodal image input to classifier (actual pixels) | Phase 3 |
| CRM name-based client lookup | Phase 3 |
| Fact extraction from image content | Phase 3 |
| Reply drafting | Phase 4 |
| Multi-image stitching | Phase 5 |
| Full golden dataset eval harness | Phase 6 |

**Stub boundary:** `factBundle` in orchestrator remains empty. `ExtractedFactBundle` types are defined and ready for Phase 3 to populate.

---

## Phase 2 Test Coverage

- `image-intake-classifier.test.ts` — deterministic layer, model layer, batch classification, fallback behavior
- `image-intake-phase2.test.ts` — feature flag, parsing, binding v1, planning v1, full pipeline, response mapping
- `image-intake-route-integration.test.ts` — chat route integration (flag on/off, text regression, confirm/cancel priority)
- All Phase 1 tests (93 total) continue passing

---

## New / Modified Files

**New:**
- `apps/web/src/lib/ai/image-intake/feature-flag.ts`
- `apps/web/src/lib/ai/image-intake/classifier.ts`
- `apps/web/src/lib/ai/image-intake/planner.ts`
- `apps/web/src/lib/ai/image-intake/response-mapper.ts`
- `apps/web/src/lib/ai/image-intake/route-handler.ts`
- `apps/web/src/lib/ai/__tests__/image-intake-classifier.test.ts`
- `apps/web/src/lib/ai/__tests__/image-intake-phase2.test.ts`
- `apps/web/src/lib/ai/__tests__/image-intake-route-integration.test.ts`
- `docs/image-intake-phase2.md`

**Modified:**
- `apps/web/src/lib/ai/image-intake/orchestrator.ts` — real classifier + binding v1 + async
- `apps/web/src/lib/ai/image-intake/index.ts` — export new modules
- `apps/web/src/app/api/ai/assistant/chat/route.ts` — minimal image routing addition
- `apps/web/src/lib/ai/__tests__/image-intake-types.test.ts` — add audit/openai mocks
- `apps/web/src/lib/ai/__tests__/image-intake-preflight.test.ts` — add audit/openai mocks
- `apps/web/src/lib/ai/__tests__/image-intake-guardrails.test.ts` — add audit/openai mocks
- `apps/web/src/lib/ai/__tests__/image-intake-orchestrator.test.ts` — update to async + real classifier
