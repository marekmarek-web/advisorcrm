import type { SectionCtx } from "../types";
import { nextSection, esc } from "../helpers";

export function renderCanonicalCrmInvestments(ctx: SectionCtx): string {
  const rows = ctx.canonicalInvestmentOverview ?? [];
  if (rows.length === 0) return "";

  const num = nextSection(ctx.sectionCounter);

  const body = rows
    .map((r) => {
      const fvCell = r.futureValueFormatted
        ? `<div class="r bold">${esc(r.futureValueFormatted)}</div>
           <div class="muted" style="margin-top:4px;text-align:right;max-width:240px;margin-left:auto;font-size:9pt;line-height:1.35;">
             ${r.futureValueNotes.map((t) => `<div>${esc(t)}</div>`).join("")}
           </div>`
        : `<span class="muted">—</span>`;

      return `<tr>
        <td>
          <div class="bold">${esc(r.productTitle)}</div>
          <div class="muted" style="font-size:9pt">${esc(r.segmentLabel)}</div>
        </td>
        <td class="muted">${r.institution ? esc(r.institution) : "—"}</td>
        <td class="muted">${r.fundOrStrategy ? esc(r.fundOrStrategy) : "—"}</td>
        <td>${esc(r.contributionSummary)}</td>
        <td class="muted">${r.horizonLabel ? esc(r.horizonLabel) : "—"}</td>
        <td style="vertical-align:top">${fvCell}</td>
      </tr>`;
    })
    .join("");

  return `<section class="page" id="evidence-investments">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Evidence</div>
      <div class="sec-title">Investice z evidence smluv</div>
      <div class="sec-desc">
        Přehled investičních a penzijních produktů podle stejných údajů jako v klientském portálu a v záložce Produkty u klienta.
        Odhad budoucí hodnoty vychází ze stejného modelu jako u zveřejněného portfolia — pouze tam, kde jsou v evidenci vyplněné potřebné údaje.
      </div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-cap"><span class="tbl-cap-title">Instituce, produkt, platba, horizont</span></div>
      <table class="dt">
        <thead>
          <tr>
            <th>Produkt</th>
            <th>Instituce</th>
            <th>Fond / strategie</th>
            <th>Platba</th>
            <th>Horizont</th>
            <th class="r">Odhad budoucí hodnoty</th>
          </tr>
        </thead>
        <tbody>${body}</tbody>
      </table>
    </div>

    <div class="callout info">
      <span class="callout-icon">ℹ️</span>
      <div>
        <strong>Orientační odhad</strong>
        Hodnota není zárukou budoucího výnosu. U řádků bez čísla chybí v evidenci kombinace údajů potřebných pro model (např. horizont, příspěvek nebo zdroj sazby z fondu či obecné kategorie).
      </div>
    </div>
  </div>
</section>`;
}
