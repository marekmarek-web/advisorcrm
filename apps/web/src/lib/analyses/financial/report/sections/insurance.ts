import type { SectionCtx } from '../types';
import { nextSection, fmtCzk, fmtMonthly, fmtDaily, fmtBigCzk, esc } from '../helpers';
import { computeInsurance } from '../../report';
import { INSURANCE_LOGOS } from '../../constants';
import { getRiskLabel, computePlanTotalMonthly } from '../../incomeProtection';
import type { IncomeProtectionPerson, InsuranceFundingSource } from '../../types';

export function renderInsurance(ctx: SectionCtx): string {
  const { data } = ctx;
  const ins = computeInsurance(data);
  let html = '';

  html += renderPersonInsurance(ctx, {
    id: 'ins-client',
    name: data.client?.name ?? 'Klient',
    icon: '👤',
    iconClass: 'icon-blue',
    income: ins.netIncome,
    invalidity: ins.invalidity,
    sickness: ins.sickness,
    tn: ins.tn,
    death: ins.death,
    dvzInfo: ins.sickness.DVZ > 0
      ? `Denní vyměřovací základ (DVZ): ${fmtCzk(ins.sickness.DVZ)} → Redukovaný DVZ: ${fmtCzk(ins.sickness.reducedDVZ)} → Nemocenská (66 %): ${fmtDaily(ins.sickness.sicknessDaily)}`
      : null,
  });

  if (ins.partnerInsurance) {
    const pi = ins.partnerInsurance;
    html += renderPersonInsurance(ctx, {
      id: 'ins-partner',
      name: pi.name,
      icon: '👩',
      iconClass: 'icon-red',
      income: pi.income,
      invalidity: pi.invalidity,
      sickness: pi.sickness,
      tn: pi.tn,
      death: pi.death,
      dvzInfo: null,
    });
  }

  if (ins.childInsurance && ins.childInsurance.length > 0) {
    html += renderChildrenInsurance(ctx, ins.childInsurance);
  }

  const persons = data.incomeProtection?.persons ?? [];
  if (persons.length > 0) {
    html += renderProposedInsurance(ctx, persons);
  }

  return html;
}

interface PersonData {
  id: string;
  name: string;
  icon: string;
  iconClass: string;
  income: number;
  invalidity: { capital: number; statePension: number; needMonthly: number; gapMonthly?: number; rentaFromInsurance?: number };
  sickness: { sicknessMonthly: number; dailyBenefit: number; gapMonthly: number; totalMonthly?: number; optional?: boolean; isOSVC?: boolean };
  tn: { base: number; progress: number; max: number };
  death: { coverage: number };
  dvzInfo: string | null;
}

