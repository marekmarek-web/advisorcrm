/**
 * Build company (business) FA report HTML. Aligned with PHASE1_AUDIT section 4.
 */

import type { CompanyFaPayload } from "@/lib/analyses/company-fa/types";
import {
  step1Kpi,
  step2Kpi,
  getRiskAuditTips,
  directorInsuranceRec,
  recalcStrategy,
} from "@/lib/analyses/company-fa/calculations";
import {
  formatCzk,
  formatCurrencyDaily,
  formatCurrencyMonthly,
  formatCurrencyYearly,
  formatInteger,
  formatPercent,
} from "@/lib/analyses/financial/formatters";
import { PDF_STYLES } from "@/lib/analyses/financial/report";

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

export function buildCompanyReportHTML(data: CompanyFaPayload): string {
  const today = new Date().toLocaleDateString("cs-CZ");
  const companyName = data.company?.name || "Společnost";
  const directorName =
    data.directors?.length > 0 && data.directors[0]?.name
      ? data.directors[0].name
      : "—";

  const kpi1 = step1Kpi(data);
  const kpi2 = step2Kpi(data);
  const company = data.company ?? {};
  const finance = data.finance ?? {};
  const risks = data.risks ?? {};
  const riskKeys = ["property", "interruption", "liability", "director", "fleet", "cyber"] as const;
  const covered = riskKeys.filter((k) => {
    const v = risks[k];
    return typeof v === "boolean" ? v : (v as { has?: boolean })?.has;
  }).length;
  const auditTips = getRiskAuditTips(data);
  const insRec = directorInsuranceRec(data);
  const { investments: investmentsWithFv } = recalcStrategy(data);

  const strategyLabels: Record<string, string> = {
    conservative: "Konzervativní",
    balanced: "Vyvážený",
    dynamic: "Dynamický",
  };
  const strategyLabel = strategyLabels[data.strategy?.profile ?? "balanced"] ?? "Vyvážený";

  let html = `
<section class="pdf-page pdf-title-page">
  <div style="text-align: center;">
    <h1 class="h1" style="font-size: 40px; margin-bottom: 10px;">FINANČNÍ PLÁNOVÁNÍ</h1>
    <p style="font-size: 18px; color: #64748b; margin-bottom: 50px;">Firemní analýza</p>
    <div style="display: inline-block; text-align: left; background: #f8fafc; padding: 30px; border-radius: 12px; border: 1px solid #e2e8f0; min-width: 300px;">
      <p style="margin-bottom: 10px; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: bold;">Společnost</p>
      <h2 style="font-size: 24px; color: #0f172a; margin: 0 0 10px 0;">${escapeHtml(companyName)}</h2>
      <p style="margin-bottom: 10px; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: bold;">Jednatel</p>
      <p style="font-size: 16px; color: #0f172a; margin: 0 0 20px 0;">${escapeHtml(directorName)}</p>
      <p style="margin-bottom: 10px; color: #64748b; font-size: 12px; text-transform: uppercase; font-weight: bold;">Datum vyhotovení</p>
      <h3 style="font-size: 16px; color: #0f172a; margin: 0;">${today}</h3>
    </div>
  </div>
</section>

<section class="pdf-page">
  <div class="pdf-section">
    <div class="h2">Přehled situace</div>
    <div class="kpi">
      <div class="box"><span class="lbl">Zaměstnanci</span><div class="val">${formatInteger(company.employees ?? 0)}</div></div>
      <div class="box"><span class="lbl">Mzdový fond (měs.)</span><div class="val">${formatCurrencyMonthly(kpi1.wageFund)}</div></div>
      <div class="box"><span class="lbl">Tržby (rok)</span><div class="val">${formatCurrencyYearly(finance.revenue ?? 0)}</div></div>
      <div class="box"><span class="lbl">Zisk / EBITDA</span><div class="val">${formatCzk(finance.profit ?? 0)}</div></div>
      <div class="box"><span class="lbl">Rezerva</span><div class="val">${formatCzk(finance.reserve ?? 0)}</div></div>
      <div class="box"><span class="lbl">Runway</span><div class="val">${kpi2.runway} měs.</div></div>
      <div class="box"><span class="lbl">Splátky úvěrů (měs.)</span><div class="val">${formatCurrencyMonthly(finance.loanPayment ?? 0)}</div></div>
      <div class="box"><span class="lbl">3. kategorie</span><div class="val">${formatInteger(company.cat3 ?? 0)}</div></div>
      <div class="box"><span class="lbl">TOP klient (%)</span><div class="val">${formatPercent((company.topClient ?? 0) / 100, 0)}</div></div>
    </div>
  </div>
</section>

<section class="pdf-page">
  <div class="pdf-section">
    <div class="h2">Firemní pojištění</div>
    <p>Pokrytí rizik: ${covered}/6</p>
    ${auditTips.length > 0 ? `<p style="font-size: 10pt; color: #b45309;">Tip na audit: ${escapeHtml(auditTips.join("; "))}</p>` : ""}
    <div class="risk-matrix">
      ${riskKeys
        .map(
          (k) =>
            `<div class="insurance-item">${k}: ${
              (typeof risks[k] === "boolean" ? risks[k] : (risks[k] as { has?: boolean })?.has)
                ? "Ano"
                : "Ne"
            }</div>`
        )
        .join("")}
    </div>
  </div>
</section>

<section class="pdf-page">
  <div class="pdf-section">
    <div class="h2">Cíle a strategie</div>
    <p><strong>Profil:</strong> ${strategyLabel}</p>
    <table class="table">
      <thead><tr><th>Produkt</th><th>Typ</th><th>Vklad</th><th>Výnos</th><th>FV</th></tr></thead>
      <tbody>
        ${investmentsWithFv
          .map(
            (inv) =>
              `<tr>
                <td>${escapeHtml(inv.productKey)}</td>
                <td>${inv.type}</td>
                <td style="text-align:right; font-variant-numeric: tabular-nums;">${formatCzk(inv.amount ?? 0)}</td>
                <td style="text-align:center;">${formatPercent(inv.annualRate ?? 0, 1)}</td>
                <td style="text-align:right; font-variant-numeric: tabular-nums;">${formatCzk(inv.computed?.fv ?? 0)}</td>
              </tr>`
          )
          .join("")}
      </tbody>
    </table>
  </div>
</section>

<section class="pdf-page">
  <div class="pdf-section">
    <div class="h2">Zajištění příjmů – jednatel</div>
    <p>Smrt: ${formatCzk(data.directorIns?.death ?? 0)}, Invalidita: ${formatCzk(data.directorIns?.invalidity ?? 0)}, PN/den: ${formatCurrencyDaily(data.directorIns?.sick ?? 0)}.</p>
    <p style="font-size: 10pt; color: #475569;">Doporučené: smrt ${formatCzk(Math.round(insRec.recDeath))}, invalidita ${formatCzk(Math.round(insRec.recInv))}, PN ${formatCurrencyDaily(insRec.recSickPerDay)}.</p>
    ${insRec.invGap.gap > 0 ? `<p style="font-size: 10pt; color: #b45309;">Gap invalidita: ${formatCzk(Math.round(insRec.invGap.gap))}</p>` : ""}
    ${insRec.isOsvc ? `<p style="font-size: 10pt; color: #b45309;">OSVČ: zvažte nemocenské pojištění.</p>` : ""}
  </div>
</section>
`;

  return html;
}
