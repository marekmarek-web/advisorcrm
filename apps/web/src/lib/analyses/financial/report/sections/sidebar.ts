import type { SectionCtx } from '../types';
import { esc } from '../helpers';
import type { InvestmentEntry } from '../../types';
import { FUND_DETAILS } from '../../constants';

function navIcon(type: string): string {
  const icons: Record<string, string> = {
    cover: '<rect x="2" y="2" width="12" height="12" rx="2"/><path d="M5 8h6M5 5h6M5 11h4"/>',
    bilance: '<path d="M3 12V6M6 12V4M9 12V7M12 12V2"/>',
    cile: '<circle cx="8" cy="8" r="6"/><circle cx="8" cy="8" r="3"/>',
    portfolio: '<path d="M2 14 C4 10,7 6,14 2"/><path d="M9 2h5v5"/>',
    product: '<circle cx="8" cy="8" r="6"/><path d="M5 8l2 2 4-4"/>',
    projekce: '<polyline points="2,12 5,8 8,9 11,5 14,3"/><polyline points="11,3 14,3 14,6"/>',
    person: '<path d="M8 7a3 3 0 100-6 3 3 0 000 6z"/><path d="M2 14c0-3 2.7-5 6-5s6 2 6 5"/>',
    company: '<rect x="2" y="4" width="12" height="10" rx="1.5"/><path d="M5 4V3a1 1 0 011-1h4a1 1 0 011 1v1"/>',
    shield: '<path d="M8 2L3 4v4c0 3 2.2 5 5 5s5-2 5-5V4L8 2z"/><path d="M5.5 8l2 2 3-3"/>',
  };
  const path = icons[type] ?? icons.cover;
  return `<svg class="nav-icon" viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5">${path}</svg>`;
}

interface NavItem { id: string; label: string; icon: string; group?: string }

export function renderSidebar(ctx: SectionCtx): string {
  const { data, branding } = ctx;
  const clientName = data.client?.name ?? 'Klient';
  const partnerName = data.partner?.name;
  const dateStr = new Date().toLocaleDateString('cs-CZ', { day: 'numeric', month: 'long', year: 'numeric' });

  const items: NavItem[] = [
    { id: 'cover', label: 'Úvod', icon: 'cover', group: 'Přehled' },
    { id: 'bilance', label: 'Bilance & Cashflow', icon: 'bilance' },
    { id: 'cile', label: 'Finanční cíle', icon: 'cile', group: 'Strategie' },
    { id: 'portfolio', label: 'Portfolio', icon: 'portfolio' },
  ];

  const investments = (data.investments ?? []).filter(
    (inv: InvestmentEntry) => inv.amount > 0 && inv.productKey !== 'algoimperial',
  );
  investments.forEach((inv: InvestmentEntry) => {
    const name = FUND_DETAILS[inv.productKey]?.name ?? inv.productKey;
    items.push({ id: `prod-${inv.productKey}`, label: name, icon: 'product', group: items.length === 4 ? 'Produkty' : undefined });
  });

  items.push({ id: 'projekce', label: 'Projekce', icon: 'projekce' });

  items.push({ id: `ins-client`, label: `Zajištění — ${esc(clientName.split(' ')[0])}`, icon: 'person', group: 'Zajištění' });
  if (partnerName) {
    items.push({ id: `ins-partner`, label: `Zajištění — ${esc(partnerName.split(' ')[0])}`, icon: 'person' });
  }

  if (data.includeCompany) {
    items.push({ id: 'co-cover', label: 'Přehled firmy', icon: 'company', group: '__company__' });
    items.push({ id: 'co-pojisteni', label: 'Firemní pojištění', icon: 'shield' });
    items.push({ id: 'co-portfolio', label: 'Portfolio firmy', icon: 'portfolio' });
    items.push({ id: 'co-jednatel', label: 'Zajištění jednatele', icon: 'person' });
  }

  let navHtml = '';
  items.forEach((item) => {
    if (item.group === '__company__') {
      navHtml += `<div class="sb-company-divider"><div class="sb-nav-group-label" style="margin-top:0">Firemní část</div></div>`;
    } else if (item.group) {
      navHtml += `<div class="sb-nav-group-label">${esc(item.group)}</div>`;
    }
    navHtml += `<a class="sb-nav-item" href="#${item.id}" data-section="${item.id}">${navIcon(item.icon)} ${esc(item.label)}</a>\n`;
  });

  const advisorName = branding.advisorName ?? 'Finanční poradce';
  const advisorRole = branding.advisorRole ?? 'Privátní finanční plánování';

  return `<aside class="sidebar" id="sidebar">
  <div class="sb-brand">
    <div class="sb-logo">
      <div class="sb-logo-mark">A</div>
      <div class="sb-logo-name">Aidvisora</div>
    </div>
    <div class="sb-client-box">
      <div class="sb-client-label">Klient</div>
      <div class="sb-client-name">${esc(clientName)}${partnerName ? `<br>&amp; ${esc(partnerName)}` : ''}</div>
      <div class="sb-client-date">${dateStr}</div>
    </div>
  </div>
  <nav class="sb-nav" id="sb-nav">
${navHtml}
  </nav>
  <div class="sb-progress">
    <div class="sb-progress-label"><span>Průběh čtení</span><span id="progress-pct">0 %</span></div>
    <div class="sb-progress-track"><div class="sb-progress-fill" id="progress-fill"></div></div>
  </div>
  <div class="sb-footer">
    <div class="sb-advisor-name">${esc(advisorName)}</div>
    <div class="sb-advisor-role">${esc(advisorRole)}</div>
  </div>
</aside>`;
}
