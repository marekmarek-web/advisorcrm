# F1.5 — Surgical failure audit (diagnostic only)

_Generated: 2026-04-12. No code fixes in this pass._

## 1. Executive summary

- **Unit/integration (targeted):** `anchor-extraction-blockers`, `quality-gates`, prompt env tests **green** (111 passed, 1 skipped). `legacy-insurance-proposal-envelope` + `phase-3-payment-sync-regression` **green**.
- **Regression gap:** `phase-2-review-regression.test.ts` **2 failures** — Czech date display does not match locked expectations (`DD.MM.YYYY` / zero-padded), directly relevant to „american date“ / formatting complaints.
- **Anchor debug (`pnpm debug:anchors:core`, today):** **5 PASS / 1 FAIL** — `AMUNDI` **FAIL** (`freeze_gate_pass: false`). Summary: `READY TO FREEZE CORE EXTRACTION: NE`.
- **`pnpm debug:anchors` (full registry, 31 PDFs):** **not run** in this audit (cost/latency). Last committed full-run artifact: `fixtures/golden-ai-review/eval-outputs/anchor-debug-report-1775999129296.json` — **4 anchors FAIL** (`DIRECT_POR`, `DPS`, `PATROCH_AMUNDI`, `CODYA_SERV`), `readyToFreeze: false`. **Note:** that snapshot lists `AMUNDI` in `summary.pass` while **today’s core run fails `AMUNDI`** → treat investment DIP as **flaky / regression-sensitive**, not a single static PASS.
- **Live product issues** below are **partially reproduced** in fixtures (some only as user-reported; e.g. **2223 Kč** not present in the JSON grep).

---

## 2. What was actually tested

| Command / scope | Result |
|-----------------|--------|
| `pnpm --filter web exec vitest run` … `anchor-extraction-blockers.test.ts`, `quality-gates.test.ts`, `ai-review-prompt-rollout.test.ts`, `ai-review-prompt-env-validator.test.ts` | Pass |
| `pnpm --filter web exec vitest run` … `legacy-insurance-proposal-envelope.test.ts`, `phase-3-payment-sync-regression.test.ts` | Pass |
| `pnpm --filter web exec vitest run` … `phase-2-review-regression.test.ts` | **Fail** (2 tests) |
| `pnpm debug:anchors:core` (repo root) | Vitest soft-pass; **1 anchor FAIL** (`AMUNDI`) |
| `pnpm debug:anchors` (full) | **Not executed** — use when validating all registry IDs including `ALLIANZ_POV`, `CPP_DOMEX`, `INVESTIKA`, `DPS`, `KB_DPS`, etc. |

---

## 3. Failed tests and failing runs

### Automated test failures

| Test | Symptom |
|------|---------|
| `phase-2-review-regression.test.ts` › Phase 2F — canonical dates › formats advisor display with TIME… | Expected `14:30 15.03.2024`, got `14:30 15. 3. 2024` |
| `phase-2-review-regression.test.ts` › Phase 2F — advisor UI … mapApiToExtractionDocument… | Expected `01.04.2026`, got `1. 4. 2026` |

### Anchor debug (core, 2026-04-12)

| Anchor ID | Status | Primary failure driver |
|-----------|--------|-------------------------|
| `GCP` | PASS | `G_missingRequiredFields`: `extractedFields.insuredObject` still flagged in checklist; `freeze_gate_pass: true` (gate tolerates) |
| `AMUNDI` | **FAIL** | Post-classifier `unsupported_or_unknown` vs raw LLM `investment_agreement`; route `supporting_document`; `payments_filled: false`; VS `"Číslo smlouvy"`; `freeze_gate_pass: false` |
| `MAXIMA`, `CSOB`, `PAYSLIP`, `TAX` | PASS | PAYSLIP: `documentSummary` missing + loss points (insurer/payments path) |

### Full-run snapshot (historical JSON, not re-run today)

`anchor-debug-report-1775999129296.json` — `summary.fail`: `DIRECT_POR`, `DPS`, `PATROCH_AMUNDI`, `CODYA_SERV`.

---

## 4. Known live document failures

