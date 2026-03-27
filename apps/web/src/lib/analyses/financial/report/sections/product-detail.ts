import type { SectionCtx } from '../types';
import { esc, fmtCzk, fmtMonthly, fmtBigCzk, fmtPct, investmentLabel, investmentPillClass, investmentAmountLabel, colorForIndex, nextSection } from '../helpers';
import { FUND_DETAILS, FUND_LOGOS } from '../../constants';
import type { InvestmentEntry, FundDetail } from '../../types';

/** Max. `topN` řádků + jeden součet „Ostatní“ (tisk — méně přelévání na 2. stranu). */
function collapseWeightRows(
  items: Array<{ name: string; weight: number }>,
  topN: number,
  othersLabel: string,
): Array<{ name: string; weight: number }> {
  if (!items || items.length === 0) return [];
  const sorted = [...items].sort((a, b) => b.weight - a.weight);
  if (sorted.length <= topN) return sorted;
  const top = sorted.slice(0, topN);
  const rest = sorted.slice(topN);
  const otherW = rest.reduce((s, x) => s + x.weight, 0);
  return [...top, { name: othersLabel, weight: Math.round(otherW * 100) / 100 }];
}

function renderStatGrid(detail: FundDetail): string {
  const cells: [string, string][] = [
    ['Riziko (SRI)', detail.riskSRI ?? '—'],
    ['Horizont', detail.horizon ?? '—'],
    ['Likvidita', detail.liquidity ?? '—'],
    ['Měna', detail.currency ?? 'CZK'],
  ];
  return `<div class="stat-grid">${cells.map(([l, v]) => `<div class="stat-cell"><div class="stat-lbl">${l}</div><div class="stat-val">${esc(v)}</div></div>`).join('')}</div>`;
}

function renderBars(items: Array<{ name: string; weight: number }>, title: string, theme: 'elegant' | 'modern'): string {
  if (!items || items.length === 0) return '';
  const maxW = Math.max(...items.map((i) => i.weight));
  return `<div class="bar-section">
    <div class="bar-section-title">${esc(title)}</div>
    ${items.map((item, idx) => {
      const widthPct = maxW > 0 ? (item.weight / maxW) * 100 : 0;
      return `<div class="bar-row"><span class="bar-row-name">${esc(item.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${widthPct}%;background:${colorForIndex(idx, theme)}"></div></div><span class="bar-pct">${fmtPct(item.weight, 1)}</span></div>`;
    }).join('')}
  </div>`;
}

function renderHoldings(detail: FundDetail): string {
  if (!detail.topHoldings || detail.topHoldings.length === 0) return '';
  return `<div class="bar-section top-holdings-section">
    <div class="bar-section-title">TOP ${detail.topHoldings.length} pozic${detail.top10WeightPercent ? ` (${fmtPct(detail.top10WeightPercent, 1)} portfolia)` : ''}</div>
    ${detail.topHoldings.map((h) => `<div class="bar-row holding-row"><span class="bar-row-name">${esc(h.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${(h.weight / (detail.topHoldings![0]!.weight || 1)) * 100}%;background:var(--navy-800,#112238)"></div></div><span class="bar-pct">${fmtPct(h.weight, 2)}</span></div>`).join('')}
  </div>`;
}

function renderBenefits(benefits: string[]): string {
  if (!benefits || benefits.length === 0) return '';
  return `<ul class="check-list">${benefits.map((b) => `<li>${b}</li>`).join('')}</ul>`;
}

function renderGallery(images: string[], isLogo = false): string {
  if (!images || images.length === 0) return '';
  const cls = isLogo ? 'product-gallery product-gallery-logos' : 'product-gallery';
  return `<div class="${cls}">${images.map((img) => `<div class="product-gallery-item"><img src="${esc(img)}" alt="" class="product-gallery-image" onerror="this.parentElement&&this.parentElement.remove()"></div>`).join('')}</div>`;
}

function computeFV(inv: InvestmentEntry): number {
  const rate = inv.annualRate ?? 0.08;
  const years = inv.years ?? 20;
  const months = years * 12;
  if (inv.type === 'monthly' || inv.type === 'pension') {
    const r = rate / 12;
    return inv.amount * ((Math.pow(1 + r, months) - 1) / r);
  }
  return inv.amount * Math.pow(1 + rate, years);
}

export function renderProductDetails(ctx: SectionCtx): string {
  const { data, theme } = ctx;
  const investments = (data.investments ?? []).filter(
    (inv: InvestmentEntry) => inv.amount > 0 && inv.productKey !== 'algoimperial',
  );

  return investments.map((inv: InvestmentEntry) => {
    const detail = FUND_DETAILS[inv.productKey];
    if (!detail) return '';
    const name = detail.name;
    const logo = FUND_LOGOS[inv.productKey];
    const category = detail.category ?? investmentLabel(inv);
    const pillClass = detail.category
      ? (detail.category.toLowerCase().includes('etf') ? 'pill-blue' : detail.category.toLowerCase().includes('penz') ? 'pill-gold' : 'pill-green')
      : investmentPillClass(inv);
    const fv = computeFV(inv);
    const years = inv.years ?? 20;
    const num = nextSection(ctx.sectionCounter);

    return `<section class="page" id="prod-${inv.productKey}">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Detail produktu</div>
      <div class="sec-title">${esc(name)}</div>
    </div>

    <div class="product-card">
      <div class="product-card-head">
        <div>
          <div class="product-type-pill ${pillClass}">${esc(category)}</div>
          <div class="product-name">${esc(name)}</div>
          <div class="product-meta">${esc(detail.manager)}${detail.awards ? ` — <strong style="color:var(--gold-500,#c9a84c)">${esc(detail.awards)}</strong>` : ''}</div>
        </div>
        <div class="product-invest">
          <div class="product-logo-wrap">
            ${logo
      ? `<img src="${esc(logo)}" alt="${esc(name)}" class="product-logo" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline-flex'"><span class="product-logo-fallback" style="display:none">${esc(name)}</span>`
      : `<span class="product-logo-fallback">${esc(name)}</span>`}
          </div>
          <div class="product-invest-label">Investice</div>
          <div class="product-invest-amt">${investmentAmountLabel(inv)}</div>
        </div>
      </div>
      <div class="product-card-body">
        ${detail.description ? `<div class="product-desc">${detail.description}</div>` : ''}
        ${detail.heroImage ? `<div class="product-hero-image-wrap"><img src="${esc(detail.heroImage)}" alt="${esc(name)}" class="product-hero-image" onerror="this.parentElement&&this.parentElement.remove()"></div>` : ''}
        ${detail.galleryImages ? renderGallery(detail.galleryImages, detail.galleryType === 'logo') : ''}
        ${renderStatGrid(detail)}
        ${detail.countries ? renderBars(collapseWeightRows(detail.countries, 3, 'Ostatní'), 'Zastoupení', theme) : ''}
        ${detail.sectors ? renderBars(collapseWeightRows(detail.sectors, 3, 'Ostatní'), 'Sektory', theme) : ''}
        ${renderHoldings(detail)}
        ${detail.benefits ? renderBenefits(detail.benefits) : ''}
      </div>
      <div class="product-card-foot">
        <span class="foot-label">Projekce (${years} let)</span>
        <span class="foot-val">${fmtBigCzk(fv)}</span>
      </div>
    </div>
  </div>
</section>`;
  }).join('');
}
