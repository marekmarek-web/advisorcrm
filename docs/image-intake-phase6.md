# AI Photo / Image Intake — Phase 6

**Status:** Production (Phase 6)
**Scope:** Combined multimodal execution, signal-aware binding hints, cross-session reconstruction, AI Review handoff submit, percentage/canary rollout, long-thread intent change detection

---

## What was implemented in Phase 6

### A) Combined multimodal pass execution v1

**File:** `combined-multimodal-execution.ts`

When `BatchMultimodalDecision.strategy === "combined_pass"`, the system now actually executes a single vision call for the group instead of separate per-asset calls. 

Execution path:
- `strategy === "combined_pass"` → `executeBatchMultimodalStrategy()` → one `runCombinedMultimodalPass()` call → merged `ExtractedFactBundle`
- `strategy === "per_asset"` → returns `per_asset_fallback` result (caller handles per-asset)
- `strategy === "skip_all"` → returns immediately with zero calls

Safety:
- Degrades to `per_asset_fallback` if < 2 assets have storage URLs
- Degrades on any exception from `runCombinedMultimodalPass`
- Hard cap: max 1 vision call per combined pass (never multiplied)
- Combined pass result merges into `factBundle` only on success

Cost impact: Replaces N per-asset calls with 1 combined call for eligible grouped threads.

---

### B) Signal-aware binding hints integration v1

**File:** `binding-v2.ts` — new `resolveCaseBindingWithSignals()`

Takes `CaseSignalBundle` from Phase 5 case signal extraction and uses it to help discriminate when `multiple_case_candidates` exist after CRM lookup.

Rules:
- Active context (`bound_case_from_active_context`) always wins — signals don't override
- `bound_case_from_strong_lookup` is never overridden by signals
- Only applies when `state === "multiple_case_candidates"`
- Signal scoring: label title match + signal strength boost
- Confidence cap: 0.55 maximum (never produces "confident" binding from signals alone)
- Output state when signals help: `weak_case_candidate` with explicit warning
- When signals don't discriminate well enough (advantage < threshold): `multiple_case_candidates` returned with explanatory warning

Zero extra model calls — operates on existing `CaseSignalBundle`.

---

### C) Multi-day / cross-session thread reconstruction v1

**File:** `cross-session-reconstruction.ts`

In-process artifact store (Map) with bounded TTL (72h) and count (20 per client).

Workflow:
1. After successful processing: `persistThreadArtifact()` saves merged facts + latest signal
2. On new intake: `reconstructCrossSessionThread()` checks for prior artifacts for same client
3. Confidence scoring: recency (< 1 day = 0.85, < 3 days = 0.65, older = 0.40) + fact overlap boost/penalty
4. If confidence < 0.35: no merge, returns `hasPriorContext=true` + gaps explanation
5. If confidence ≥ 0.35: merges prior facts as non-latest historical context, computes delta

Output: `CrossSessionReconstructionResult` with `hasPriorContext`, `priorMergedFacts`, `currentMergedFacts`, `priorVsLatestDelta`, `crossSessionConfidence`, `unresolvedGaps`.

Limits:
- In-process only (no DB writes)
- 72h TTL, max 20 artifacts per client
- No aggressive merge without confidence ≥ 0.35
- No cross-tenant or cross-user access

---

### D) AI Review handoff submit flow

**File:** `handoff-submit.ts`

After advisor explicitly confirms the handoff action (`submit_ai_review_handoff` or `initiate_ai_review`), `submitHandoffAfterConfirm()` writes an audit record and returns a `HandoffSubmitResult`.

States:
- `submitted` — advisor confirmed, audit written, handoffId returned
- `skipped_no_confirm` — wrong or missing confirm action
- `skipped_flag_disabled` — flag not enabled for user
- `skipped_no_payload` — no handoff payload prepared
- `failed` — audit write threw

`buildHandoffSubmitAction()` returns a preview/confirm-compatible action with `requiresConfirmation: true` and `_handoffConfirmAction: "submit_ai_review_handoff"` in params.

Lane safety:
- Image intake does NOT run AI Review pipeline
- Submit = audit record + `HandoffSubmitResult` only
- Route handler / action executor is responsible for initiating actual AI Review

---

### E) Percentage / canary rollout v1

**File:** `feature-flag.ts`

Hash-based deterministic bucket assignment (`djb2`-style, no DB, no crypto):

```
userBucket(userId, salt) → [0, 99]
```

New flags:
- `IMAGE_INTAKE_COMBINED_MULTIMODAL_PERCENTAGE=0..100` → `isImageIntakeCombinedMultimodalEnabledForUser()`
- `IMAGE_INTAKE_CROSS_SESSION_ENABLED=true` + `IMAGE_INTAKE_CROSS_SESSION_PERCENTAGE=0..100` → `isImageIntakeCrossSessionEnabledForUser()`
- `IMAGE_INTAKE_HANDOFF_SUBMIT_ENABLED=true` + `IMAGE_INTAKE_HANDOFF_SUBMIT_PERCENTAGE=0..100` → `isImageIntakeHandoffSubmitEnabledForUser()`

