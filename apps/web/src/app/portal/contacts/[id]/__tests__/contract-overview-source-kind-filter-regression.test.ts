/**
 * Regression — "Sjednané a rozjednané produkty" u poradce musí ukázat VŠECHNY
 * smlouvy kontaktu bez ohledu na `sourceKind`.
 *
 * Historický bug:
 *   `ContactContractsOverview` filtroval `bundleData.contracts` přes
 *   `ADVISOR_PRODUCT_SOURCE_KINDS = {"manual","ai_review"}`. Smlouvy s
 *   `sourceKind = "document"` (document-extraction / scan) a `"import"`
 *   (legacy bulk import) se tak poradci nikdy nezobrazily, přestože:
 *     • byly v DB,
 *     • měly `visibleToClient=true + portfolioStatus ∈ {active, ended}` a
 *     • klient je viděl na svém portálu (`getClientPortfolioForContact`
 *       filtruje pouze podle `visibleToClient + portfolioStatus`, nikoli
 *       podle `sourceKind`).
 *
 * Výsledkem bylo, že poradce netušil, že smlouvu vůbec má rozjednanou —
 * a proto si stěžoval, že "klientovi na portál se to propsalo, ale poradce
 * to nevidí".
 *
 * Tento test je STATICKÝ — hlídá, že:
 *   1) `ContactContractsOverview.tsx` neobsahuje filter podle `sourceKind`,
 *   2) import `ADVISOR_PRODUCT_SOURCE_KINDS` byl z overview komponenty
 *      odebraný,
 *   3) KPI modul (`contact-overview-kpi.ts`) si svůj přísnější filter dál
 *      zachovává — KPI (Osobní AUM, měsíční investice) nesmí počítat
 *      rozpracované drafty jako "spravovaný majetek".
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

const REPO_ROOT = path.resolve(__dirname, "../../../../../../../../");

function read(relative: string): string {
  return readFileSync(path.join(REPO_ROOT, relative), "utf8");
}

describe("ContactContractsOverview — sourceKind filter regression", () => {
  const OVERVIEW_PATH = "apps/web/src/app/portal/contacts/[id]/ContactContractsOverview.tsx";

  it("neimportuje ADVISOR_PRODUCT_SOURCE_KINDS (jinak by se filter mohl tiše vrátit)", () => {
    const src = read(OVERVIEW_PATH);
    const importLineRe =
      /import\s*\{[^}]*\bADVISOR_PRODUCT_SOURCE_KINDS\b[^}]*\}\s*from\s*["'][^"']+["']/;
    expect(
      importLineRe.test(src),
      "ContactContractsOverview nesmí importovat ADVISOR_PRODUCT_SOURCE_KINDS — poradce MUSÍ vidět všechny smlouvy (manual, ai_review, document, import).",
    ).toBe(false);
  });

  it("nefiltruje seznam smluv podle c.sourceKind", () => {
    const src = read(OVERVIEW_PATH);
    const filterRe =
      /\.filter\s*\(\s*\([^)]*\)\s*=>\s*[^)]*\.sourceKind\b[^)]*\)/;
    expect(
      filterRe.test(src),
      "ContactContractsOverview nesmí filtrovat smlouvy podle sourceKind — historický bug schovával 'document' a 'import' smlouvy před poradcem.",
    ).toBe(false);
  });

  it("pořád používá mapContractToCanonicalProduct pro zobrazení (nezlomili jsme mapping)", () => {
    const src = read(OVERVIEW_PATH);
    expect(src).toMatch(/\bmapContractToCanonicalProduct\b/);
  });
});

describe("KPI guardrail — Osobní AUM / měsíční cashflow drží přísný filter", () => {
  const KPI_PATH = "apps/web/src/lib/client-portfolio/contact-overview-kpi.ts";

  it("ADVISOR_PRODUCT_SOURCE_KINDS v KPI modulu stále obsahuje právě manual + ai_review", () => {
    const src = read(KPI_PATH);
    expect(src).toMatch(
      /export\s+const\s+ADVISOR_PRODUCT_SOURCE_KINDS\s*=\s*new\s+Set\(\s*\[\s*"manual"\s*,\s*"ai_review"\s*\]\s*\)/,
    );
  });

  it("KPI funkce stále filtrují vstupní smlouvy přes ADVISOR_PRODUCT_SOURCE_KINDS", () => {
    const src = read(KPI_PATH);
    const re =
      /\.filter\s*\(\s*\([^)]*\)\s*=>\s*ADVISOR_PRODUCT_SOURCE_KINDS\.has\(\s*[^)]*\.sourceKind\s*\)\s*\)/;
    expect(
      re.test(src),
      "Osobní AUM / měsíční KPI NESMÍ počítat drafty z document-extraction (sourceKind='document') — ty nejsou potvrzené poradcem.",
    ).toBe(true);
  });
});
