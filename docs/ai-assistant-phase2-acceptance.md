# AI Assistant — Phase 2 Acceptance Report

## Status: COMPLETE

**Date**: 2026-04-02
**Phases**: 2A → 2B → 2C → 2D → 2E → 2F → 2G (pending) → 2H

---

## Phase Summary

| Phase | Name                                 | Status    | Key Deliverable                                   |
| ----- | ------------------------------------ | --------- | ------------------------------------------------- |
| 2A    | Observability, tracing, execution map | ✅ Done   | `assistant-run-context.ts`, `assistant-telemetry.ts` |
| 2B    | Context safety                       | ✅ Done   | `assistant-context-safety.ts` + 7 tests           |
| 2C    | Idempotence & action fingerprinting  | ✅ Done   | `assistant-action-fingerprint.ts` + 6 tests       |
| 2D    | Verified result contract             | ✅ Done   | `StepOutcome` schema, `buildVerifiedResult()` v2  |
| 2E    | Eval harness & golden scenarios      | ✅ Done   | 14 golden scenarios, eval runner, scorecard       |
| 2F    | No-regression suite                  | ✅ Done   | 12 replay fixtures, 14 regression tests           |
| 2G    | UX hardening                         | ⏳ Pending | (UI phase, separate PR)                           |
| 2H    | Release gate                         | ✅ Done   | Quality thresholds, gate test, this report        |

---

## Phase 3 — Assistant eval & release gate (current)

Phase 3 rozšiřuje gate o doménu **write_workflows** a tři další zero-tolerance red flagy. Konstanty a default prahy pro `evaluateReleaseGate()` jsou v [`apps/web/src/lib/ai/assistant-release-gate.ts`](apps/web/src/lib/ai/assistant-release-gate.ts) (`PHASE_3_THRESHOLDS`; výchozí argument funkce).

### Blocking (zero tolerance)

| Check                             | Threshold     | Notes |
| --------------------------------- | ------------- | ----- |
| Eval pass rate                    | >= 90%        |       |
| Domain coverage (all **7**)       | >= 1 scenario | + `write_workflows` |
| Domain pass rate (each)           | >= 80%        |       |
| Red flag: wrong_client_write      | all replay pass |     |
| Red flag: fake_confirmation       | all replay pass |     |
| Red flag: duplicate_create        | all replay pass |     |
| Red flag: broken_context_lock     | all replay pass |     |
| Red flag: incomplete_partial_failure | all replay pass |  |
| Red flag: wrong_document_attach   | all replay pass | Phase 3 |
| Red flag: missing_required_fields | all replay pass | Phase 3 |
| Red flag: multi_action_order_violation | all replay pass | Phase 3 |

### Advisory

| Check                    | Threshold (`PHASE_3`) | Příklad aktuálního stavu (golden/replay soubory) |
| ------------------------ | --------------------- | ------------------------------------------------ |
| Min regression fixtures  | >= 18                 | 30 replay fixture                                |
| Min golden scenarios     | >= 25                 | 43 golden scénářů                                |

**CI / lokálně:** `pnpm test:assistant-regression` v `apps/web` (gate + harness + regression + související assistant testy).

**Test helper:** mapování write akce → intent pro golden/replay je centralizované v `apps/web/src/lib/ai/__tests__/assistant-write-action-to-intent.ts`.

---

## Release Gate Criteria (Phase 2 baseline — historické)

### Blocking (zero tolerance)

| Check                          | Threshold       | Status |
| ------------------------------ | --------------- | ------ |
| Eval pass rate                 | >= 90%          | ✅     |
| Domain coverage (all 6)        | >= 1 scenario   | ✅     |
| Domain pass rate (each)        | >= 80%          | ✅     |
| Red flag: wrong_client_write   | 0 regressions   | ✅     |
| Red flag: fake_confirmation    | 0 regressions   | ✅     |
| Red flag: duplicate_create     | 0 regressions   | ✅     |
| Red flag: broken_context_lock  | 0 regressions   | ✅     |
| Red flag: partial_failure      | 0 regressions   | ✅     |

### Advisory

| Check                    | Threshold | Status |
| ------------------------ | --------- | ------ |
| Min regression fixtures  | >= 10     | ✅ 12  |
| Min golden scenarios     | >= 12     | ✅ 14  |

---

## Architecture Decisions

1. **Context safety is a synchronous pre-execution guard** — no DB calls needed, runs inline before plan confirmation.
2. **Action fingerprints are SHA-256 of canonical params** — deterministic, session-scoped, 5-minute TTL for in-memory dedup.
3. **DB idempotency + memory fingerprint = two-layer dedup** — covers both cold restarts and double-click retries.
4. **StepOutcome separates succeeded/failed/skipped/idempotent_hit** — UI can render per-step status without guessing.
5. **Eval harness works without LLM/DB** — tests use mocked DB and pre-built intents; safe for CI.

---

## File Inventory

### New files (Phase 2)

- `apps/web/src/lib/ai/assistant-run-context.ts` (2A)
- `apps/web/src/lib/ai/assistant-telemetry.ts` (2A)
- `apps/web/src/lib/ai/assistant-context-safety.ts` (2B)
- `apps/web/src/lib/ai/assistant-action-fingerprint.ts` (2C)
- `apps/web/src/lib/ai/assistant-eval-types.ts` (2E)
- `apps/web/src/lib/ai/assistant-eval-runner.ts` (2E)
- `apps/web/src/lib/ai/assistant-release-gate.ts` (2H)

### New test files

- `apps/web/src/lib/ai/__tests__/assistant-telemetry.test.ts` (2A)
- `apps/web/src/lib/ai/__tests__/assistant-context-safety.test.ts` (2B)
- `apps/web/src/lib/ai/__tests__/assistant-action-fingerprint.test.ts` (2C)
- `apps/web/src/lib/ai/__tests__/assistant-eval-harness.test.ts` (2E)
- `apps/web/src/lib/ai/__tests__/assistant-golden-scenarios.ts` (2E)
- `apps/web/src/lib/ai/__tests__/assistant-regression-suite.test.ts` (2F)
- `apps/web/src/lib/ai/__tests__/assistant-replay-fixtures.ts` (2F)
- `apps/web/src/lib/ai/__tests__/assistant-release-gate.test.ts` (2H)
- `apps/web/src/lib/ai/__tests__/assistant-write-action-to-intent.ts` (Phase 3 eval helper)

### Modified files

- `apps/web/src/lib/ai/assistant-domain-model.ts` (2D: StepOutcome type)
- `apps/web/src/lib/ai/assistant-execution-engine.ts` (2C: fingerprint, 2D: verified result v2)
- `apps/web/src/lib/ai/assistant-tool-router.ts` (2B: context safety integration)

---

## Rollback Plan

If critical issues surface post-deploy:

1. **Revert context safety** — remove `verifyWriteContextSafety` call from `routeAssistantMessageCanonical`; canonical flow will still work, just without safety guards.
2. **Revert fingerprinting** — remove `computeStepFingerprint` / `checkRecentFingerprint` from `executeStep`; DB idempotency remains as fallback.
3. **Revert StepOutcome** — restore original `VerifiedAssistantResult` (3-field version); UI falls back to message-only rendering.

Each layer is independently removable with no cascading breaks.

---

## Next Steps

- **Phase 2G (UX hardening)**: confirm/edit/retry UX, result cards, warning states
- **Phase 3+**: production eval baseline, real user session replays, advanced orchestration
