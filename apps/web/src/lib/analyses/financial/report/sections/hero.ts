import type { SectionCtx } from '../types';
import { esc, fmtBigCzk } from '../helpers';

function heroDecorativeSVG(): string {
  return `<svg viewBox="0 0 600 400" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M0 400C80 340 160 280 240 240C320 200 400 180 480 160C560 140 600 120 600 80" stroke="white" stroke-width="1.5"/>
    <path d="M0 400C100 360 200 300 300 260C400 220 500 200 600 160" stroke="white" stroke-width="0.8" opacity="0.5"/>
    <path d="M0 400C120 380 240 340 360 300C480 260 540 220 600 200" stroke="white" stroke-width="0.5" opacity="0.3"/>
  </svg>`;
}

export function renderHero(ctx: SectionCtx): string {
  const { data, branding } = ctx;
  const clientName = data.client?.name ?? 'Klient';
  const partnerName = data.partner?.name;

  const totalAssets =
    (data.assets?.cash ?? 0) +
    (data.assets?.investments ?? 0) +
    (data.assets?.pension ?? 0) +
    (data.assets?.realEstate ?? 0) +
    (data.assets?.other ?? 0);
  const totalLiabilities =
    (data.liabilities?.mortgage ?? 0) +
    (data.liabilities?.loans ?? 0) +
    (data.liabilities?.other ?? 0);
  const netWorth = totalAssets - totalLiabilities;

  const dateStr = new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });
  const advisorName = branding.advisorName ?? 'Finanční poradce';

  const titleName = partnerName
    ? `${esc(clientName.split(' ')[0])} &amp;&nbsp;<em>${esc(partnerName.split(' ')[0])}</em>`
    : `<em>${esc(clientName)}</em>`;

  return `<section class="page hero" id="cover">
  <div class="hero-lines">${heroDecorativeSVG()}</div>
  <div class="page-inner" style="position:relative;z-index:2">
    <div class="hero-top">
      <div class="hero-wordmark">AIDVISORA</div>
      <div class="hero-badge">Finanční plán 2025</div>
    </div>
    <div class="hero-center">
      <div class="hero-eyebrow"><span class="hero-eyebrow-line"></span>Finanční analýza</div>
      <div class="hero-title">${titleName}</div>
      <div class="hero-subtitle">Komplexní přehled vašeho majetku, investičního plánu, důchodové strategie a pojištění — navrženo na míru vaší životní situaci.</div>
    </div>
    <div class="hero-bottom">
      <div class="hero-meta-item">
        <div class="hero-meta-label">Klient</div>
        <div class="hero-meta-val">${esc(clientName)}</div>
        ${partnerName ? `<div class="hero-meta-sub">&amp; ${esc(partnerName)}</div>` : ''}
      </div>
      <div class="hero-meta-item">
        <div class="hero-meta-label">Čisté jmění</div>
        <div class="hero-meta-val">${fmtBigCzk(netWorth)}</div>
        <div class="hero-meta-sub">aktiva − závazky</div>
      </div>
      <div class="hero-meta-item">
        <div class="hero-meta-label">Datum</div>
        <div class="hero-meta-val">${dateStr}</div>
      </div>
      <div class="hero-meta-item" style="margin-left:auto;text-align:right;border-right:none">
        <div class="hero-meta-label">Poradce</div>
        <div class="hero-meta-val">${esc(advisorName)}</div>
      </div>
    </div>
  </div>
</section>`;
}

export function renderCompanyHero(ctx: SectionCtx): string {
  const { data, branding } = ctx;
  const companyName = (data.companyFinance as Record<string, unknown> | undefined)?.companyName as string ?? 'Firemní klient';
  const advisorName = branding.advisorName ?? 'Finanční poradce';
  const dateStr = new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

  return `<section class="page company-hero" id="co-cover">
  <div class="page-bar" style="background:var(--gold-500,#d97706)"></div>
  <div class="page-inner" style="position:relative;z-index:2">
    <div class="hero-top">
      <div class="hero-wordmark">AIDVISORA — FIREMNÍ ČÁST</div>
      <div class="hero-badge" style="background:rgba(217,119,6,.12);border-color:rgba(217,119,6,.25);color:var(--gold-400,#d97706)">BUSINESS</div>
    </div>
    <div class="hero-center">
      <div class="hero-eyebrow" style="color:var(--gold-400,#d97706)"><span class="hero-eyebrow-line" style="background:var(--gold-400,#d97706)"></span>Firemní analýza</div>
      <div class="hero-title"><em>${esc(companyName)}</em></div>
      <div class="hero-subtitle">Komplexní analýza firemních rizik, benefitů a investičního portfolia — optimalizace nákladů a ochrana podnikání.</div>
    </div>
    <div class="hero-bottom">
      <div class="hero-meta-item">
        <div class="hero-meta-label">Společnost</div>
        <div class="hero-meta-val">${esc(companyName)}</div>
      </div>
      <div class="hero-meta-item">
        <div class="hero-meta-label">Datum</div>
        <div class="hero-meta-val">${dateStr}</div>
      </div>
      <div class="hero-meta-item" style="margin-left:auto;text-align:right;border-right:none">
        <div class="hero-meta-label">Poradce</div>
        <div class="hero-meta-val">${esc(advisorName)}</div>
      </div>
    </div>
  </div>
</section>`;
}
