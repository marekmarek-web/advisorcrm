# Golden dataset — AI Review + AI asistent

**Fáze 1:** manifest verze **2** — scénáře **G01–G12** + **`corpusDocuments` C001–C027** (širší reálný korpus `Test AI/`). Binární PDF často **nejsou v gitu**; drž je lokálně ve stejné cestě jako `referenceFile`.

## Soubory

| Soubor | Účel |
|--------|------|
| `scenarios.manifest.json` | `scenarios[]`, `corpusDocuments[]`, `version`, odkaz na docs bucketů. |
| `regenerate-manifest.cjs` | Z kořene repa: `node fixtures/golden-ai-review/regenerate-manifest.cjs` — přepíše JSON a nastaví `gitTracked` přes `git ls-files -- Test AI/`. Uprav nejdřív pole `corpusDocuments` v tomto skriptu, pak ho spusť. |
| `docs/ai-review-assistant-phase-1-corpus-inventory.md` | Lidská tabulka C001–C027. |
| `docs/ai-review-assistant-phase-1-corpus-buckets.md` | Definice `familyBucket` + minimální výstupy. |
| `docs/ai-review-assistant-phase-1-golden-dataset.md` | Narrativ G01–G12. |

## Jak přidat nebo změnit PDF

1. Ulož soubor do `Test AI/`.  
2. Uprav záznam v `regenerate-manifest.cjs` (pole `corpusDocuments` uvnitř `mk(...)` řádků) nebo přímo `scenarios.manifest.json` a udržuj konzistenci s inventory markdown.  
3. Spusť `node fixtures/golden-ai-review/regenerate-manifest.cjs` pokud chceš přepočítat `gitTracked`.  
4. Aktualizuj [ai-review-assistant-phase-1-corpus-inventory.md](../../docs/ai-review-assistant-phase-1-corpus-inventory.md), pokud se mění tabulka.

## Budoucí harness (Fáze 2+)

- Načíst manifest → pro každé `corpusDocuments.id` spustit upload / pipeline a porovnat JSON výstup s `expectedPrimaryType`, `expectedExtractedFields` a zakázanými akcemi.  
- Vitest: `golden-dataset-manifest.test.ts` kontroluje schéma manifestu.