Defaults: empty/unset percentage = 100 (full rollout within allowlist). Invalid values → 0 (safe default).

`getImageIntakeUserRolloutSummary()` updated to include `combinedMultimodal`, `crossSession`, `handoffSubmit`.

---

### F) Long-thread intent change detection v1

**File:** `intent-change-detection.ts`

Analyzes `mergedFacts` from `ThreadReconstructionResult` to detect intent changes across screenshots.

Detection logic:
- Compare latest-signal facts vs prior facts by `factKey` (what_client_wants, required_follow_up, urgency_signal, what_changed)
- Cancel/reschedule language → `changed`
- New requirement language → `partially_changed`
- Resolution language → `changed`
- Ambiguous signals → `ambiguous`
- Single asset or no prior context → `stable`

Output: `IntentChangeFinding` with `status`, `currentIntent`, `priorIntent`, `changeExplanation`, `confidence`, `priorSuperseded`.

`buildIntentChangeSummary()` returns preview-ready string or null for stable.

---

## Files changed

### New files
- `apps/web/src/lib/ai/image-intake/combined-multimodal-execution.ts`
- `apps/web/src/lib/ai/image-intake/cross-session-reconstruction.ts`
- `apps/web/src/lib/ai/image-intake/handoff-submit.ts`
- `apps/web/src/lib/ai/image-intake/intent-change-detection.ts`
- `apps/web/src/lib/ai/__tests__/image-intake-phase6.test.ts`
- `docs/image-intake-phase6.md`

### Modified files
- `apps/web/src/lib/ai/image-intake/feature-flag.ts` — Phase 6 percentage/canary rollout
- `apps/web/src/lib/ai/image-intake/types.ts` — Phase 6 types
- `apps/web/src/lib/ai/image-intake/binding-v2.ts` — `resolveCaseBindingWithSignals()`
- `apps/web/src/lib/ai/image-intake/orchestrator.ts` — wire Phase 6 modules
- `apps/web/src/lib/ai/image-intake/response-mapper.ts` — surface intent change + cross-session
- `apps/web/src/lib/ai/image-intake/index.ts` — Phase 6 exports

---

## Cost guardrails

| Rule | Enforcement |
|------|-------------|
| Combined pass: max 1 vision call | `executeBatchMultimodalStrategy` returns visionCallsMade ≤ 1 |
| Combined pass: only when decision says so | Gated by `batchDecision.strategy === "combined_pass"` + feature flag |
| Per-asset fallback preserved | Always returned when combined pass fails or unavailable |
| Signal-aware binding: zero model calls | Pure scoring over existing `CaseSignalBundle` |
| Cross-session reconstruction: zero model calls | In-process artifact comparison only |
| Handoff submit: zero model calls | Audit log only |
| Intent change detection: zero model calls | Pure logic over existing merged facts |
| Percentage rollout: zero DB queries | Hash-based, pure string operation |

---

## Test coverage (Phase 6)

**File:** `image-intake-phase6.test.ts` — 47 tests

Sections:
- Combined multimodal pass execution (5 tests)
- Signal-aware binding hints (4 tests)
- Cross-session thread reconstruction (6 tests)
- AI Review handoff submit (6 tests)
- Percentage/canary rollout (8 tests)
- Long-thread intent change detection (7 tests)
- Golden dataset guardrails Phase 6 (7 tests): GD6-1 through GD6-7

All image-intake tests (Phases 1-6): 270+ tests passing.

---

## Golden dataset guardrails Phase 6

| ID | Scenario | Guardrail |
|----|----------|-----------|
| GD6-1 | Combined pass call multiplication | max 1 vision call for combined_pass |
| GD6-2 | Confident binding from weak signals only | confidence cap 0.55 |
| GD6-3 | False cross-session merge | low confidence → no merge, gaps reported |
| GD6-4 | Handoff auto-submit without confirm | skipped_no_confirm returned |
| GD6-5 | Rollout percentage=0 blocks everyone | all users blocked |
| GD6-6 | priorSuperseded only for clear changes | stable → priorSuperseded=false |
| GD6-7 | Text-only flow regression | empty facts → stable, no interference |

---

## What remains for Phase 7

- **Cross-session persistence**: Current in-process store is lost on server restart. Phase 7 should introduce a lightweight DB-backed artifact store (e.g., simple key-value table).
- **Combined pass multi-image rendering**: Currently only primary asset URL sent to vision. Phase 7 could pass multiple image URLs when the API supports it.
- **Intent change: model-assisted disambiguation**: Currently heuristic-only. Phase 7 could add optional LLM call for ambiguous cases.
- **AI Review actual pipeline trigger**: `submitHandoffAfterConfirm` currently only writes audit. Phase 7 should integrate with the AI Review queue to actually initiate processing.
- **Rollout: UI admin panel**: Phase 7 could expose rollout config via admin interface instead of env vars.
- **Cross-session window expansion**: Currently 72h. Phase 7 may extend with configurable TTL.
