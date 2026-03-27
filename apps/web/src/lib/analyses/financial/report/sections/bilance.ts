import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, fmtMonthly, fmtBigCzk } from '../helpers';
import { totalIncome, totalExpense, totalAssetsFromValues, totalLiabilitiesFromValues } from '../../calculations';
import type { CashflowIncomes, CashflowExpenses } from '../../types';

function incomeItems(inc: CashflowIncomes): Array<{ name: string; amount: number }> {
  const items: Array<{ name: string; amount: number }> = [];
  if (inc.main) items.push({ name: 'Hlavní příjem', amount: inc.main });
  if (inc.partner) items.push({ name: 'Příjem partnera', amount: inc.partner });
  (inc.otherDetails ?? []).forEach((d) => {
    if (d.amount > 0) items.push({ name: d.desc || 'Ostatní', amount: d.amount });
  });
  return items;
}

function expenseItems(exp: CashflowExpenses): Array<{ name: string; amount: number }> {
  const items: Array<{ name: string; amount: number }> = [];
  if (exp.housing) items.push({ name: 'Bydlení', amount: exp.housing });
  if (exp.energy) items.push({ name: 'Energie', amount: exp.energy });
  if (exp.food) items.push({ name: 'Jídlo', amount: exp.food });
  if (exp.transport) items.push({ name: 'Doprava', amount: exp.transport });
  if (exp.children) items.push({ name: 'Děti', amount: exp.children });
  if (exp.insurance) items.push({ name: 'Pojištění', amount: exp.insurance });
  if (exp.loans) items.push({ name: 'Splátky', amount: exp.loans });
  (exp.otherDetails ?? []).forEach((d) => {
    if (d.amount > 0) items.push({ name: d.desc || 'Ostatní', amount: d.amount });
  });
  return items;
}

