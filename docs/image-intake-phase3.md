# Image Intake — Phase 3 Documentation

## Overview

Phase 3 transforms the image intake lane into a first truly intelligent intake capability. It builds directly on the Phase 2 foundation (route integration, feature flag, classifier v1, client binding v1, action planning v1) and adds:

- **Multimodal classifier v2** — real vision-based classification (escalation only)
- **Fact extraction v1** — structured facts from image content (no stub)
- **CRM-aware binding v2** — name-based client lookup beyond session context
- **Draft reply preview v1** — conservative reply suggestion for communication screenshots
- **Richer preview** — extracted facts + missing fields surfaced in assistant response

All Phase 2 constraints remain: cheap-first, canonical action surface only, preview/confirm reuse, no auto-execute, AI Review lane separation.

---

## A) Multimodal Classifier v2

**File:** `src/lib/ai/image-intake/multimodal.ts`

### When it runs (cost rule)
The multimodal pass is the **escalation layer**, not the default. It runs ONLY when:

| Input type | Runs multimodal? |
|---|---|
| `screenshot_client_communication` | ✅ YES — extraction always valuable |
| `screenshot_payment_details` | ✅ YES — extraction always valuable |
| `screenshot_bank_or_finance_info` | ✅ YES — extraction always valuable |
| `photo_or_scan_document` | ✅ YES — document summary valuable |
| `supporting_reference_image` | ❌ NO — template facts only |
| `general_unusable_image` | ❌ NO — early exit (dead end) |
| `mixed_or_uncertain_image` (confidence < 0.5) | ✅ YES — clarify classification |
| `mixed_or_uncertain_image` (confidence ≥ 0.5) | ❌ NO — already decided as uncertain |
| earlyExit=true (preflight dead end) | ❌ NO — skipped entirely |
| storageUrl=null (no image URL) | ❌ NO — cannot send to model |
| `IMAGE_INTAKE_MULTIMODAL_ENABLED=false` | ❌ NO — flag gates all vision calls |

### What one call delivers
A **single structured vision call** (`createResponseStructuredWithImage`) returns:
- `inputType` — upgraded classification from actual image content
- `confidence` — from model based on visual evidence
- `rationale` — short explanation
- `actionabilityLevel` — none / low / medium / high
- `possibleClientNameSignal` — person name visible in image (for CRM binding)
- `facts[]` — extracted key-value facts per input type
- `missingFields[]` — obviously missing data points
- `ambiguityReasons[]` — why classification is uncertain
- `draftReplyIntent` — short reply intent for communication screenshots

### Cost guardrails
- Maximum 1 multimodal call per asset per request (result reused across planner, preview, binding)
- Text classifier v1 still runs first; multimodal skipped for high-confidence dead ends
- `IMAGE_INTAKE_MULTIMODAL_ENABLED` flag separates rollout of multimodal from base feature

---

## B) CRM-aware Client/Case Binding v2

**File:** `src/lib/ai/image-intake/binding-v2.ts`

### Priority chain
1. **`session.lockedClientId`** → `bound_client_confident`, confidence 0.95
2. **`session.activeClientId`** → `bound_client_confident`, confidence 0.80
3. **`request.activeClientId`** (UI context) → `bound_client_confident`, confidence 0.70
4. **CRM name lookup** (from `possibleClientNameSignal`) → `weak_candidate` or `multiple_candidates`
5. **Unresolved** → `insufficient_binding`

### CRM lookup behavior
- Uses `searchContactsForAssistant()` (existing utility, name-only ILIKE)
- Only triggered when: no session context AND name signal from multimodal pass
- Single match → `weak_candidate` (confidence 0.45) — NOT write-ready without confirmation
- Multiple matches → `multiple_candidates` — advisor must choose
- No matches → falls through to `insufficient_binding`

### Safety rules
- `weak_candidate` and `multiple_candidates` → `ambiguous_needs_input` output mode
- No auto-pick when conflict
- No write-ready flow without `bound_client_confident` or `bound_case_confident`
- All binding warnings surfaced in preview

---

## C) Fact Extraction v1

**File:** `src/lib/ai/image-intake/extractor.ts`

Converts `MultimodalCombinedPassResult` → `ExtractedFactBundle`. **No additional model calls** — pure transformation from the multimodal pass output.

### Extracted facts by input type

**Communication screenshot** (`screenshot_client_communication`):
- `what_client_said` — what the client wrote
- `what_client_wants` — client request or need
- `what_changed` — new information or status change
- `required_follow_up` — action needed as response
- `urgency_signal` — high / medium / low
- `possible_date_mention` — mentioned date/time

**Payment screenshot** (`screenshot_payment_details`):
- `amount` — payment amount with currency
- `account_number` — IBAN or CZ account number
- `variable_symbol` — variable symbol
- `due_date` — payment due date
- `recipient` — payment recipient
- `is_complete` — yes / no / partial

**Bank/finance screenshot** (`screenshot_bank_or_finance_info`):
- `balance_or_amount` — balance or transaction amount
- `transaction_description` — transaction description
- `product_or_account_type` — product/account type
- `date_range` — statement date range
- `is_supporting_only` — yes / no

**Document scan** (`photo_or_scan_document`):
- `document_type` — contract, form, letter, etc.
- `document_summary` — short content summary
- `key_fact_1..3` — key visible facts
- `looks_like_contract` — yes / no

**Supporting/reference** — template fact bundle only (no model call):
- Single `reference_only` fact with relevance note