function renderPersonInsurance(ctx: SectionCtx, p: PersonData): string {
  const num = nextSection(ctx.sectionCounter);

  return `<section class="page" id="${p.id}">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Zajištění</div>
      <div class="sec-title">Zajištění — ${esc(p.name)}</div>
      <div class="sec-desc">Orientační model krytí z příjmu, závazků a životní situace — interní podklad pro poradce.</div>
    </div>

    <div class="ins-person-header">
      <div class="ins-person-icon ${p.iconClass}">${p.icon}</div>
      <div>
        <div class="ins-person-title">${esc(p.name)} — čistý měsíční příjem</div>
        <div class="ins-person-income">${fmtMonthly(p.income)}</div>
      </div>
    </div>

    <div class="tbl-wrap" style="margin-bottom:var(--s5,20px)">
      <div class="tbl-cap"><span class="tbl-cap-title">Modelované krytí (orientační)</span></div>
      <table class="dt">
        <thead><tr><th>Riziko</th><th>Popis</th><th class="r">Výše</th></tr></thead>
        <tbody>
          <tr><td class="bold">Invalidita</td><td class="muted">Jednorázové pojistné plnění</td><td class="r num">${fmtCzk(p.invalidity.capital)}</td></tr>
          <tr><td class="bold">Pracovní neschopnost</td><td class="muted">Denní dávka</td><td class="r num">${fmtDaily(p.sickness.dailyBenefit)}${p.sickness.optional === true ? ' <span style="color:var(--stone-400,#8c959f);font-size:11px">(volitelné)</span>' : ''}</td></tr>
          <tr><td class="bold">Trvalé následky</td><td class="muted">S progresí ${p.tn.progress}×</td><td class="r num">${fmtCzk(p.tn.base)} → ${fmtBigCzk(p.tn.max)}</td></tr>
          <tr><td class="bold">Smrt</td><td class="muted">Krytí závazků + rodina</td><td class="r num">${fmtCzk(p.death.coverage)}</td></tr>
        </tbody>
      </table>
    </div>

    <div class="ins-detail-grid">
      <div class="ins-detail-card">
        <div class="ins-detail-title">Invalidita</div>
        <div class="ins-line"><span class="ins-line-name">Potřebný příjem</span><span class="ins-line-val">${fmtMonthly(p.invalidity.needMonthly)}</span></div>
        <div class="ins-line"><span class="ins-line-name">Státní inv. důchod</span><span class="ins-line-val">−${fmtMonthly(p.invalidity.statePension)}</span></div>
        <div class="ins-line"><span class="ins-line-name">Gap (měsíční)</span><span class="ins-line-val c-neg">${fmtMonthly(p.invalidity.gapMonthly ?? 0)}</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Pojistná částka</span><span class="ins-line-val c-gold">${fmtCzk(p.invalidity.capital)}</span></div>
      </div>

      <div class="ins-detail-card">
        <div class="ins-detail-title">Pracovní neschopnost</div>
        ${!p.sickness.isOSVC ? `<div class="ins-line"><span class="ins-line-name">Nemocenská</span><span class="ins-line-val">${fmtMonthly(p.sickness.sicknessMonthly)}</span></div>` : `<div class="ins-line"><span class="ins-line-name">Nemocenská (OSVČ)</span><span class="ins-line-val">0 Kč</span></div>`}
        <div class="ins-line"><span class="ins-line-name">Gap (měsíční)</span><span class="ins-line-val c-neg">${fmtMonthly(p.sickness.gapMonthly)}</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Denní dávka</span><span class="ins-line-val c-gold">${fmtDaily(p.sickness.dailyBenefit)}</span></div>
      </div>

      <div class="ins-detail-card">
        <div class="ins-detail-title">Trvalé následky</div>
        <div class="ins-line"><span class="ins-line-name">Základní plnění</span><span class="ins-line-val">${fmtCzk(p.tn.base)}</span></div>
        <div class="ins-line"><span class="ins-line-name">Progrese</span><span class="ins-line-val">${p.tn.progress}×</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Maximální plnění</span><span class="ins-line-val c-gold">${fmtBigCzk(p.tn.max)}</span></div>
      </div>

      <div class="ins-detail-card">
        <div class="ins-detail-title">Smrt</div>
        <div class="ins-line"><span class="ins-line-name">Krytí závazků</span><span class="ins-line-val">${fmtCzk(p.death.coverage)}</span></div>
        <div class="ins-line sum"><span class="ins-line-name">Modelovaná pojistná částka</span><span class="ins-line-val c-gold">${fmtCzk(p.death.coverage)}</span></div>
      </div>
    </div>

    ${p.dvzInfo ? `<div class="dvz-note">${p.dvzInfo}</div>` : ''}
  </div>
</section>`;
}

