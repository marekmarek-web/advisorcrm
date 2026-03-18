import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, fmtMonthly, fmtBigCzk, esc, investmentLabel, colorForIndex, fmtPct, renderDonutSVG } from '../helpers';
import { FUND_DETAILS } from '../../constants';

export function renderCompanyPortfolio(ctx: SectionCtx): string {
  const { data, theme } = ctx;
  const num = nextSection(ctx.sectionCounter);

  const companyInvestments = (data.investments ?? []).filter(
    (inv) => inv.amount > 0 && inv.productKey !== 'algoimperial',
  );

  if (companyInvestments.length === 0) {
    return `<section class="page" id="co-portfolio">
  <div class="page-bar" style="background:var(--gold-500,#d97706)"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number gold">${num} — Firemní portfolio</div>
      <div class="sec-title">Investiční portfolio firmy</div>
    </div>
    <div class="callout info"><span class="callout-icon">ⓘ</span><div>Firma aktuálně nemá žádné investiční produkty.</div></div>
  </div>
</section>`;
  }

  const totalAmount = companyInvestments.reduce((s, i) => s + i.amount, 0);

  const items = companyInvestments.map((inv, idx) => {
    const detail = FUND_DETAILS[inv.productKey];
    const name = detail?.name ?? inv.productKey;
    const weight = totalAmount > 0 ? (inv.amount / totalAmount) * 100 : 0;
    return { inv, name, weight, color: colorForIndex(idx, theme), manager: detail?.manager ?? '' };
  });

  const rows = items.map((item) => {
    const { inv, name } = item;
    return `<tr>
      <td class="bold">${esc(name)}</td>
      <td class="muted">${investmentLabel(inv)}</td>
      <td class="r">${inv.type === 'lump' ? fmtCzk(inv.amount) : fmtMonthly(inv.amount)}</td>
      <td class="r">${fmtPct(item.weight, 1)}</td>
    </tr>`;
  }).join('');

  const donut = renderDonutSVG(
    items.map((item) => ({ label: item.name, weight: item.weight, color: item.color })),
    140,
  );

  const legend = items.map((item) => `
    <div class="legend-row">
      <div class="legend-swatch" style="background:${item.color}"></div>
      <span class="legend-name">${esc(item.name)}</span>
      <span class="legend-pct">${fmtPct(item.weight, 0)}</span>
    </div>
  `).join('');

  return `<section class="page" id="co-portfolio">
  <div class="page-bar" style="background:var(--gold-500,#d97706)"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number gold">${num} — Firemní portfolio</div>
      <div class="sec-title">Investiční portfolio firmy</div>
      <div class="sec-desc">Přehled investičních produktů a alokace firemního kapitálu.</div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-cap"><span class="tbl-cap-title">Firemní investice</span></div>
      <table class="dt">
        <thead><tr><th>Produkt</th><th>Typ</th><th class="r">Částka</th><th class="r">Váha</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total"><td>Celkem</td><td></td><td class="r">${fmtCzk(totalAmount)}</td><td class="r">100 %</td></tr>
        </tbody>
      </table>
    </div>

    <div class="chart-wrap">
      <div class="chart-title"><span>Alokace firemního portfolia</span></div>
      <div class="alloc-section">${donut}<div class="alloc-legend">${legend}</div></div>
    </div>
  </div>
</section>`;
}
