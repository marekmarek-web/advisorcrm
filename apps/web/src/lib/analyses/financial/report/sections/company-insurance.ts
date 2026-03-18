import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, esc } from '../helpers';

interface RiskCategory {
  name: string;
  icon: string;
  status: 'ok' | 'bad';
  label: string;
}

function getRiskCategories(data: SectionCtx['data']): RiskCategory[] {
  const risks = data.companyRisks ?? {} as Record<string, unknown>;
  const categories: RiskCategory[] = [
    { name: 'Majetek', icon: '🏢', status: risks.property ? 'ok' : 'bad', label: risks.property ? 'Zajištěno' : 'Nezajištěno' },
    { name: 'Přerušení provozu', icon: '⚠️', status: risks.interruption ? 'ok' : 'bad', label: risks.interruption ? 'Zajištěno' : 'Nezajištěno' },
    { name: 'Odpovědnost', icon: '⚖️', status: risks.liability ? 'ok' : 'bad', label: risks.liability ? 'Zajištěno' : 'Nezajištěno' },
    { name: 'Jednatel / KO', icon: '👤', status: risks.director ? 'ok' : 'bad', label: risks.director ? 'Zajištěno' : 'Nezajištěno' },
    { name: 'Flotila', icon: '🚗', status: risks.fleet ? 'ok' : 'bad', label: risks.fleet ? 'Zajištěno' : 'Nezajištěno' },
    { name: 'Kyber', icon: '🔒', status: risks.cyber ? 'ok' : 'bad', label: risks.cyber ? 'Zajištěno' : 'Nezajištěno' },
  ];
  return categories;
}

export function renderCompanyInsurance(ctx: SectionCtx): string {
  const { data } = ctx;
  const num = nextSection(ctx.sectionCounter);
  const categories = getRiskCategories(data);

  const details = data.companyRiskDetails ?? {};
  const riskLabels: Record<string, string> = {
    property: 'Majetek',
    interruption: 'Přerušení provozu',
    liability: 'Odpovědnost',
  };
  const gapRows = Object.entries(details)
    .map(([key, val]) => {
      const limit = val?.limit ?? 0;
      const label = riskLabels[key] ?? key;
      return `<div class="gap-row">
        <span class="gap-name">${esc(label)}</span>
        <span class="gap-current">${fmtCzk(limit)}</span>
        <span class="gap-arrow">→</span>
        <span class="gap-recommended">Doporučeno: revize</span>
        <span class="gap-badge ${limit > 0 ? 'badge-ok' : 'badge-low'}">${limit > 0 ? 'Pojištěno' : 'Chybí'}</span>
      </div>`;
    })
    .join('');

  return `<section class="page" id="co-pojisteni">
  <div class="page-bar" style="background:var(--gold-500,#d97706)"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number gold">${num} — Firemní pojištění</div>
      <div class="sec-title">Analýza rizik &amp; pojištění</div>
      <div class="sec-desc">Přehled pojistného krytí firemních rizik a identifikace mezer v ochraně.</div>
    </div>

    <div class="risk-grid">
      ${categories.map((c) => `<div class="risk-item"><div class="risk-dot ${c.status}"></div><span class="risk-name">${c.icon} ${esc(c.name)}</span><span class="risk-status ${c.status}">${c.label}</span></div>`).join('')}
    </div>

    ${gapRows ? `<div class="tbl-wrap">
      <div class="tbl-cap"><span class="tbl-cap-title">Gap analýza — aktuální vs. doporučené krytí</span></div>
      <div>${gapRows}</div>
    </div>` : ''}

    <div class="callout ${categories.some((c) => c.status === 'bad') ? 'danger' : 'success'}">
      <span class="callout-icon">${categories.some((c) => c.status === 'bad') ? '⚠️' : '✓'}</span>
      <div><strong>${categories.some((c) => c.status === 'bad') ? 'Identifikována rizika' : 'Všechna rizika zajištěna'}</strong>
      ${categories.some((c) => c.status === 'bad')
    ? `Nezajištěné oblasti: ${categories.filter((c) => c.status === 'bad').map((c) => c.name).join(', ')}. Doporučujeme neprodleně řešit.`
    : 'Vaše firma má pokryta všechna hlavní rizika. Doporučujeme pravidelnou revizi.'}</div>
    </div>
  </div>
</section>`;
}