function renderChildrenInsurance(
  ctx: SectionCtx,
  children: Array<{ name: string; age: number; invalidity: number; tn: number; tnProgress: number; tnMax: number; dailyComp: number }>,
): string {
  const num = nextSection(ctx.sectionCounter);
  const rows = children.map((ch) => `
    <tr>
      <td class="bold">${esc(ch.name)}</td>
      <td class="muted">${ch.age} let</td>
      <td class="r">${fmtCzk(ch.invalidity)}</td>
      <td class="r">${fmtCzk(ch.tn)} (${ch.tnProgress}×)</td>
      <td class="r">${fmtDaily(ch.dailyComp)}</td>
    </tr>
  `).join('');

  return `<section class="page" id="ins-children">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Zajištění dětí</div>
      <div class="sec-title">Zajištění dětí — orientační model</div>
      <div class="sec-desc">Modelované pojistné krytí pro přehled — k finálnímu nastavení výhradně podle úvahy poradce.</div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-cap"><span class="tbl-cap-title">Modelované krytí dětí (orientační)</span></div>
      <table class="dt">
        <thead><tr><th>Jméno</th><th>Věk</th><th class="r">Invalidita</th><th class="r">Trvalé následky</th><th class="r">Denní dávka</th></tr></thead>
        <tbody>${rows}</tbody>
      </table>
    </div>

    <div class="callout info">
      <span class="callout-icon">👶</span>
      <div><strong>Dětské pojištění</strong>
      Běžně se zvažuje krytí dětí vůči trvalým následkům úrazu, invaliditě a hospitalizaci — posouzení a výběr produktu je v kompetenci poradce; text je informativní.</div>
    </div>
  </div>
</section>`;
}

const FUNDING_LABELS: Record<InsuranceFundingSource, string> = { company: 'Firma', personal: 'Osobně', osvc: 'OSVČ' };
const ROLE_LABELS: Record<string, string> = {
  client: 'Klient', partner: 'Partner/ka', child: 'Dítě',
  director: 'Jednatel', owner: 'Majitel', partner_company: 'Společník',
};

function renderProposedInsurance(ctx: SectionCtx, persons: IncomeProtectionPerson[]): string {
  const num = nextSection(ctx.sectionCounter);
  let totalMonthly = 0;

  const rows = persons.flatMap((person) =>
    (person.insurancePlans ?? []).map((plan) => {
      const monthly = computePlanTotalMonthly(plan);
      totalMonthly += monthly;
      const risks = (plan.insuredRisks ?? [])
        .filter((r) => r.enabled)
        .map((r) => getRiskLabel(r.riskType))
        .join(', ') || '–';
      const funding = plan.fundingSource ? FUNDING_LABELS[plan.fundingSource] ?? plan.fundingSource : '–';
      const logoPath = plan.provider ? INSURANCE_LOGOS[plan.provider] : undefined;
      const logoHtml = logoPath
        ? `<img src="${esc(logoPath)}" alt="${esc(plan.provider)}" class="ins-provider-logo" onerror="this.style.display='none';if(this.nextElementSibling)this.nextElementSibling.style.display='inline'"><span class="ins-provider-fallback" style="display:none">${esc(plan.provider)}</span>`
        : `<span class="ins-provider-fallback">${esc(plan.provider)}</span>`;
      return `<tr>
        <td class="bold">${esc(person.displayName ?? '')}</td>
        <td class="muted">${esc(ROLE_LABELS[person.roleType ?? ''] ?? person.role ?? '')}</td>
        <td class="ins-provider-cell">${logoHtml}</td>
        <td>${esc(risks)}</td>
        <td class="r num">${fmtMonthly(monthly)}</td>
        <td class="muted">${esc(funding)}</td>
      </tr>`;
    }),
  );

  if (rows.length === 0) return '';

  return `<section class="page" id="ins-proposed">
  <div class="page-bar"></div>
  <div class="page-inner">
    <div class="sec-header">
      <div class="sec-number">${num} — Navržené řešení</div>
      <div class="sec-title">Navržené pojistné řešení</div>
      <div class="sec-desc">Přehled navržených pojistných plánů a jejich měsíčních nákladů.</div>
    </div>

    <div class="tbl-wrap">
      <div class="tbl-cap"><span class="tbl-cap-title">Pojistné plány</span></div>
      <table class="dt">
        <thead><tr><th>Osoba</th><th>Role</th><th>Pojišťovna</th><th>Krytá rizika</th><th class="r">Měsíčně</th><th>Úhrada</th></tr></thead>
        <tbody>
          ${rows.join('\n')}
          <tr class="sum-row"><td colspan="4" class="bold">Celkem měsíčně</td><td class="r num bold">${fmtMonthly(totalMonthly)}</td><td></td></tr>
        </tbody>
      </table>
    </div>
  </div>
</section>`;
}