Each item: **symptom**, **manifestation**, **expected**, **probable root cause**, **files**, **regression risk**, **generic vs doc-specific**, **post-fix test**.

### 4.1 Allianz POV (motor offer)

- **Symptom:** Missing or weak `insuredObject`; bank account wrong; dates wrong (US or ambiguous).
- **Manifestation:** CRM/UI shows incomplete subject; truncated account (e.g. `2727/2700` in snapshot — **invalid Czech account shape**); user sees MM/DD or non–`DD.MM.YYYY` flows.
- **Expected:** Vehicle (or object) structured in `insuredObject`; full `číslo účtu/kód banky` or IBAN; dates **CZ canonical** in advisor UI.
- **Probable root cause:** (1) LLM omits or flattens vehicle fields; (2) **account parsing** drops prefix digits or merges bank code; (3) date path **`normalizeDateForAdvisorDisplay`** / mapper not enforcing zero-padded `DD.MM.YYYY` (see failing phase-2 tests).
- **Files:** `apps/web/src/lib/ai/combined-extraction.ts` (prompt rules); `apps/web/src/lib/ai/extraction-field-alias-normalize.ts` (payment/account); `apps/web/src/lib/ai/canonical-date-normalize.ts`; `apps/web/src/lib/ai-review/mappers.ts`.
- **Regression risk:** Medium — touches display + extraction for all contracts.
- **Generic vs specific:** **Generic** extraction + formatting; Allianz is a **representative** of motor offers.
- **Test after fix:** Extend anchor or golden expectation for `ALLIANZ_POV`; run `phase-2-review-regression` + full `pnpm debug:anchors` once.

### 4.2 ČPP DOMEX+ (property package)

- **Symptom:** Amount semantics wrong — **2996** interpreted as monthly vs annual; **2223** as risk premium vs something else (user report; **not found as literal in `1775999129296` snapshot**).
- **Manifestation:** Wrong premium line in advisor summary / payment sync; user sees frequency mismatch.
- **Expected:** Map **annual vs installment** consistently with PDF labels; separate **risk** vs **property** components when both exist.
- **Probable root cause:** LLM mixes fields into `annualPremium` / `totalMonthlyPremium`; **alias normalize** heuristics (see comment on ČPP / annual vs monthly in `extraction-field-alias-normalize.ts`); missing structured breakdown for multi-cover offers.
- **Files:** `apps/web/src/lib/ai/extraction-field-alias-normalize.ts` (~lines 896, 1272+); `apps/web/src/lib/ai/combined-extraction.ts`; optional **post-parse** validators for non-life bundles.
- **Regression risk:** High — premium fields shared across insurers.
- **Generic vs specific:** **Generic** premium semantics; ČPP DOMEX+ is the **canary** document.
- **Test after fix:** Anchor `CPP_DOMEX` expectations in `fixtures/golden-ai-review/anchor-golden-expectations.json`; add **numeric** assertions in a small unit test for premium disambiguation if logic is deterministic.

### 4.3 Návrh/Nabídka vs Modelace/Kalkulace

- **Symptom:** `lifecycleStatus` / `isProposalOnly` / `isFinalContract` contradict business rule (binding proposal vs non-binding projection).
- **Manifestation:** Modelace treated as final contract or vice versa; wrong publish/apply gates.
- **Expected:** Prompt contract: **Návrh/Nabídka with concrete terms** → `proposal`, `isFinalContract` / flags per policy; **Modelace/Kalkulace** → `modelation`, `isProposalOnly: true`, `isFinalContract: false`.
- **Probable root cause:** LLM drift + **subdocument orchestrator** lifecycle patch overlap; **extraction-validation** warnings only for subset of `primaryType`s.
- **Files:** `apps/web/src/lib/ai/combined-extraction.ts` (instructions ~404–511); `apps/web/src/lib/ai/ai-review-prompt-templates-content.ts`; `apps/web/src/lib/ai/subdocument-extraction-orchestrator.ts`; `apps/web/src/lib/ai/extraction-validation.ts` (~359+).
- **Regression risk:** Medium.
- **Generic vs generic:** **Generic** rule set; failures often **document-specific** (wording).
- **Test after fix:** Unit tests on envelope for `MODELACE_KOOP` / proposal PDFs; `evaluateApplyReadiness` expectations in `quality-gates.test.ts`.

