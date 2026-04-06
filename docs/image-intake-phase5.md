# AI Photo / Image Intake — Fáze 5

## Status: DONE

Fáze 5 přidává produkčně robustní thread-aware orchestraci: long-thread reconstruction,
strukturovaný AI Review handoff payload, per-user rollout, batch multimodal optimization
a advanced case/opportunity signal extraction.

---

## Co bylo přidáno

### A) Long-thread conversation reconstruction v1 (`thread-reconstruction.ts`)

Rekonstruuje pravděpodobný příběh více-screenshotové komunikace bez modelu.

**Algoritmus (zero model calls):**
1. Chronologické seřazení assetů (uploadedAt → filename suffix → original order)
2. Vyloučení duplikátů (z stitching result)
3. Sloučení factů z více assetů do thread-level summary (deduplikace hodnot)
4. Identifikace latest actionable signal (urgency > follow_up > wants > changed)
5. Określení outcome: `full_thread` | `partial_thread` | `ambiguous_thread` | `single_asset` | `duplicate_only`

**Bezpečnostní pravidla:**
- Bez faktů → `ambiguous_thread` (ne falešná rekonstrukce)
- Překrývající se hodnoty → jedna merged fact s dvěma sourceAssetIds (žádné duplikáty)
- Výstup: `ThreadReconstructionResult` (ordered_assets, merged_facts, latestActionableSignal, unresolvedGaps)

---

### B) Structured AI Review handoff payload contract (`handoff-payload.ts`)

Čistý, auditovatelný payload pro předání review-like dokumentu do AI Review lane.

**Co payload nese:**
- `sourceAssetIds` — které assety
- `handoffReasons` — proč (signály)
- `orientationSummary` — co image intake zjistila orientačně
- `bindingContext` — klient/case kontext (bezpečně)
- `ambiguityNotes` — nejistoty pro AI Review
- `laneNote: "image_intake_lane_only_extracted_orientation"` — explicitní boundary marker

**Bezpečnost:**
- Payload je výhradně advisory output — žádná auto-execution
- AI Review musí být spuštěn explicitně advisorem
- Image intake neprovádí AI Review práci
- Lane separation zachována v každém scénáři

**Statusy:** `ready` | `partial` | `insufficient` (insufficient → payload=null)

---

### C) Per-user rollout / allowlist rollout v1 (`feature-flag.ts`)

Jemnější gating nad env-level flagem.

**Pattern:** comma-separated user ID allowlist v env proměnné.

| Env proměnná | Co gatuje |
|---|---|
| `IMAGE_INTAKE_ALLOWED_USER_IDS` | Base image intake |
| `IMAGE_INTAKE_MULTIMODAL_ALLOWED_USER_IDS` | Multimodal vision pass |
| `IMAGE_INTAKE_THREAD_RECONSTRUCTION_ALLOWED_USER_IDS` | Thread reconstruction |
| `IMAGE_INTAKE_REVIEW_HANDOFF_ALLOWED_USER_IDS` | AI Review handoff |
| `IMAGE_INTAKE_CASE_SIGNAL_ALLOWED_USER_IDS` | Case signal extraction |
| `IMAGE_INTAKE_THREAD_RECONSTRUCTION_ENABLED` | Thread reconstruction flag |
| `IMAGE_INTAKE_CASE_SIGNAL_ENABLED` | Case signal flag |

**Chování:**
- Prázdný/chybějící env → allow all (žádný allowlist = open rollout)
- Nastavený allowlist → pouze listed users
- Base flag OFF → blokuje všechny users

`getImageIntakeUserRolloutSummary(userId)` — auditovatelný rollout snapshot pro trace.

---

### D) Batch multimodal optimization pro grouped threads (`batch-multimodal.ts`)

Rozhoduje nejlevnější multimodal strategii pro skupinu assetů.

**Strategie:**
| Strategie | Kdy |
|---|---|
| `combined_pass` | ≥2 assety, stejný typ, grouped_thread/related, ≤3 assety, žádný existující výsledek |
| `per_asset` | kandidáti nesplňují combined podmínky |
| `skip_all` | multimodal disabled, dead-ends, všechny processed |

**Hard limits:**
- `MAX_COMBINED_PASS_ASSETS = 3`
- `MAX_VISION_CALLS_PER_BATCH = 2`
- `general_unusable_image` / `supporting_reference_image` → vždy skip
- Existující výsledky → vždy skip (žádné duplicate calls)

---

### E) Advanced case/opportunity signal extraction v1 (`case-signal-extraction.ts`)

Extrahuje binding-assist signály z existujících fact bundles — zero model calls.

**Detekované typy signálů:**
| signalType | Příklady |
|---|---|
| `product_type_mention` | hypotéka, pojistka, investice, penzijní |
| `bank_or_institution_mention` | Komerční banka, Česká spořitelna, ČSOB |
| `deadline_or_date_mention` | splatnost, termín, schůzka |
| `existing_process_reference` | smlouva č., číslo žádosti, nabídka č. |
| `financial_amount_hint` | amount, transaction_amount, balance fakty |

