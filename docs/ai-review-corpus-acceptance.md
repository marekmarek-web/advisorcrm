# AI Review — akceptační korpus (orientační)

Interní checklist pro ruční nebo lokální regresi nad složkou s PDF **mimo git** (žádná PII v repozitáři).

**Širší korpus (Fáze 1+):** evaluace a opravy AI Review / asistenta se řídí inventářem [ai-review-assistant-phase-1-corpus-inventory.md](./ai-review-assistant-phase-1-corpus-inventory.md) (27× `corpusDocuments` C001–C027 + scénáře G01–G12 v `scenarios.manifest.json`), nikoli pouze původní krátkou sadou z raného checklistu. [ai-assistant-stage5-acceptance.md](./ai-assistant-stage5-acceptance.md) nedefinuje rozsah tohoto korpusu.

## Očekávání

- Dokument se **klasifikuje** na rozumný `primaryType` z `document-schema-registry`.
- Po extrakci a **`applyExtractedFieldAliasNormalizations`** nejsou povinná pole z registry označená jako chybějící jen kvůli **jinému názvu pole** v JSON (např. `institutionName` vs `insurer`).
- UI zobrazí **skutečné hodnoty** v `extractedFields`, ne syntetická `missing` z falešné verifikace.

## Mapování vzorů souborů → rodina

| Vzor názvu / typ | primaryType (cíl) |
|------------------|-------------------|
| Pojistná smlouva, *sml.pdf, Generali / UNIQA / MAXIMA / MetLife | `life_insurance_final_contract`, `life_insurance_contract`, `life_insurance_investment_contract` nebo `nonlife_insurance_contract` dle obsahu |
| Navrh_pojistne_smlouvy*, návrh | `life_insurance_proposal` |
| modelace*, *modelace*, změna ČPP | `life_insurance_modelation`, `insurance_policy_change_or_service_doc`, … |
| FUNDOO (pravidelná/jednorázová investice, typicky Amundi) | `investment_payment_instruction`, `investment_subscription_document`, `investment_service_agreement` — **ne** `pension_contract` |
| DPPDP*, smlouva DPS, VL-* (penzijní rámec) | `pension_contract` — v textu rozlišit **DPS** (doplňkové penzijní spoření) vs **PP** (penzijní připojištění) |
| DIP smlouva | `dipExtraction` / příslušný typ; nelze plést s čistým fondovým příkazem ani s DPS |
| Spotřebitelský úvěr ČSOB | `consumer_loan_contract` |
| DP daňové přiznání | `corporate_tax_return` / `self_employed_tax_or_income_document` |
| Poštovní účet / výpis | `bank_statement` |

## Lokální běh (návrh)

Spusťte pipeline z aplikace proti souborům ve vlastní složce; výsledné `extractedFields` lze porovnat s minimální množinou klíčů podle `DOCUMENT_SCHEMA_REGISTRY[primaryType].extractionRules.required` (po strip prefixu `extractedFields.`).

## Minimální automatické testy v repu

- `extraction-field-alias-normalize.test.ts` — aliasy pro IŽP, návrh, úvěr, penzi.
- Rozšiřovat pouze **anonymizované JSON fixture**, ne celé PDF.

## Související dokumentace

- [ai-review-assistant-phase-1-corpus-inventory.md](./ai-review-assistant-phase-1-corpus-inventory.md) — plný seznam C001–C027 a bucketů.
- [ai-review-assistant-phase-1-corpus-buckets.md](./ai-review-assistant-phase-1-corpus-buckets.md) — minimální data podle `familyBucket`.
- [ai-review-manual-corpus-checklist.md](./ai-review-manual-corpus-checklist.md) — tabulka PDF v `Test AI/` a šablona pro ruční zápis výsledků z dev logů.
- [ai-review-prompt-inventory.md](./ai-review-prompt-inventory.md) — `AiReviewPromptKey` ↔ `ai uceni/` ↔ povinné proměnné Prompt Builderu.