### Evidence model
Each `ExtractedImageFact` carries:
- `factKey` — raw model key (e.g., `what_client_said`)
- `observedVsInferred` — `"observed"` (directly readable) vs `"inferred"` (derived)
- `evidence.sourceAssetId` — which image asset
- `evidence.evidenceText` — raw value as evidence
- `confidence` — per-fact confidence from model
- `needsConfirmation` — true when confidence < 0.8 or inferred

---

## D) Evidence Model / Traceability

Phase 3 extends the `ExtractedFactBundle` with:
- `extractionSource: "multimodal_pass" | "stub"` — whether facts came from real extraction
- `observedVsInferred` per fact — direct observation vs inference
- `missingFields[]` — data points obviously absent from image
- `ambiguityReasons[]` — why extraction is uncertain

The `ImageIntakeTrace` already captures `factCount`, `extractionSource` (via action params), and `multimodalUsed` in the orchestrator result.

---

## E) Preview Enrichment

**File:** `src/lib/ai/image-intake/response-mapper.ts`

Phase 3 preview messages now include:

For **communication screenshots**:
- Extracted fact summary (up to 3 lines)
- Notice when draft reply is prepared (preview-only)

For **structured fact intake** (payment, bank, document):
- Extracted fact summary (up to 4 lines)
- Missing fields listed in message
- Missing fields also surfaced as `warnings[]`

For **weak_candidate binding**:
- `suggestedNextSteps` prompts advisor to confirm the tentative client match

---

## F) Action Planning v2

**File:** `src/lib/ai/image-intake/planner.ts` — `buildActionPlanV2()`

Extends v1 with:
- **Fact-enriched action params** — `createInternalNote` and `createTask` actions include `_extractedFactsSummary`, `_factCount`, `_extractionSource` in their params
- **Auto-add task for urgent follow-up** — if `required_follow_up` fact is present and no task action exists yet, a task action is added automatically
- **Draft reply attached** — `draftReplyText` passed through to plan
- **Enhanced `whyThisAction`** — includes fact count when multimodal extraction ran

New binding state `weak_candidate` → `ambiguous_needs_input` output mode (same as `multiple_candidates` and `insufficient_binding`).

---

## G) Draft Reply Preview v1

**File:** `src/lib/ai/image-intake/draft-reply.ts`

**Preview-only.** Never auto-sends. Never auto-executes.

### Eligibility (all must hold):
1. Input type is `screenshot_client_communication`
2. Binding is `bound_client_confident` or `bound_case_confident`
3. Clear intent present (`draftReplyIntent` from multimodal OR `required_follow_up` / `what_client_wants` facts)

If any condition fails → `null` (no draft reply).

### Draft reply format:
```
Dobrý den, vážený/á [clientLabel],

Přijal/a jsem Vaši zprávu ohledně: [what_client_wants or draftReplyIntent]

Budu se tím zabývat a dám Vám vědět: [required_follow_up]

S pozdravem
[Váš poradce]
```

The draft is attached to `actionPlan.draftReplyText` and noted in the assistant response message.

---

## H) Cost Guardrails (Phase 3)

| Rule | Implementation |
|---|---|
| Dead ends exit before any model call | Preflight → early exit in orchestrator |
| Supporting/reference skips multimodal | `shouldRunMultimodalPass` returns false |
| Multimodal max once per asset | Result stored in `multimodalResult`, reused for binding, planner, preview |
| Classifier output reused | Classification from v1 upgraded by multimodal result in place |
| Text-only flow unaffected | Image code path only entered when `isImageRequest=true` in chat route |
| Unusable images: 0 model calls | Deterministic early exit before classifier or multimodal |
| `IMAGE_INTAKE_MULTIMODAL_ENABLED` separate from base flag | Enables image intake without paying for vision calls in early rollout |

---

## I) Feature Flags

| Flag | Default | Description |
|---|---|---|
| `IMAGE_INTAKE_ENABLED=true` | false | Enables image intake lane (Phase 2+) |
| `IMAGE_INTAKE_MULTIMODAL_ENABLED=true` | false | Enables multimodal vision pass (Phase 3) |
| `IMAGE_INTAKE_CLASSIFIER_MODEL` | (default model) | Model for text classifier v1 |
| `IMAGE_INTAKE_MULTIMODAL_MODEL` | (default model) | Model for combined vision pass |

---

## J) Tests

| Test file | Coverage |
|---|---|
| `image-intake-multimodal.test.ts` | `shouldRunMultimodalPass` decision, combined pass calls model, fallback on error, normalization |
| `image-intake-phase3.test.ts` | Fact extraction, CRM binding v2, draft reply eligibility, action planning v2, cost guardrails |
| `image-intake-phase2.test.ts` | Updated: `resolveClientBindingV2` session priority tests |
| `image-intake-orchestrator.test.ts` | Full pipeline with Phase 3 wiring |
| `image-intake-route-integration.test.ts` | Chat route integration (flag on/off), text-only regression |
| `image-intake-classifier.test.ts` | Classifier v1 (unchanged from Phase 2) |
| `image-intake-preflight.test.ts` | Preflight (unchanged from Phase 1) |
| `image-intake-guardrails.test.ts` | Guardrails (unchanged from Phase 1) |
| `image-intake-types.test.ts` | Type contracts (Phase 3 types added) |

---

## K) Deferred to Phase 4

- Multi-image session stitching (correlate multiple screenshots from same conversation thread)
- CRM case/opportunity lookup by name or reference (case binding v2)
- Full OCR pipeline for scan documents (currently document scan uses lightweight extraction only)
- AI Review handoff for documents that look like contracts
- Confidence threshold tuning from live production data
- Per-user rollout percentage (currently env-level only)
- Eval golden dataset expansion for multimodal pass
- Auto-update case context from extracted facts (currently note-only)