**Bezpečnost:**
- Všechny signály: `bindingAssistOnly: true`
- Signály nekonfirmují case binding — jsou pouze hints pro binding v2
- Bez dostatečné evidence nevzniká confident auto-pick

---

## Nové soubory

| Soubor | Popis |
|--------|-------|
| `image-intake/thread-reconstruction.ts` | Long-thread reconstruction v1 |
| `image-intake/handoff-payload.ts` | Structured handoff payload contract |
| `image-intake/batch-multimodal.ts` | Batch multimodal cost optimization |
| `image-intake/case-signal-extraction.ts` | Advanced case/opportunity signals |
| `__tests__/image-intake-phase5.test.ts` | Phase 5 tests (40 test cases) |
| `docs/image-intake-phase5.md` | Tato dokumentace |

## Upravené soubory

| Soubor | Co se změnilo |
|--------|--------------|
| `image-intake/feature-flag.ts` | +per-user allowlist rollout v1 |
| `image-intake/types.ts` | +Phase 5 typy (ThreadReconstructionResult, ReviewHandoffPayload, CaseSignalBundle, BatchMultimodalDecision) |
| `image-intake/orchestrator.ts` | Wire Phase 5 (thread reconstruction, handoff payload, case signals, batch decision) |
| `image-intake/response-mapper.ts` | Thread summary, handoff note, case signals surfacing |
| `image-intake/index.ts` | Exporty Phase 5 modulů a feature flags |

---

## Cost guardrails

| Vrstva | Cost |
|--------|------|
| Thread reconstruction | **0 model callů** — pure fact merging |
| Handoff payload | **0 model callů** — transformation of existing results |
| Case signal extraction | **0 model callů** — keyword/regex matching |
| Batch multimodal | **max 2 vision calls** per batch, skip již zpracovaných |
| Per-user rollout check | **0 DB queries** — pure env/Set lookup |

---

## Test pokrytí — Phase 5

### Thread reconstruction (8 tests)
- Single asset → single_asset outcome ✓
- Duplicate-only group → handled ✓
- Fact merging from multiple assets ✓
- Latest actionable signal from last ordered asset ✓
- Ambiguous for no facts (no fabrication) ✓
- Partial thread for missing latest signal ✓
- No duplicate merged facts from overlapping screenshots ✓
- buildThreadSummaryLines returns empty for single_asset ✓

### Handoff payload (5 tests)
- Ready payload for confident recommendation ✓
- Null for not recommended ✓
- Ambiguity notes for unresolved binding ✓
- Lane boundary marker present ✓
- buildHandoffPreviewNote non-empty ✓

### Per-user rollout (7 tests)
- Allow all when no allowlist ✓
- Allow listed user ✓
- Block unlisted user ✓
- Block all when base flag OFF ✓
- Thread reconstruction flag chain ✓
- Thread reconstruction blocked when flag OFF ✓
- getImageIntakeUserRolloutSummary complete ✓

### Batch multimodal (6 tests)
- skip_all when multimodal disabled ✓
- combined_pass for 2 same-type grouped assets ✓
- Skip already-processed assets ✓
- Cap at MAX_VISION_CALLS_PER_BATCH ✓
- Skip unusable assets ✓
- buildBatchCostSummary returns string ✓

### Case signal extraction (7 tests)
- product_type_mention for "hypotéka" ✓
- bank_or_institution_mention ✓
- deadline signals from due_date ✓
- existing_process_reference ✓
- None strength for empty bundle ✓
- All signals: bindingAssistOnly=true ✓
- mergeCaseSignalBundles deduplicates ✓

### Golden dataset guardrails (6 tests)
- GD5-1: ambiguous reconstruction for no facts ✓
- GD5-2: duplicate screenshots no duplicate facts ✓
- GD5-3: handoff payload no auto-execution ✓
- GD5-4: weak signals still bindingAssistOnly ✓
- GD5-5: batch capped at MAX vision calls ✓
- GD5-6: unlisted users blocked from features ✓

---

## Co zůstává do Fáze 6

1. **Multi-day thread reconstruction** — cross-session vlákna (více sessions)
2. **AI Review handoff auto-submission** — po advisor potvrzení spustit AI Review pipeline
3. **Combined multimodal pass execution** — aktuálně je `combined_pass` rozhodnutí, ale orchestrator ještě neprovede jednu shared multimodal call pro grouped set
4. **Percentage rollout** — `IMAGE_INTAKE_ROLLOUT_PERCENTAGE=10` pro canary/gradual rollout
5. **Case signal → binding v2 integration** — signály z `extractCaseSignals` zatím nefeedují zpět do `resolveCaseBindingV2` jako hints
6. **Long-thread intent change detection** — screenshot kde klient mění předchozí požadavek
7. **Eval replay harness** — reálné fixture pro multi-day thread, handoff, canary scénáře
