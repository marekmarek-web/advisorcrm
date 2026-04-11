# Golden / anchor eval outputs

Sem patří výstupy z eval a debug runnerů (JSON reporty). Soubory `anchor-debug-report-*.json` se generují lokálně — **nemusí** být commitnuté.

## F0 — Anchor Debug Runner

Potřebuje platné klíče v `apps/web/.env.local` (např. `OPENAI_API_KEY`). Vitest načítá `.env.local` automaticky (`vitest.config.ts`).

Z kořene monorepa:

```bash
pnpm debug:anchors:core   # 6 anchorů — rychlejší vstup pro F1
pnpm debug:anchors        # celý registry (~27 PDF) — plný trace před F1
```

Výstup:

- `anchor-debug-report-<timestamp>.json` — archiv jednoho běhu
- **`anchor-debug-report-latest.json`** — vždy přepsaný posledním během; **použij pro F1 mini-plan** vedle fixture registry (klasifikátor, router, raw head, checkpointy, `firstLossPoints`)

- **`ANCHOR_STRICT=1`** — Vitest spadne při jakémkoli FAIL anchoru (vhodné pro CI po zeleném baseline).
- Bez `ANCHOR_STRICT` — měkký průchod; report se vždy zapíše (baseline / diagnostika).

## F1 mini-plan — vstupy (registry + reálný trace)

1. **Struktura a očekávání (bez LLM):**  
   [`../anchor-registry.json`](../anchor-registry.json), [`../anchor-golden-expectations.json`](../anchor-golden-expectations.json)
2. **Reálný pipeline trace:** po úspěšném lokálním běhu otevři **`anchor-debug-report-latest.json`** v tomto adresáři — obsahuje `A_classifierResult`, `B_routerDecision`, `B2_rawModelOutput`, `C_afterCoercion`, `D_afterValidation`, `firstLossPoints`, `checks`, atd.

Bez `anchor-debug-report-latest.json` z reálného běhu F1 řeší jen „papír“; s reportem je vidět přesný first loss point na produkční větvi.
