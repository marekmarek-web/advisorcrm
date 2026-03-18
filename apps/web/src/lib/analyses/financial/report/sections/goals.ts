import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, fmtMonthly, fmtBigCzk, fmtPct } from '../helpers';

export function renderGoals(ctx: SectionCtx): string {
  const { data } = ctx;
  const num = nextSection(ctx.sectionCounter);

  const goals = data.goals ?? [];
  const investments = (data.investments ?? []).filter(
    (inv) => inv.amount > 0 && inv.productKey !== 'algoimperial',
  );

  const totalMonthlyInvestment = investments
    .filter((inv) => inv.type === 'monthly')
    .reduce((s, i) => s + i.amount, 0);

  const totalGoalTarget = goals.reduce((s, g) => s + (g.computed?.fvTarget ?? 0), 0);

  const totalPortfolioFV = investments.reduce((s, inv) => {
    const rate = inv.annualRate ?? 0.08;
    const months = (inv.years ?? 20) * 12;
    if (inv.type === 'monthly' || inv.type === 'pension') {
      const r = rate / 12;
      return s + inv.amount * ((Math.pow(1 + r, months) - 1) / r);
    }
    return s + inv.amount * Math.pow(1 + rate, inv.years ?? 20);
  }, 0);

  const coveragePct = totalGoalTarget > 0 ? Math.min(100, (totalPortfolioFV / totalGoalTarget) * 100) : 0;

  const goalRows = goals.map((g) => {
    const target = g.computed?.fvTarget ?? 0;
    const pmt = g.computed?.pmt ?? 0;
    const coverage = target > 0 ? Math.min(100, (totalPortfolioFV / target) * 100) : 0;
    const horizonYears = g.years ?? g.horizon ?? 20;

    return `<div class="goal-row">
      <div class="goal-row-head">
        <div>
          <div class="goal-name">${g.name ?? 'Cíl'}</div>
          <div class="goal-horizon">Horizont: ${horizonYears} let</div>
        </div>
        <div style="text-align:right">
          <div class="goal-amt-val">${fmtBigCzk(target)}</div>
          <div class="goal-monthly">${pmt > 0 ? `měsíčně ${fmtMonthly(pmt)}` : ''}</div>
        </div>
      </div>
      <div class="goal-track"><div class="goal-fill" style="width:${coverage}%"></div></div>
      <div class="goal-meta"><span>0 Kč</span><span class="goal-covered">${fmtPct(coverage, 0)} pokryto</span><span>${fmtBigCzk(target)}</span></div>
    </div>`;
  }).join('');

  return `<section class="page" id="cile">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Finanční cíle</div>
      <div class="sec-title">Cíle &amp; plánování</div>
      <div class="sec-desc">Přehled vašich finančních cílů, potřebných úspor a aktuální míry pokrytí investičním portfoliem.</div>
    </div>

    <div class="kpi-row kpi-row-3">
      <div class="kpi-cell"><div class="kpi-label">Celkem cílová částka</div><div class="kpi-value">${fmtBigCzk(totalGoalTarget)}</div></div>
      <div class="kpi-cell green-cell"><div class="kpi-label">Projekce portfolia</div><div class="kpi-value">${fmtBigCzk(totalPortfolioFV)}</div></div>
      <div class="kpi-cell gold-cell"><div class="kpi-label">Pokrytí cílů</div><div class="kpi-value">${fmtPct(coveragePct, 0)}</div></div>
    </div>

    ${goalRows}

    ${goals.some((g) => g.name?.toLowerCase().includes('rent')) ? `
    <div class="formula-box">
      <div class="formula-title">Výpočet — pravidlo 4 %</div>
      <div class="formula-expr">Renta = Úspory × 4 %</div>
      <div class="formula-desc">Předpokládá se, že roční výběr 4 % z celkového majetku umožní financovat životní styl po dobu 25+ let bez vyčerpání kapitálu. Zohledňuje průměrnou inflaci 3 % a výnos portfolia 7 %.</div>
    </div>` : ''}

    ${totalMonthlyInvestment > 0 ? `
    <div class="callout success" style="margin-top:var(--s5,20px)">
      <span class="callout-icon">✓</span>
      <div><strong>Aktuální měsíční investice: ${fmtMonthly(totalMonthlyInvestment)}</strong>
      Vaše pravidelné investice směřují k pokrytí stanovených cílů.</div>
    </div>` : ''}
  </div>
</section>`;
}
