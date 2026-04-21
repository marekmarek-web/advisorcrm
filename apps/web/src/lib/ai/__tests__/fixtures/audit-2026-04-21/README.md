# Audit 2026-04-21 — Fixtures

Golden fixtures pro forensic audit AI Review pipeline (dokument/extrakce/apply).
Spouští se přes `golden-regression-extended.test.ts`.

Každá fixture reprezentuje konkrétní bug-class nalezenou v auditu.
Pokud budoucí oprava (viz opravný plán, batche F1–F3) změní chování,
příslušný test ve harnessu selže — úmyslně — a musí být ručně aktualizován.

## Fixture matrix

| # | Soubor | Bug ID | Scénář |
|---|--------|--------|--------|
| 01 | `01-proposal-promoted-to-final.json` | C-09 | Životní pojištění — návrh smlouvy (ne modelace) → envelope coercne lifecycle na `final_contract` |
| 02 | `02-life-final-manual-edit-missing.json` | C-02 | Pole `phone` status=missing, poradce ho ručně vyplnil → po `mergeFieldEditsIntoExtractedPayload` je `value` nastaveno, ale `status` zůstává `missing` |
| 03 | `03-investment-funds-string-shape.json` | BONUS-1 | DIP s `investmentFunds` jako JSON string (LLM output shape); `buildPortfolioAttributesFromExtracted` vidí string, ne pole → fondy se neuloží |
| 04 | `04-dip-multi-fund-portfolio.json` | BONUS-2 / H-09 | DIP se 3 fondy (první v library, druhý mimo, třetí s ISIN mimatchem); FV rozlišování pouze z prvního fondu |
| 05 | `05-supporting-doc-advisor-bypass.json` | C-04 / H-17 | Mzdový list (`payslip`) — poradce klikne Approve → advisor-confirmed apply obchází supporting-doc guard i gate |
| 06 | `06-loan-hypo-apply-bundle.json` | C-10 / H-06 | Hypoteční smlouva; `contact-overview-kpi.ts` HYPO/UVER nezahrnuje do KPI agregace |

## Jak použít

```ts
import proposalFixture from "./fixtures/audit-2026-04-21/01-proposal-promoted-to-final.json";
import { coerceReviewEnvelopeParsedJson } from "../envelope-parse-coerce";

const coerced = coerceReviewEnvelopeParsedJson(proposalFixture);
expect((coerced as Record<string, unknown>).documentClassification).toMatchObject({
  lifecycleStatus: "final_contract",
});
```
