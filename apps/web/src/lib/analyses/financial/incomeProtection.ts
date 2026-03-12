/**
 * Income protection step – derive persons from client/partner/children and merge with existing state.
 */

import type { FinancialAnalysisData, IncomeProtectionPerson, InsuredRiskEntry, InsuredRiskType } from './types';
import { INSURANCE_COMPANIES_CS } from './constants';

const RISK_TYPES: InsuredRiskType[] = [
  'death',
  'invalidity',
  'sickness',
  'tn',
  'critical_illness',
  'hospitalization',
];

const RISK_LABELS: Record<InsuredRiskType, string> = {
  death: 'Smrt',
  invalidity: 'Invalidita',
  sickness: 'PN',
  tn: 'TN',
  critical_illness: 'Závažná onemocnění',
  hospitalization: 'Hospitalizace',
};

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

  list.push({
    personKey: 'client',
    displayName: client?.name || 'Klient',
    role: 'Klient',
    roleType: 'client',
    employmentType,
    insurancePlans: getExisting('client')?.insurancePlans ?? [],
    funding: getExisting('client')?.funding,
  });

  if (client?.hasPartner && partner) {
    list.push({
      personKey: 'partner',
      displayName: partner.name || 'Partner',
      role: 'Partner',
      roleType: 'partner',
      employmentType: 'employee',
      insurancePlans: getExisting('partner')?.insurancePlans ?? [],
      funding: getExisting('partner')?.funding,
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