export function renderBilance(ctx: SectionCtx): string {
  const { data } = ctx;
  const a = data.assets ?? { cash: 0, investments: 0, pension: 0, realEstate: 0, other: 0 };
  const l = data.liabilities ?? { mortgage: 0, loans: 0, other: 0 };
  const totalA = totalAssetsFromValues(a);
  const totalL = totalLiabilitiesFromValues(l);
  const netWorth = totalA - totalL;

  const cf = data.cashflow ?? { incomes: {}, expenses: {}, reserveCash: 0, reserveTargetMonths: 6, incomeType: 'zamestnanec', incomeGross: 0 };
  const incTotal = totalIncome(cf.incomes ?? {});
  const expTotal = totalExpense(cf.expenses ?? {});
  const netCashflow = incTotal - expTotal;
  const reserve = cf.reserveCash ?? 0;
  const idealReserve = expTotal * 6;

  const num = nextSection(ctx.sectionCounter);

  const assetsRows: [string, number][] = [
    ['Hotovost & běžné účty', a.cash ?? 0],
    ['Investice', a.investments ?? 0],
    ['Penzijní spoření', a.pension ?? 0],
    ['Nemovitosti', a.realEstate ?? 0],
    ['Ostatní', a.other ?? 0],
  ];
  const liabilitiesRows: [string, number][] = [
    ['Hypotéka', l.mortgage ?? 0],
    ['Úvěry', l.loans ?? 0],
    ['Ostatní', l.other ?? 0],
  ];

  const incItems = incomeItems(cf.incomes ?? {});
  const expItems = expenseItems(cf.expenses ?? {});

  const cfItemsHtml = (items: Array<{ name: string; amount: number }>, isMinus = false) =>
    items
      .filter((i) => i.amount > 0)
      .map((i) => `<li class="cf-item"><span class="cf-name">${i.name}</span><span class="cf-amt ${isMinus ? 'c-neg' : ''}">${isMinus ? '−' : ''}${fmtMonthly(i.amount)}</span></li>`)
      .join('');

  return `<section class="page" id="bilance">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Bilance &amp; Cashflow</div>
      <div class="sec-title">Finanční bilance</div>
      <div class="sec-desc">Přehled vašeho majetku, závazků a měsíčního cashflow s vyhodnocením finanční rezervy.</div>
    </div>

    <div class="kpi-row kpi-row-4">
      <div class="kpi-cell"><div class="kpi-label">Celková aktiva</div><div class="kpi-value">${fmtBigCzk(totalA)}</div></div>
      <div class="kpi-cell red-cell"><div class="kpi-label">Závazky</div><div class="kpi-value">${fmtBigCzk(totalL)}</div></div>
      <div class="kpi-cell ${netWorth >= 0 ? 'green-cell' : 'red-cell'}"><div class="kpi-label">Čisté jmění</div><div class="kpi-value">${fmtBigCzk(netWorth)}</div></div>
      <div class="kpi-cell gold-cell"><div class="kpi-label">Měsíční přebytek</div><div class="kpi-value">${fmtMonthly(netCashflow)}</div></div>
    </div>

    <div class="g2" style="margin-bottom:var(--s6,24px)">
      <div class="tbl-wrap">
        <div class="tbl-cap"><span class="tbl-cap-title">Aktiva</span></div>
        <table class="dt">
          <thead><tr><th>Položka</th><th class="r">Hodnota</th></tr></thead>
          <tbody>
            ${assetsRows.map(([n, v]) => `<tr><td>${n}</td><td class="r">${fmtCzk(v)}</td></tr>`).join('')}
            <tr class="total"><td>Celkem aktiva</td><td class="r">${fmtCzk(totalA)}</td></tr>
          </tbody>
        </table>
      </div>
      <div class="tbl-wrap">
        <div class="tbl-cap"><span class="tbl-cap-title">Závazky</span></div>
        <table class="dt">
          <thead><tr><th>Položka</th><th class="r">Zůstatek</th></tr></thead>
          <tbody>
            ${liabilitiesRows.map(([n, v]) => `<tr><td>${n}</td><td class="r">${fmtCzk(v)}</td></tr>`).join('')}
            <tr class="total"><td>Celkem závazky</td><td class="r">${fmtCzk(totalL)}</td></tr>
          </tbody>
        </table>
      </div>
    </div>

    <div class="g2">
      <div class="card has-top-border-navy">
        <div class="card-title">Měsíční příjmy</div>
        <ul class="cf-list">
          ${cfItemsHtml(incItems)}
          <li class="cf-item total"><span class="cf-name">Celkem příjmy</span><span class="cf-amt c-pos">${fmtMonthly(incTotal)}</span></li>
        </ul>
      </div>
      <div class="card has-top-border-navy">
        <div class="card-title">Měsíční výdaje</div>
        <ul class="cf-list">
          ${cfItemsHtml(expItems, true)}
          <li class="cf-item total"><span class="cf-name">Celkem výdaje</span><span class="cf-amt c-neg">−${fmtMonthly(expTotal)}</span></li>
        </ul>
      </div>
    </div>

    <div class="g2" style="margin-top:var(--s5,20px)">
      <div class="card has-top-border-gold card-padded">
        <div class="card-title">Finanční rezerva</div>
        <div style="font-size:28px;font-weight:700;letter-spacing:-0.5px;margin:8px 0">${fmtCzk(reserve)}</div>
        <div style="font-size:12px;color:var(--stone-400,#8c959f)">Ideální rezerva (6× měsíční výdaje): <strong>${fmtCzk(idealReserve)}</strong></div>
        <div style="margin-top:10px;height:5px;background:var(--stone-200,#e7e5e4);border-radius:99px;overflow:hidden"><div style="height:100%;width:${Math.min(100, idealReserve > 0 ? (reserve / idealReserve) * 100 : 0)}%;border-radius:99px;background:linear-gradient(90deg,var(--gold-500,#c9a84c),var(--green-600,#16a34a))"></div></div>
      </div>
      <div class="card has-top-border-green card-padded">
        <div class="card-title">Měsíční přebytek</div>
        <div class="kpi-value ${netCashflow >= 0 ? 'c-pos' : 'c-neg'}" style="margin:8px 0">${netCashflow >= 0 ? '+' : '−'}${fmtMonthly(Math.abs(netCashflow))}</div>
        <div style="font-size:12px;color:var(--stone-400,#8c959f)">${netCashflow >= 0 ? 'Máte prostor pro investice a spoření.' : 'Výdaje převyšují příjmy — oblast k revizi v rámci posouzení poradcem.'}</div>
      </div>
    </div>
  </div>
</section>`;
}