### 4.4 INVESTIKA (investment contract)

- **Symptom:** Duplicate or wrong **institution / správce / poskytovatel**; fund / ISIN / investment goal confused.
- **Manifestation:** Snapshot shows `insurer`/`institutionName`/`provider` all **`BEplan finanční plánování`** — **intermediary promoted to insurer**, hiding actual asset manager / ISIN context.
- **Expected:** Distinguish **zprostředkovatel** vs **správce fondu** vs **úschovna**; keep **fund name + ISIN** in structured fields.
- **Probable root cause:** **Alias normalization** maps all “institution-like” strings to one column; combined prompt does not **force** `investmentFunds` / ISIN into export for this layout.
- **Files:** `apps/web/src/lib/ai/extraction-field-alias-normalize.ts`; `apps/web/src/lib/ai/combined-extraction.ts` (INVESTICE section); `apps/web/src/lib/ai-review/mappers.ts`.
- **Regression risk:** Medium–high for all investment PDFs.
- **Generic vs specific:** **Generic** role confusion; INVESTIKA is the **example**.
- **Test after fix:** Golden expectations for `INVESTIKA`; assert distinct roles + `investmentFunds` / ISIN when present in text.

### 4.5 DPS (doplňkové penzijní spoření)

- **Symptom:** Slovník participant vs company; monthly contribution; **penzijní společnost** wrong.
- **Manifestation:** Full-run `DPS`: **`insurer` becomes `"Generali"`** while `institutionName`/`provider` stay **Conseq** — **cross-brand leakage**; `freeze_gate_pass: false` on **semantic** mismatch (coverage table without `coverages` export).
- **Expected:** Single consistent **penzijní společnost**; participant fields; contribution frequency/amount; optional risk table export or explicit waiver.
- **Probable root cause:** **Alias layer** overwrites `insurer` from weak signals; **semantic check** expects risk rows in export — extraction schema may not populate pension **coverages**.
- **Files:** `apps/web/src/lib/ai/extraction-field-alias-normalize.ts` (insurer/institution merge); `anchor-debug-runner.eval.test.ts` (semantic rules); pension-specific Zod/coercion in pipeline.
- **Regression risk:** Medium.
- **Generic vs specific:** **Generic** pension path; DPS PDF is **regression anchor**.
- **Test after fix:** Anchor `DPS` must reach `freeze_gate_pass: true`; add unit test for insurer **not** replacing pension company with unrelated brand.

### 4.6 AMUNDI DIP (core anchor) — **current FAIL**

- **Symptom:** Classifier `unsupported_or_unknown` despite investment content; garbage VS; payments not filling.
- **Manifestation:** “Nepodporovaný dokument” in advisor recognition; supporting-doc route; checklist says classification unknown.
- **Expected:** Stable `investment_subscription_document` or agreed primary type; valid VS; payments when present.
- **Probable root cause:** **Classifier head** disagreeing with **combined JSON**; downstream **route** forces `supporting_document`; **payment** validation rejects non-numeric VS.
- **Files:** `apps/web/src/lib/ai/combined-extraction.ts`; classifier mapping → `apps/web/src/lib/ai/ai-review-type-mapper.ts` (if used); `apps/web/src/lib/ai/ai-review-extraction-router.ts`; advisor view model / quality gates.
- **Regression risk:** High — same path as other investments.
- **Generic vs specific:** **Generic** investment classification failure; AMUNDI DIP PDF is **core** gate.

---

## 5. Root cause map

