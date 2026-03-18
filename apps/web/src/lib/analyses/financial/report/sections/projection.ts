import type { SectionCtx } from '../types';
import { nextSection, fmtBigCzk, renderProjectionSVG } from '../helpers';
import type { InvestmentEntry } from '../../types';

export function renderProjection(ctx: SectionCtx): string {
  const { data, theme } = ctx;
  const num = nextSection(ctx.sectionCounter);

  const investments = (data.investments ?? []).filter(
    (inv: InvestmentEntry) => inv.amount > 0 && inv.productKey !== 'algoimperial',
  );

  let totalFV = 0;
  let maxHorizon = 0;
  let monthlyTotal = 0;
  let lumpTotal = 0;

  investments.forEach((inv: InvestmentEntry) => {
    const rate = inv.annualRate ?? 0.08;
    const years = inv.years ?? 20;
    maxHorizon = Math.max(maxHorizon, years);
    const months = years * 12;
    if (inv.type === 'monthly' || inv.type === 'pension') {
      const r = rate / 12;
      totalFV += inv.amount * ((Math.pow(1 + r, months) - 1) / r);
      monthlyTotal += inv.amount;
    } else {
      totalFV += inv.amount * Math.pow(1 + rate, years);
      lumpTotal += inv.amount;
    }
  });

  const totalInvested = monthlyTotal * maxHorizon * 12 + lumpTotal;
  const gain = totalFV - totalInvested;

  const chartSvg = renderProjectionSVG(totalFV, maxHorizon, monthlyTotal, theme);

  return `<section class="page" id="projekce">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Projekce</div>
      <div class="sec-title">Růstová projekce</div>
      <div class="sec-desc">Odhad budoucí hodnoty investic na základě průměrného ročního zhodnocení a pravidelných vkladů.</div>
    </div>

    <div class="kpi-row kpi-row-3" style="margin-bottom:var(--s8,32px)">
      <div class="kpi-cell"><div class="kpi-label">Celkem investováno</div><div class="kpi-value">${fmtBigCzk(totalInvested)}</div></div>
      <div class="kpi-cell green-cell"><div class="kpi-label">Budoucí hodnota (FV)</div><div class="kpi-value">${fmtBigCzk(totalFV)}</div></div>
      <div class="kpi-cell gold-cell"><div class="kpi-label">Čistý výnos</div><div class="kpi-value">${fmtBigCzk(gain)}</div></div>
    </div>

    <div class="chart-wrap">
      <div class="chart-title"><span>Projekce hodnoty portfolia</span><span class="chart-title-right">${maxHorizon} let</span></div>
      ${chartSvg}
    </div>

    <div class="callout info" style="margin-top:var(--s4,16px)">
      <span class="callout-icon">ⓘ</span>
      <div><strong>Upozornění</strong>
      Projekce vychází z předpokládaného průměrného ročního výnosu a nezohledňuje inflaci, daně ani poplatky. Skutečné výnosy se mohou lišit. Minulá výkonnost není zárukou budoucích výnosů. Investice nesou riziko ztráty hodnoty.</div>
    </div>
  </div>
</section>`;
}
