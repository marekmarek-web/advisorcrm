/**
 * Jednotné mapování volitelných polí z extraktu do `contracts.portfolio_attributes`.
 * Nevyplňuje odhadované metriky — jen pokud extrakt pole spolehlivě dodává.
 */

export type CoverageLineUi = { label?: string; amount?: string; description?: string };

export function buildPortfolioAttributesFromExtracted(extracted: unknown): Record<string, unknown> {
  if (!extracted || typeof extracted !== "object") return {};
  const p = extracted as Record<string, unknown>;
  const out: Record<string, unknown> = {};
  const loan = p.loanAmount ?? p.loanPrincipal ?? p.principalAmount ?? p.creditAmount;
  if (loan != null && loan !== "") out.loanPrincipal = typeof loan === "string" ? loan : String(loan);
  const sum = p.sumInsured ?? p.totalCoverage ?? p.insuredAmount;
  if (sum != null && sum !== "") out.sumInsured = typeof sum === "string" ? sum : String(sum);
  if (p.insuredPersons != null) out.insuredPersons = p.insuredPersons;
  if (p.vehicleRegistration != null) out.vehicleRegistration = String(p.vehicleRegistration);
  if (p.propertyAddress != null) out.propertyAddress = String(p.propertyAddress);

  const subRaw = p.subcategory ?? p.portfolioSubcategory ?? p.productSubcategory;
  if (typeof subRaw === "string" && subRaw.trim()) {
    const s = subRaw.trim().toLowerCase();
    if (s.includes("child") || s === "child_coverage" || s.includes("dětsk")) {
      out.subcategory = "child_coverage";
    }
  }

  const cov = p.coverageLines ?? p.coverages ?? p.insuranceCoverages;
  if (Array.isArray(cov) && cov.length > 0) {
    const lines: CoverageLineUi[] = [];
    for (const row of cov.slice(0, 24)) {
      if (row && typeof row === "object") {
        const r = row as Record<string, unknown>;
        const label =
          typeof r.label === "string"
            ? r.label
            : typeof r.name === "string"
              ? r.name
              : typeof r.coverageName === "string"
                ? r.coverageName
                : undefined;
        const amount =
          r.amount != null && r.amount !== ""
            ? String(r.amount)
            : r.sumInsured != null
              ? String(r.sumInsured)
              : undefined;
        const description = typeof r.description === "string" ? r.description : undefined;
        if (label || amount || description) lines.push({ label, amount, description });
      } else if (typeof row === "string" && row.trim()) {
        lines.push({ label: row.trim() });
      }
    }
    if (lines.length) out.coverageLines = lines;
  }

  const fix = p.fixationUntil ?? p.rateFixationEnd ?? p.interestFixationUntil ?? p.fixationEndDate;
  if (typeof fix === "string" && fix.trim()) out.loanFixationUntil = fix.trim();

  const mat = p.maturityDate ?? p.loanMaturity ?? p.splatnost ?? p.loanEndDate;
  if (typeof mat === "string" && mat.trim()) out.loanMaturityDate = mat.trim();

  return out;
}