| Theme | Mechanism | Where it breaks |
|-------|-----------|-----------------|
| **CZ date display** | `normalizeDateForAdvisorDisplay` / mapper expectations | `canonical-date-normalize.ts`, `ai-review/mappers.ts` — **tests currently red** |
| **insuredObject** | Required field for contract gate; coercion infers only in some paths | Combined extract + contract validators; visible on `GCP` |
| **Account / VS** | Truncation, placeholder text as VS (`Číslo smlouvy`), alphanumeric VS where digits required | `extraction-field-alias-normalize.ts`, payment validators |
| **Premium semantics** | Field confusion annual/monthly/risk | LLM + alias merge heuristics |
| **Institution roles** | insurer = institution = provider collapse | `extraction-field-alias-normalize.ts`, investment prompts |
| **Pension insurer leak** | Wrong insurer priority | Same + DPS sample (`Generali` vs Conseq) |
| **Lifecycle proposal vs modelation** | LLM + orchestrator patches | `combined-extraction.ts`, `subdocument-extraction-orchestrator.ts`, `extraction-validation.ts` |
| **Investment classification** | Classifier vs extract mismatch | Type/router pipeline; **AMUNDI** instability |

---

## 6. Pre-existing vs newly introduced issues

| Issue | Pre-existing | New / flaky | Evidence |
|-------|--------------|------------|----------|
| ČZ date padding / phase-2 tests | Likely **pre-existing** drift or intentional formatter change not reflected in tests | Failing **now** | Vitest output 2026-04-12 |
| `insuredObject` gaps | **Long-standing** | Ongoing | GCP checklist + tests that infer from `productName` only in narrow cases |
| ČPP premium ambiguity | Observed across **multiple** JSON snapshots | Mixed | Older file `1775998776755` had inconsistent 2996 mapping; newer snapshot more consistent — still user-trust issue |
| AMUNDI core FAIL | — | **New or flaky** | Full JSON PASS vs **today** FAIL |
| DPS insurer=`Generali` | Appears **structured** in full-run JSON | Pre-existing logic bug | `anchor-debug-report-1775999129296.json` |
| INVESTIKA BEplan as insurer | Pre-existing mapping | — | Same JSON |

---

## 7. Surgical fix blocks

### Block A — `insuredObject` + subject extraction

- **Scope:** Non-life contracts (motor, property, liability) must emit structured subject or justified waiver.
- **Files:** `combined-extraction.ts`, contract Zod schemas / coercion, `advisor-review-view-model` / required-field list.
- **Risk:** Medium.
- **DoD:** `GCP` advisor checklist **does not** flag `insuredObject` on known-good anchors; unit test for motor/property samples.
- **Execute:** Mid-size model; prompt delta + schema.

### Block B — payment semantics (annual / monthly / risk split)

- **Scope:** Disambiguate premium lines; prevent duplicate meanings for same number (2996 / 2223 class of bugs).
- **Files:** `extraction-field-alias-normalize.ts`, optional dedicated **non-life premium** post-processor.
- **Risk:** High.
- **DoD:** ČPP DOMEX+ **one** consistent annual vs payment frequency in summary; golden expectation updated.
- **Execute:** Strong model for design; code-heavy implementation.

### Block C — account normalization + VS validation

- **Scope:** Full domestic account + bank code; reject label-as-VS; fix Allianz-style truncation.
- **Files:** `extraction-field-alias-normalize.ts`, payment gates in `quality-gates` / extraction validation.
- **Risk:** Medium.
- **DoD:** No `2727/2700`-style accounts; VS numeric or explicit `unknown` with warning.
- **Execute:** Code-first.

### Block D — CZ date formatting (`DD.MM.YYYY`)

- **Scope:** Align `normalizeDateForAdvisorDisplay` + `mapApiToExtractionDocument` with **locked** tests.
- **Files:** `canonical-date-normalize.ts`, `ai-review/mappers.ts`, `phase-2-review-regression.test.ts`.
- **Risk:** Low–medium (wide UI surface).
- **DoD:** `phase-2-review-regression.test.ts` **green**; spot-check `phase-6-production-regressions` if applicable.
- **Execute:** Code-first.

### Block E — lifecycle / finality (návrh vs modelace)

- **Scope:** Enforce business mapping for proposal/offer vs modelation/kalkulace.
- **Files:** `combined-extraction.ts`, `ai-review-prompt-templates-content.ts`, `subdocument-extraction-orchestrator.ts`, `extraction-validation.ts`.
- **Risk:** Medium.
- **DoD:** Spot checks on `MODELACE_KOOP` + proposal PDFs; gates consistent with `quality-gates`.
- **Execute:** Prompt + small code guards.

