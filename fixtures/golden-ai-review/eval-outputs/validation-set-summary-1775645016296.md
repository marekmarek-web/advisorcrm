# Validation Set Runtime/Export Report

**Generated:** 2026-04-08T10:38:37.441Z
**Test set:** validation-set-2026-04-08

## PASS/FAIL per dokument

| ID | Dokument | Requested file | Resolved file | Status | Confidence | Notes |
|---|---|---|---|---|---|---|
| IZP_UNIQA | IŽP UNIQA | `IŽP UNIQA.PDF` | `Test AI/IŽP UNIQA.PDF` | **FAIL** | – |  |
| PILLOW | Životní pojištění Pillow | `Životní pojištění Pillow.pdf` | `Test AI/Tested preprompt/Životní pojištění Pillow.pdf` | **FAIL** | – |  |
| ZP_UNIQA | Životní pojištění Uniqa | `Životní pojištění Uniqa.pdf` | `Test AI/Životní pojištění Uniqa.pdf` | **FAIL** | – |  |
| PODNIKATELE | Pojištění podnikatelů | `Pojištění podnikatelů.pdf` | `Test AI/Pojištění podnikatelů.pdf` | **FAIL** | – |  |
| POV_RUCENI | Povinné ručení | `Povinné ručení.pdf` | `Test AI/Povinné ručení.pdf` | **FAIL** | – |  |
| UNIQA_MAJETEK | Uniqa Majetek | `Uniqa Majetek.pdf` | `Test AI/Tested preprompt/Uniqa Majetek.pdf` | **FAIL** | – |  |
| HYPOTEKA | Hypotéka | `Hypotéka.pdf` | `Test AI/Tested preprompt/Hypotéka.pdf` | **FAIL** | – |  |
| SMLOUVA_UVER | SMLOUVA O ÚVĚRU | `SMLOUVA O ÚVĚRU.pdf` | `Test AI/Tested preprompt/SMLOUVA O ÚVĚRU.pdf` | **FAIL** | – |  |
| HONZAJK_CPP | Honzajk čpp změna | `Honzajk čpp změna.pdf` | `Test AI/Tested preprompt/Honzajk čpp změna.pdf` | **FAIL** | – |  |
| SMLOUVA_SLUZEB | SMLOUVA O POSKYTOVÁNÍ SLUŽEB (nearest to Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf) | `Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf` | `Test AI/SMLOUVA O POSKYTOVÁNÍ SLUŽEB.pdf` | **FAIL** | – |  |
| CODYAMIX | Investiční smlouva Codya (nearest to Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf) | `Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf` | `Test AI/Tested preprompt/Investiční smlouva Codya.pdf` | **FAIL** | – |  |

## Summary

- **PASS:** none
- **FAIL:** IZP_UNIQA, PILLOW, ZP_UNIQA, PODNIKATELE, POV_RUCENI, UNIQA_MAJETEK, HYPOTEKA, SMLOUVA_UVER, HONZAJK_CPP, SMLOUVA_SLUZEB, CODYAMIX
- **SKIPPED:** none
- **READY TO FREEZE:** NE

## JSON Report

`/Users/marekmarek/Developer/Aidvisora/fixtures/golden-ai-review/eval-outputs/validation-set-report-1775645016296.json`

## ANALÝZA BLOKERŮ (všechny dokumenty FAIL)

### Blokér #1 — Zod schema mismatch v `ai_review_classifier_v2` (KRITICKÝ)

**Příznaky z trace `combined_single_call_failed`:**

1. `documentClassification.primaryType` — model vrátí hodnotu mimo povolený enum (např. `"IŽP"`, `"smlouva o úvěru"` apod.)
2. `documentClassification.lifecycleStatus` — mimo enum
3. `documentClassification.confidence` — `undefined` (model pole vynechá)
4. `documentClassification.reasons` — model vrátí string místo `string[]`
5. `suggestedActions` — model vrátí object místo `array`
6. U části dokumentů `extractedFields.*` — flat string/number hodnoty místo `{ value, status, confidence }` objektů

**První místo ztráty dat:** Zod parsování `ai_review_classifier_v2` response. Celý `combined_single_call` selže, pipeline vrátí `errorMessage: "Klasifikace dokumentu (AI Review v2) selhala."` bez jakéhokoli `extractedPayload`.

**Scope:** Všech 11 dokumentů. Bez ohledu na typ dokumentu (životní pojištění, hypotéka, povinné ručení, smlouva o službách).

### Blokér #2 — Fallback 407 při pokusu stáhnout PDF přes local server (SEKUNDÁRNÍ)

Pokud text hint není dostatečný (< 800 chars), pipeline přepne na vision mode a zkusí stáhnout PDF z local HTTP serveru. OpenAI API vrátí `407` (proxy blokuje localhost URLs). Blokér by se projevil jen u dokumentů kde PDF parse selže — zde se nevyhodnocuje, protože Blokér #1 zastaví pipeline dříve.

### Co je třeba opravit

1. Prompt / response schema pro `combined_single_call` v `ai_review_classifier_v2` — nutné zajistit, aby model vracel hodnoty v exaktním enum formátu (nebo přidat `coerce`/`catch` na Zod úrovni)
2. Zvlášť: `confidence: number` musí být vždy vyplněno (defaultní hodnota nebo explicit required v promptu)
3. Zvlášť: `reasons: string[]` — model vrací string, potřeba coerce nebo oprava promptu
4. Zvlášť: `suggestedActions: array` — model vrací object, potřeba coerce
5. Pro Hypotéka: `extractedFields.*` — model vrací flat hodnoty bez `{value, status, confidence}` wrapper

### READY TO FREEZE: NE — blocker v schema validation, 0/11 PASS
