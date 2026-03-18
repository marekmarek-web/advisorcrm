import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, fmtMonthly, fmtPct, colorForIndex, renderDonutSVG, investmentLabel, esc } from '../helpers';
import { FUND_DETAILS } from '../../constants';
import { getStrategyProfileLabel } from '../../formatters';
import type { InvestmentEntry } from '../../types';

export function renderPortfolio(ctx: SectionCtx): string {
  const { data, theme } = ctx;
  const num = nextSection(ctx.sectionCounter);

  const investments = (data.investments ?? []).filter(
    (inv: InvestmentEntry) => inv.amount > 0 && inv.productKey !== 'algoimperial',
  );

  const totalAmount = investments.reduce((s: number, i: InvestmentEntry) => s + i.amount, 0);

  const items = investments.map((inv: InvestmentEntry, idx: number) => {
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
  );

  const legend = items.map((item) => `
    <div class="legend-row">
      <div class="legend-swatch" style="background:${item.color}"></div>
      <span class="legend-name">${esc(item.name)}</span>
      <span class="legend-pct">${fmtPct(item.weight, 0)}</span>
    </div>
  `).join('');

  const profile = getStrategyProfileLabel(data.strategy?.profile ?? 'balanced');

  return `<section class="page" id="portfolio">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Portfolio</div>
      <div class="sec-title">Investiční portfolio</div>
      <div class="sec-desc">Struktura vašich investic, alokace a rizikový profil.</div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-cap"><span class="tbl-cap-title">Přehled investic</span></div>
      <table class="dt">
        <thead><tr><th>Produkt</th><th>Typ</th><th class="r">Částka</th><th class="r">Váha</th></tr></thead>
        <tbody>
          ${rows}
          <tr class="total"><td>Celkem</td><td></td><td class="r">${fmtCzk(totalAmount)}</td><td class="r">100 %</td></tr>
        </tbody>
      </table>
    </div>

    <div class="chart-wrap">
      <div class="chart-title"><span>Alokace portfolia</span><span class="chart-title-right">${investments.length} produktů</span></div>
      <div class="alloc-section">
        ${donut}
        <div class="alloc-legend">${legend}</div>
      </div>
    </div>

    <div class="callout info">
      <span class="callout-icon">📊</span>
      <div><strong>Investiční profil: ${esc(profile)}</strong>
      Portfolio je navrženo tak, aby odpovídalo vašemu rizikovému profilu a investičnímu horizontu.</div>
    </div>
  </div>
</section>`;
}
