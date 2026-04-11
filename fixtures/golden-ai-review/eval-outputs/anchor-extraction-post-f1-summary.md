# Anchor extraction — post-F1 regression summary

Generated as part of F1 Slice 6 (full 27-anchor run). Compare with `anchor-debug-report-f0-baseline.json` (snapshot from pre-F1 full run, `1775929676649`).

## Headline counts

| Metric | F0 baseline | Post-F1 |
|--------|-------------|---------|
| PASS | 16 | 22 |
| FAIL | 11 | 5 |
| Net | — | +6 PASS, −6 FAIL vs F0 |

## Improved (FAIL → PASS)

`GCP`, `AMUNDI`, `CSOB`, `PAYSLIP`, `CPP_ZMENA`, `CODYA_INV`, `SMLOUVA_UVER`, `HYPOTEKA` — aligns with F1 slices (classification, routing, parties coercion, supporting aliases, confidence).

## Regressions (PASS → FAIL) — explained

| Anchor | Likely cause |
|--------|----------------|
| **DIRECT_POR** | Combined path classifier returned `unsupported_or_unknown` while raw `documentClassification.type` was `vehicle_liability_policy`. Freeze gate requires canonical `primaryType` ≠ `unsupported_or_unknown`. Not caused by F1 field/coercion logic; missing alias / normalization for this family label. |
| **HANNA_GCP** | `combined_classify_extract` JSON parse failed → fallback path produced **empty** `extractedFields`; semantic gate then flagged missing policyholder/payments. Infrastructure / response-shape flakiness, not F1 coercion regression. |

## Still failing (unchanged FAIL → FAIL)

| Anchor | Primary failure mode |
|--------|----------------------|
| **PODNIK** | Same pattern as DIRECT_POR: rich extraction but `primaryType: unsupported_or_unknown` (`business_liability_policy` in raw). |
| **DPS** | `pension_contract` + semantic check: document text matches “coverage table” heuristics → `coverages` expected; DPS bundle triggers false positive. |
| **CODYA_SERV** | `investment_service_contract` in raw → classifier `unsupported_or_unknown`; contract docs wrongly routed to `supporting_document`; payments core field gap. |

## Artifact paths

- **F0 baseline (frozen snapshot):** `fixtures/golden-ai-review/eval-outputs/anchor-debug-report-f0-baseline.json`
- **Post-F1 baseline:** `fixtures/golden-ai-review/eval-outputs/anchor-debug-report-post-f1.json`
- **Latest run (overwritten each full `pnpm debug:anchors`):** `anchor-debug-report-latest.json`

## Prepared for F2

1. **Aliases / classification:** map `vehicle_liability_policy`, `business_liability_policy`, `investment_service_contract` (and similar LLM `type`/`family` labels) to canonical `PRIMARY_TYPE_ALIASES` or `normalizePrimaryType` substring paths so `unsupported_or_unknown` does not drop PASS on otherwise good extractions.
2. **Semantic gate:** exclude or narrow `hasCoverageTable` for `pension_contract` / DPS-like bundles to avoid false FAIL.
3. **Resilience:** harden combined-path JSON parsing or retry for large responses (HANNA_GCP).
4. **Routing:** ensure `service_agreement` / investment service contracts do not degrade to `supporting_document` when extraction is contract-shaped (CODYA_SERV).
