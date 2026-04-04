# Golden dataset — AI Review + AI asistent

**Fáze 1:** struktura a manifest; binární PDF drž lokálně (např. `Test AI/`) nebo v zabezpečeném úložišti.

## Soubory

| Soubor | Účel |
|--------|------|
| `scenarios.manifest.json` | Strojový seznam scénářů G01–G12 pro budoucí eval harness. |
| `docs/ai-review-assistant-phase-1-golden-dataset.md` (repo root) | Lidská pravda: očekávání, akce, zakázané akce. |

## Jak přidat PDF do scénáře

1. Ulož soubor do `Test AI/` (nebo jiné neveřejné složky).  
2. Doplň `referenceFile` v manifestu (relativní cesta od root repa).  
3. Nespoléhej na commit binárek — tým si synchronizuje soubory zvlášť.

## Budoucí harness (Fáze 2+)

- Načíst manifest → pro každý `id` spustit pipeline `runAiReviewV2Pipeline` / E2E upload.  
- Porovnat výstup proti polím v markdown dokumentu a proti acceptance criteria v `docs/ai-review-assistant-phase-1-acceptance-criteria-phase-2plus.md`.
