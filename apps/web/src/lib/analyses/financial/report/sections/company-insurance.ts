import type { SectionCtx } from '../types';
import type { CompanyRisks } from '../../types';
import { nextSection, fmtCzk, fmtMonthly, esc } from '../helpers';

interface RiskCategory {
  name: string;
  icon: string;
  status: 'ok' | 'bad';
  label: string;
}

const PREMIUM_TABLE_KEYS = [
  'property',
  'interruption',
  'liability',
  'director',
  'fleet',
  'cyber',
] as const;

const RISK_LABELS: Record<(typeof PREMIUM_TABLE_KEYS)[number], string> = {
  property: 'Majetek',
  interruption: 'Přerušení provozu',
  liability: 'Odpovědnost',
  director: 'D&O / jednatel',
  fleet: 'Flotila',
  cyber: 'Kyber',
};

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
  const risks = (data.companyRisks ?? {}) as CompanyRisks;
  const details = data.companyRiskDetails ?? {};

  const premiumRows = PREMIUM_TABLE_KEYS.filter((k) => risks[k])
    .map((k) => {
      const d = details[k];
      const limit = d?.limit;
      const cur = d?.currentPremiumMonthly;
      const prop = d?.proposedPremiumMonthly;
      const saving = cur != null && prop != null && cur > prop ? cur - prop : null;
      const limitCell =
        k === 'property' || k === 'interruption' || k === 'liability'
          ? limit != null && limit > 0
            ? fmtCzk(limit)
            : '—'
          : '—';
      return `<tr>
        <td class="bold">${esc(RISK_LABELS[k])}</td>
        <td class="r muted">${limitCell}</td>
        <td class="r num">${cur != null ? fmtMonthly(cur) : '—'}</td>
        <td class="r num">${prop != null ? fmtMonthly(prop) : '—'}</td>
        <td class="r num">${saving != null && saving > 0 ? fmtMonthly(saving) : '—'}</td>
      </tr>`;
    })
    .join('');

  const premiumTable =
    premiumRows.length > 0
      ? `<div class="tbl-wrap" style="margin-top:var(--s5,20px)">
      <div class="tbl-cap"><span class="tbl-cap-title">Pojistné – srovnání (aktuálně vs. návrh)</span></div>
      <table class="dt">
        <thead><tr><th>Riziko</th><th class="r">Limit</th><th class="r">Aktuálně</th><th class="r">Návrh</th><th class="r">Úspora / měs.</th></tr></thead>
        <tbody>${premiumRows}</tbody>
      </table>
    </div>`
      : '';

  return `<section class="page" id="co-pojisteni">
  <div class="page-bar" style="background:var(--gold-500,#d97706)"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number gold">${num} — Firemní pojištění</div>
      <div class="sec-title">Analýza rizik &amp; pojištění</div>
      <div class="sec-desc">Přehled pojistného krytí, limitů a srovnání stávajícího pojistného s navrhovaným řešením.</div>
    </div>

    <div class="risk-grid">
      ${categories.map((c) => `<div class="risk-item"><div class="risk-dot ${c.status}"></div><span class="risk-name">${c.icon} ${esc(c.name)}</span><span class="risk-status ${c.status}">${c.label}</span></div>`).join('')}
    </div>

    ${premiumTable}

    <div class="callout ${categories.some((c) => c.status === 'bad') ? 'danger' : 'success'}">
      <span class="callout-icon">${categories.some((c) => c.status === 'bad') ? '⚠️' : '✓'}</span>
      <div><strong>${categories.some((c) => c.status === 'bad') ? 'Identifikována rizika' : 'Všechna rizika zajištěna'}</strong>
      ${categories.some((c) => c.status === 'bad')
    ? `Nezajištěné oblasti: ${categories.filter((c) => c.status === 'bad').map((c) => c.name).join(', ')}. Oblast k posouzení poradcem.`
    : 'Vaše firma má pokryta všechna hlavní rizika. Zvažte pravidelnou revizi v rámci evidence.'}</div>
    </div>
  </div>
</section>`;
}
