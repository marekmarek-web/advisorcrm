import type { SectionCtx } from '../types';
import { nextSection, esc, fmtMonthly, fmtCzk, fmtBigCzk, investmentLabel, getProductDisplayName } from '../helpers';
import type { InvestmentEntry } from '../../types';
import { investmentFv } from '../../calculations';
import { getFaFundLogoUrl } from '../../fund-library/fa-fund-bridge';

const TYPE_LABELS: Record<string, string> = {
  monthly: 'Pravidelná',
  pension: 'Penzijní',
  lump: 'Jednorázová',
};

export function renderInvestmentOverview(ctx: SectionCtx): string {
  const { data } = ctx;

  const investments = (data.investments ?? []).filter(
    (inv: InvestmentEntry) => inv.amount > 0,
  );

  if (investments.length === 0) return '';

  const conservativeMode = data.strategy?.conservativeMode ?? false;
  const num = nextSection(ctx.sectionCounter);

  let totalMonthly = 0;
  let totalLump = 0;
  let totalFV = 0;

  const rows = investments.map((inv: InvestmentEntry) => {
    const name = getProductDisplayName(inv.productKey);
    const logo = getFaFundLogoUrl(inv.productKey);
    const logoHtml = logo
      ? `<img src="${esc(logo)}" alt="${esc(name)}" class="ins-provider-logo" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline'"><span class="ins-provider-fallback" style="display:none">${esc(name)}</span>`
      : `<span class="ins-provider-fallback">${esc(name)}</span>`;

    const typeLabel = TYPE_LABELS[inv.type] ?? inv.type;
    const amountLabel = inv.type === 'lump' ? fmtCzk(inv.amount) : fmtMonthly(inv.amount);
    const horizon = inv.years ? `${inv.years} let` : '–';
    const fv = investmentFv(inv, conservativeMode);
    totalFV += fv;

    if (inv.type === 'lump') {
      totalLump += inv.amount;
    } else {
      totalMonthly += inv.amount;
    }

    return `<tr>
      <td>
        <div class="ins-provider-cell">${logoHtml}</div>
        <div class="bold" style="margin-top:4px">${esc(name)}</div>
      </td>
      <td class="muted">${esc(typeLabel)}</td>
      <td class="r">${esc(amountLabel)}</td>
      <td class="r">${esc(horizon)}</td>
      <td class="r num bold">${fmtBigCzk(fv)}</td>
    </tr>`;
  });

  const totalAmountCells = [
    totalMonthly > 0 ? fmtMonthly(totalMonthly) : null,
    totalLump > 0 ? fmtCzk(totalLump) + ' jednorázově' : null,
  ].filter(Boolean).join(' + ');

  return `<section class="page" id="inv-overview">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Investiční přehled</div>
      <div class="sec-title">Investiční přehled</div>
      <div class="sec-desc">Přehled navržených investic, jejich plateb, horizontu a orientačního odhadu budoucí hodnoty.</div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-cap"><span class="tbl-cap-title">Investiční produkty</span></div>
      <table class="dt">
        <thead><tr><th>Produkt / Fond</th><th>Typ</th><th class="r">Platba</th><th class="r">Horizont</th><th class="r">Odhad FV</th></tr></thead>
        <tbody>
          ${rows.join('\n')}
          <tr class="sum-row">
            <td colspan="2" class="bold">Celkem</td>
            <td class="r num">${esc(totalAmountCells || '–')}</td>
            <td></td>
            <td class="r num bold">${fmtBigCzk(totalFV)}</td>
          </tr>
        </tbody>
      </table>
    </div>

    <div class="callout info" style="margin-top:var(--s4,16px)">
      <span class="callout-icon">ⓘ</span>
      <div><strong>Interní podklad pro poradce</strong>
      Odhad budoucí hodnoty je orientační projekce z modelačního scénáře průvodce analýzy. Vychází z předpokládaného průměrného ročního výnosu a nezohledňuje inflaci, daně ani poplatky. Minulá výkonnost není zárukou budoucích výnosů.</div>
    </div>
  </div>
</section>`;
}
