/**
 * Income protection step – derive persons from client/partner/children and merge with existing state.
 */

import type { FinancialAnalysisData, IncomeProtectionPerson, InsuredRiskEntry, InsuredRiskType } from './types';
import { INSURANCE_COMPANIES_CS } from './constants';

const RISK_TYPES: InsuredRiskType[] = [
  'death',
  'invalidity',
  'tn',
  'sickness',
  'daily_compensation',
  'critical_illness',
  'hospitalization',
];

const RISK_LABELS: Record<InsuredRiskType, string> = {
  death: 'Smrt',
  invalidity: 'Invalidita',
  sickness: 'Pracovní neschopnost',
  tn: 'Trvalé následky',
  daily_compensation: 'Denní odškodné',
  critical_illness: 'Závažná onemocnění',
  hospitalization: 'Hospitalizace',
};

const URAZOVKA_RISKS: InsuredRiskType[] = ['tn', 'daily_compensation', 'hospitalization'];

/** Risk types for children under 18 (no PN, no death). */
const CHILD_EXCLUDED_RISKS: InsuredRiskType[] = ['death', 'sickness'];

/** Věk z data/roku narození (RRRR nebo RRRR-MM-DD). Exportováno pro report a další moduly. */
export function getAgeFromBirthDate(birthDate: string): number | null {
  if (!birthDate?.trim()) return null;
  const yearOnly = birthDate.match(/^\d{4}$/);
  if (yearOnly) {
    const y = parseInt(yearOnly[0], 10);
    if (y < 1900 || y > new Date().getFullYear()) return null;
    return new Date().getFullYear() - y;
  }
  const m = birthDate.match(/(\d{4})-(\d{2})-(\d{2})/) || birthDate.match(/(\d{1,2})\.(\d{1,2})\.(\d{4})/);
  if (!m) return null;
  const year = m[3] ? parseInt(m[3], 10) : parseInt(m[1], 10);
  if (year < 1900 || year > new Date().getFullYear()) return null;
  return new Date().getFullYear() - year;
}

/** Build list of persons for the step from client/partner/children. Merges with existing by personKey. */
export function getDerivedIncomeProtectionPersons(
  data: FinancialAnalysisData,
  existingPersons: IncomeProtectionPerson[] = []
): IncomeProtectionPerson[] {
  const list: IncomeProtectionPerson[] = [];
  const client = data.client;
  const partner = data.partner;
  const children = data.children ?? [];
  const incomeType = data.cashflow?.incomeType ?? 'zamestnanec';
  const employmentType = incomeType === 'osvc' ? 'osvc' : 'employee';

  const getExisting = (personKey: string) => existingPersons.find((p) => p.personKey === personKey);

  const existingClient = getExisting('client');
  list.push({
    personKey: 'client',
    displayName: client?.name || 'Klient',
    role: 'Klient',
    roleType: existingClient?.roleType ?? 'client',
    employmentType: existingClient?.employmentType ?? employmentType,
    insurancePlans: existingClient?.insurancePlans ?? [],
    funding: existingClient?.funding,
  });

  if (client?.hasPartner && partner) {
    const partnerIncomeType = data.cashflow?.partnerIncomeType ?? 'zamestnanec';
    const partnerEmploymentType =
      partnerIncomeType === 'osvc' ? 'osvc'
      : partnerIncomeType === 'invalidni_duchod' ? 'invalidni_duchod'
      : partnerIncomeType === 'starobni_duchod' ? 'starobni_duchod'
      : 'employee';
    const existingPartner = getExisting('partner');
    list.push({
      personKey: 'partner',
      displayName: partner.name || 'Partner',
      role: 'Partner',
      roleType: existingPartner?.roleType ?? 'partner',
      employmentType: existingPartner?.employmentType ?? partnerEmploymentType,
      insurancePlans: existingPartner?.insurancePlans ?? [],
      funding: existingPartner?.funding,
    });
  }

  children.forEach((child, idx) => {
    const personKey = `child_${idx}`;
    list.push({
      personKey,
      displayName: child.name || `Dítě ${idx + 1}`,
      role: `Dítě ${idx + 1}`,
      roleType: 'child',
      insurancePlans: getExisting(personKey)?.insurancePlans ?? [],
      funding: getExisting(personKey)?.funding,
    });
  });

  return list;
}

/** Get risk types filtered for a specific person context. */
export function getRiskTypesForPerson(
  personKey: string,
  data: FinancialAnalysisData,
  planType?: 'full' | 'urazovka'
): InsuredRiskType[] {
  let types = [...RISK_TYPES];

  if (planType === 'urazovka') {
    types = types.filter((rt) => URAZOVKA_RISKS.includes(rt));
  }

  if (personKey.startsWith('child_')) {
    const idx = parseInt(personKey.replace('child_', ''), 10);
    const child = data.children?.[idx];
    if (child) {
      const age = getAgeFromBirthDate(child.birthDate);
      if (age != null && age < 18) {
        types = types.filter((rt) => !CHILD_EXCLUDED_RISKS.includes(rt));
      }
    }
  }

  return types;
}

export function getRiskTypes(): InsuredRiskType[] {
  return [...RISK_TYPES];
}

export function getRiskLabel(riskType: InsuredRiskType): string {
  return RISK_LABELS[riskType] ?? riskType;
}

/** Create empty risk entries for a new plan. */
export function getDefaultInsuredRisks(): InsuredRiskEntry[] {
  return RISK_TYPES.map((riskType) => ({ riskType, enabled: false }));
}

export function getInsuranceCompanies(): string[] {
  return [...INSURANCE_COMPANIES_CS];
}

/** Check if optimization section should be shown for this person. */
export function showBenefitOptimization(person: IncomeProtectionPerson): boolean {
  const roleType = person.roleType;
  const employmentType = person.employmentType;
  if (roleType === 'director' || roleType === 'owner' || roleType === 'partner_company') return true;
  if (employmentType === 'mixed') return true;
  return Boolean(person.funding?.benefitOptimizationEnabled);
}
