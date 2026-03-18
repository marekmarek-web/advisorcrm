import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, fmtMonthly, fmtBigCzk, esc } from '../helpers';

export function renderCompanySnapshot(ctx: SectionCtx): string {
  const { data } = ctx;
  const num = nextSection(ctx.sectionCounter);

  const cf = data.companyFinance ?? {};
  const revenue = cf.revenue ?? 0;
  const profit = cf.profit ?? 0;
  const costs = revenue - profit;
  const employees = data.companyBenefits?.employeeCount ?? 0;
  const benefitPerPerson = data.companyBenefits?.amountPerPerson ?? 0;
  const benefitTotal = benefitPerPerson * employees;

  return `<section class="page" id="co-snapshot">
  <div class="page-bar" style="background:var(--gold-500,#d97706)"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number gold">${num} — Executive snapshot</div>
      <div class="sec-title">Přehled společnosti</div>
      <div class="sec-desc">Klíčové ukazatele, příležitosti a rychlé výhry pro vaši firmu.</div>
    </div>

    <div class="kpi-row kpi-row-3">
      <div class="kpi-cell"><div class="kpi-label">Roční obrat</div><div class="kpi-value">${fmtBigCzk(revenue)}</div></div>
      <div class="kpi-cell"><div class="kpi-label">Roční náklady</div><div class="kpi-value">${fmtBigCzk(costs)}</div></div>
      <div class="kpi-cell ${profit >= 0 ? 'green-cell' : 'red-cell'}"><div class="kpi-label">Zisk</div><div class="kpi-value">${fmtBigCzk(profit)}</div></div>
    </div>
    <div class="kpi-row kpi-row-3">
      <div class="kpi-cell"><div class="kpi-label">Zaměstnanci</div><div class="kpi-value">${employees}</div></div>
      <div class="kpi-cell gold-cell"><div class="kpi-label">Benefity celkem</div><div class="kpi-value">${fmtMonthly(benefitTotal)}</div></div>
      <div class="kpi-cell dark-cell"><div class="kpi-label">Rezerva firmy</div><div class="kpi-value c-white" style="font-size:18px">${fmtBigCzk(cf.reserve ?? 0)}</div></div>
    </div>

    <div style="margin-top:var(--s6,24px)">
      <div class="tbl-wrap">
        <div class="tbl-cap"><span class="tbl-cap-title">TOP 3 příležitosti</span></div>
        <div>
          <div class="opp-row"><div class="opp-num">1</div><div class="opp-name">Optimalizace benefitů</div><div class="opp-val">+${fmtMonthly(Math.round(benefitTotal * 0.21))}</div></div>
          <div class="opp-row"><div class="opp-num">2</div><div class="opp-name">Firemní investiční účet</div><div class="opp-val">+5–8 % p.a.</div></div>
          <div class="opp-row"><div class="opp-num">3</div><div class="opp-name">Pojistný audit</div><div class="opp-val">Úspora 15–30 %</div></div>
        </div>
      </div>
    </div>

    <div class="callout success" style="margin-top:var(--s4,16px)">
      <span class="callout-icon">⚡</span>
      <div><strong>Quick Win — Benefity</strong>
      Převedením části hrubé mzdy na zaměstnanecké benefity ušetří firma na odvodech i zaměstnanec na dani. Odhadovaná úspora: ${fmtMonthly(Math.round(benefitTotal * 0.21))} při stávajícím objemu benefitů.</div>
    </div>
  </div>
</section>`;
}