### Block F — investment destination / fund / ISIN

- **Scope:** Role separation; DIP / subscription stability; fix **AMUNDI** anchor.
- **Files:** `combined-extraction.ts`, `extraction-field-alias-normalize.ts`, type/router mappers, `ai-review-extraction-router.ts`.
- **Risk:** High.
- **DoD:** `AMUNDI` **PASS** on `pnpm debug:anchors:core`; `INVESTIKA` does not collapse intermediary into sole insurer; funds/ISIN when in PDF text.
- **Execute:** Model + router alignment.

### Block G — residual label dedup / pension semantic export

- **Scope:** DPS `insurer` leak; semantic `coverages` vs table detection; optional pension dictionary.
- **Files:** `extraction-field-alias-normalize.ts`, semantic checks in `anchor-debug-runner.eval.test.ts`, pension fields in schema.
- **Risk:** Medium.
- **DoD:** `DPS` `freeze_gate_pass: true`; `insurer` matches **penzijní společnost** from document.
- **Execute:** Code-first + targeted prompt.

---

## 8. Blockers before F2

1. **Core extraction freeze** — `READY TO FREEZE CORE EXTRACTION: NE` until **`AMUNDI` anchor green** on repeated runs (address flakiness).
2. **Contract date correctness** — `phase-2-review-regression.test.ts` **failing**; blocks trust in **all** date-heavy CRM flows.
3. **Investment primary-type / route consistency** — `unsupported_or_unknown` + `supporting_document` for a **core** DIP PDF is a **ship stop** for F2 investment scope.
4. **Pension DPS semantic / insurer integrity** — `freeze_gate_fail` on `DPS` with **brand wrong-insurer** is a **data-integrity blocker** for pension onboarding.

---

## 9. Recommended execution order

1. **Block D** — unblock tests; fastest signal on formatting regressions.
2. **Block C** — payment identity correctness (Allianz class).
3. **Block A** — `insuredObject` / subject (unblocks many checklists).
4. **Block F** — AMUNDI / INVESTIKA (core product path).
5. **Block B** — premium semantics (ČPP).
6. **Block E** — lifecycle wording (parallelizable after D).
7. **Block G** — DPS pension integrity.

Re-validate: `pnpm debug:anchors:core` → then **`pnpm debug:anchors`** full registry before F2 sign-off.

---

## 10. Appendix: exact commands and outputs

### Commands run (2026-04-12)

```bash
cd /Users/marekmarek/Developer/Aidvisora

pnpm --filter web exec vitest run \
  src/lib/ai/__tests__/anchor-extraction-blockers.test.ts \
  src/lib/ai/__tests__/quality-gates.test.ts \
  src/lib/ai/__tests__/ai-review-prompt-rollout.test.ts \
  src/lib/ai/__tests__/ai-review-prompt-env-validator.test.ts \
  --reporter=verbose

pnpm --filter web exec vitest run \
  src/lib/ai/__tests__/legacy-insurance-proposal-envelope.test.ts \
  src/lib/ai/__tests__/phase-3-payment-sync-regression.test.ts \
  --reporter=dot

pnpm --filter web exec vitest run \
  src/lib/ai/__tests__/phase-2-review-regression.test.ts \
  --reporter=dot

pnpm debug:anchors:core
```

### Not run

- `pnpm debug:anchors` (full 31-anchor set) — **skipped** to limit cost/time; historical full-run JSON cited above.

### Representative output snippets

- Core anchor summary (stdout, 2026-04-12): `PASS: GCP, MAXIMA, CSOB, PAYSLIP, TAX` / `FAIL: AMUNDI` / `READY TO FREEZE CORE EXTRACTION: NE`.
- Phase-2 failures: see §3 (expected vs received strings).
- Full-run `summary.fail` (historical): `DIRECT_POR`, `DPS`, `PATROCH_AMUNDI`, `CODYA_SERV`.

---

**Žádné SQL migrace nejsou potřeba** (audit a dokumentace pouze).

Repo path to this file: `docs/ai-review-f1_5-surgical-failure-report.md` (v monorepu Aidvisora).
