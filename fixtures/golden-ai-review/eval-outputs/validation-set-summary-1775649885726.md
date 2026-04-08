# Validation Set Runtime/Export Report

**Generated:** 2026-04-08T12:02:34.162Z
**Test set:** validation-set-2026-04-08

## PASS/FAIL per dokument

| ID | Dokument | Requested file | Resolved file | Status | Confidence | Notes |
|---|---|---|---|---|---|---|
| IZP_UNIQA | IŽP UNIQA | `IŽP UNIQA.PDF` | `Test AI/IŽP UNIQA.PDF` | **PASS** | 50% |  |
| PILLOW | Životní pojištění Pillow | `Životní pojištění Pillow.pdf` | `Test AI/Tested preprompt/Životní pojištění Pillow.pdf` | **PASS** | 50% |  |
| ZP_UNIQA | Životní pojištění Uniqa | `Životní pojištění Uniqa.pdf` | `Test AI/Životní pojištění Uniqa.pdf` | **FAIL** | 98% |  |
| PODNIKATELE | Pojištění podnikatelů | `Pojištění podnikatelů.pdf` | `Test AI/Pojištění podnikatelů.pdf` | **PASS** | 50% |  |
| POV_RUCENI | Povinné ručení | `Povinné ručení.pdf` | `Test AI/Povinné ručení.pdf` | **PASS** | 50% |  |
| UNIQA_MAJETEK | Uniqa Majetek | `Uniqa Majetek.pdf` | `Test AI/Tested preprompt/Uniqa Majetek.pdf` | **PASS** | 50% |  |
| HYPOTEKA | Hypotéka | `Hypotéka.pdf` | `Test AI/Tested preprompt/Hypotéka.pdf` | **PASS** | 50% |  |
| SMLOUVA_UVER | SMLOUVA O ÚVĚRU | `SMLOUVA O ÚVĚRU.pdf` | `Test AI/Tested preprompt/SMLOUVA O ÚVĚRU.pdf` | **PASS** | 50% |  |
| HONZAJK_CPP | Honzajk čpp změna | `Honzajk čpp změna.pdf` | `Test AI/Tested preprompt/Honzajk čpp změna.pdf` | **PASS** | 50% |  |
| SMLOUVA_SLUZEB | SMLOUVA O POSKYTOVÁNÍ SLUŽEB (nearest to Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf) | `Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf` | `Test AI/SMLOUVA O POSKYTOVÁNÍ SLUŽEB.pdf` | **PASS** | 50% | Requested file not found in repo; using nearest: SMLOUVA O POSKYTOVÁNÍ SLUŽEB.pdf |
| CODYAMIX | Investiční smlouva Codya (nearest to Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf) | `Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf` | `Test AI/Tested preprompt/Investiční smlouva Codya.pdf` | **PASS** | 50% | Requested file not found in repo; using nearest: Investiční smlouva Codya.pdf |

## Summary

- **PASS:** IZP_UNIQA, PILLOW, PODNIKATELE, POV_RUCENI, UNIQA_MAJETEK, HYPOTEKA, SMLOUVA_UVER, HONZAJK_CPP, SMLOUVA_SLUZEB, CODYAMIX
- **FAIL:** ZP_UNIQA
- **SKIPPED:** none
- **READY TO FREEZE:** NE

## První místo ztráty dat (FAIL dokumenty)

### ZP_UNIQA — Životní pojištění Uniqa
- insurer/provider missing BEFORE alias normalize (ztráta v LLM extraction nebo Zod coercion)
- client fullName missing BEFORE alias normalize
- contract/proposal number missing BEFORE alias normalize
- payment amount missing BEFORE alias normalize
- export payload je prázdný stub (žádné extrahované pole)
- insurer/provider stále chybí ve final export payload
- client stále chybí ve final export payload
- payments stále chybí ve final export payload

## JSON Report

`/Users/marekmarek/Developer/Aidvisora/fixtures/golden-ai-review/eval-outputs/validation-set-report-1775649885726.json`
