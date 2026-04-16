import type { SectionCtx } from '../types';
import { esc, fmtBigCzk, fmtPct, investmentLabel, investmentPillClass, investmentAmountLabel, colorForIndex, nextSection, getProductDisplayName } from '../helpers';
import type { InvestmentEntry, FundDetail } from '../../types';
import { getFaFundDetailForReport, getFaFundLogoUrl } from '../../fund-library/fa-fund-bridge';
import { investmentFv } from '../../calculations';

/** Converts ISO date YYYY-MM-DD to Czech DD.MM.YYYY within a string. */
function isoDatesToCzech(text: string): string {
  return text.replace(/\b(\d{4})-(\d{2})-(\d{2})\b/g, '$3.$2.$1');
}

/**
 * Filters performance summary to only show "1 rok" and "Od zal..." lines,
 * and converts any ISO dates to Czech format.
 */
function filterPerformanceSummary(summary: string): string {
  const lines = summary.split('\n');
  const filtered = lines.filter((line) => {
    const l = line.toLowerCase();
    return l.includes('1 rok') || l.startsWith('od zal') || l.startsWith('od založ');
  });
  const result = filtered.length > 0 ? filtered.join('\n') : summary;
  return isoDatesToCzech(result);
}

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
    ["Riziko (SRI)", detail.riskSRI ?? "—"],
    ["Horizont", detail.horizon ?? "—"],
    ["Likvidita", detail.liquidity ?? "—"],
    ["Měna", detail.currency ?? "CZK"],
  ];
  if (detail.planningRatePercent != null && Number.isFinite(detail.planningRatePercent)) {
    cells.push([
      "Model projekce (p.a.)",
      `${String(detail.planningRatePercent).replace(".", ",")} % (interní předpoklad)`,
    ]);
  }
  return `<div class="stat-grid">${cells.map(([l, v]) => `<div class="stat-cell"><div class="stat-lbl">${esc(l)}</div><div class="stat-val">${esc(v)}</div></div>`).join("")}</div>`;
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
  const maxW = Math.max(...detail.topHoldings.map((h) => h.weight), 1e-6);
  return `<div class="bar-section top-holdings-section">
    <div class="bar-section-title">TOP ${detail.topHoldings.length} pozic${detail.top10WeightPercent ? ` (${fmtPct(detail.top10WeightPercent, 1)} portfolia)` : ''}</div>
    ${detail.topHoldings.map((h) => `<div class="bar-row holding-row"><span class="bar-row-name">${esc(h.name)}</span><div class="bar-track"><div class="bar-fill" style="width:${maxW > 0 ? (h.weight / maxW) * 100 : 0}%;background:var(--navy-800,#112238)"></div></div><span class="bar-pct">${fmtPct(h.weight, 2)}</span></div>`).join('')}
  </div>`;
}

function renderBenefits(benefits: string[]): string {
  if (!benefits || benefits.length === 0) return '';
  return `<ul class="check-list">${benefits.map((b) => `<li>${esc(b)}</li>`).join('')}</ul>`;
}

function renderGallery(images: string[], isLogo = false): string {
  if (!images || images.length === 0) return '';
  const cls = isLogo ? 'product-gallery product-gallery-logos' : 'product-gallery';
  return `<div class="${cls}">${images.map((img) => `<div class="product-gallery-item"><img src="${esc(img)}" alt="" class="product-gallery-image" onerror="this.parentElement&&this.parentElement.remove()"></div>`).join('')}</div>`;
}

export function renderProductDetails(ctx: SectionCtx): string {
  const { data, theme } = ctx;
  const conservativeMode = data.strategy?.conservativeMode ?? false;
  const investments = (data.investments ?? []).filter(
    (inv: InvestmentEntry) => inv.amount > 0,
  );

  return investments.map((inv: InvestmentEntry) => {
    const detail = getFaFundDetailForReport(inv.productKey);
    if (!detail) return '';
    const name = getProductDisplayName(inv.productKey);
    const logo = getFaFundLogoUrl(inv.productKey);
    const catLower = (detail.category ?? "").toLowerCase();
    const category = detail.category ?? investmentLabel(inv);
    const pillClass = detail.category
      ? (catLower.includes("etf") ? "pill-blue" : catLower.includes("penz") ? "pill-gold" : "pill-green")
      : investmentPillClass(inv);
    const fv = investmentFv(inv, conservativeMode);
    const years = inv.years ?? 20;
    const num = nextSection(ctx.sectionCounter);

    return `<section class="page" id="prod-${inv.productKey}-${inv.type}">
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
          ${
            detail.summaryLine
              ? `<div class="product-summary-line" style="font-size:0.8125rem;font-weight:600;color:var(--wp-text-secondary,#64748b);margin-top:0.25rem;line-height:1.35">${esc(detail.summaryLine)}</div>`
              : ""
          }
          <div class="product-meta">${esc(detail.manager)}${
            detail.provider && detail.provider !== detail.manager ? ` · ${esc(detail.provider)}` : ""
          }${detail.awards ? ` — <strong style="color:var(--gold-500,#c9a84c)">${esc(detail.awards)}</strong>` : ""}${
            detail.morningstarRatingLabel
              ? ` · <span style="color:var(--wp-text-secondary,#64748b)">Morningstar: ${esc(detail.morningstarRatingLabel)}</span>`
              : ""
          }</div>
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
        ${detail.description ? `<div class="product-desc">${esc(detail.description)}</div>` : ""}
        ${detail.heroImage ? `<div class="product-hero-image-wrap"><img src="${esc(detail.heroImage)}" alt="${esc(name)}" class="product-hero-image" onerror="this.parentElement&&this.parentElement.remove()"></div>` : ""}
        ${detail.galleryImages && detail.galleryImages.length > 0 ? renderGallery(detail.galleryImages, detail.galleryType === "logo") : ""}
        ${
          detail.officialPerformanceSummary
            ? `<div class="bar-section" style="margin-bottom:1rem"><div class="bar-section-title">Oficiální výkonnost (ze zdroje)</div><p style="font-size:0.8125rem;line-height:1.5;color:var(--wp-text-secondary,#64748b);white-space:pre-line;margin:0">${esc(filterPerformanceSummary(detail.officialPerformanceSummary))}</p></div>`
            : ""
        }
        ${
          detail.factsheetUrl
            ? `<p style="font-size:0.8125rem;margin:0 0 0.75rem 0"><a href="${esc(detail.factsheetUrl)}" rel="noopener noreferrer" target="_blank">Otevřít factsheet</a>${detail.factsheetAsOf ? ` <span style="color:var(--wp-text-secondary)">(k ${esc(isoDatesToCzech(detail.factsheetAsOf))})</span>` : ""}</p>`
            : ""
        }
        ${detail.verifiedAt ? `<p style="font-size:0.75rem;color:var(--wp-text-tertiary,#94a3b8);margin:0 0 0.75rem 0">Ověření v katalogu: ${esc(isoDatesToCzech(detail.verifiedAt))}</p>` : ""}
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
