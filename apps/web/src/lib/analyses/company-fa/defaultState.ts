/**
 * Company FA – default payload for new analysis.
 * Matches shape from importValidate normalisation.
 */

import type {
  CompanyFaPayload,
  CompanyFaCompany,
  CompanyFaDirector,
  CompanyFaFinance,
  CompanyFaBenefits,
  CompanyFaRisks,
  CompanyFaDirectorIns,
  CompanyFaStrategy,
  CompanyFaInvestmentItem,
  DirectorBenefits,
  RiskDetail,
} from "./types";

function defaultDirectorBenefits(): DirectorBenefits {
  return { dps: false, dip: false, izp: false, amountMonthly: 0 };
}

function defaultDirector(overrides: Partial<CompanyFaDirector> = {}): CompanyFaDirector {
  return {
    name: "",
    age: null,
    share: 100,
    hasSpouse: false,
    childrenCount: 0,
    incomeType: "employee",
    netIncome: 0,
    savings: 0,
    goal: "tax",
    benefits: defaultDirectorBenefits(),
    paysFromOwn: false,
    paysFromOwnAmount: 0,
    hasOldPension: false,
    ...overrides,
  };
}

function defaultRiskDetail(has = false): RiskDetail {
  return { has, limit: 0, contractYears: 0 };
}

const DEFAULT_INVESTMENTS: CompanyFaInvestmentItem[] = [
  { productKey: "creif", type: "lump", amount: 0, years: 10, annualRate: 0.06, computed: { fv: 0 } },
  { productKey: "atris", type: "lump", amount: 0, years: 10, annualRate: 0.06, computed: { fv: 0 } },
  { productKey: "penta", type: "lump", amount: 0, years: 10, annualRate: 0.09, computed: { fv: 0 } },
  { productKey: "ishares", type: "monthly", amount: 0, years: 20, annualRate: 0.12, computed: { fv: 0 } },
  { productKey: "fidelity2040", type: "monthly", amount: 0, years: 20, annualRate: 0.07, computed: { fv: 0 } },
  { productKey: "conseq", type: "pension", amount: 0, years: 30, annualRate: 0.095, computed: { fv: 0 } },
];

export function getDefaultCompanyFaPayload(): CompanyFaPayload {
  const company: CompanyFaCompany = {
    name: "",
    ico: "",
    industry: "office",
    employees: 0,
    cat3: 0,
    avgWage: 0,
    topClient: 0,
  };
  const finance: CompanyFaFinance = {
    revenue: 0,
    profit: 0,
    reserve: 0,
    loanPayment: 0,
  };
  const benefits: CompanyFaBenefits = {
    dps: false,
    dip: false,
    izp: false,
    amount: 0,
    count: 0,
    directorsAmount: 0,
  };
  const risks: CompanyFaRisks = {
    property: defaultRiskDetail(),
    interruption: defaultRiskDetail(),
    liability: defaultRiskDetail(),
    director: false,
    fleet: false,
    cyber: false,
  };
  const directorIns: CompanyFaDirectorIns = {
    death: 0,
    invalidity: 0,
    sick: 0,
    invalidityDegree: 3,
    statePensionMonthly: 0,
  };
  const strategy: CompanyFaStrategy = {
    profile: "balanced",
    conservativeMode: false,
  };
  return {
    company,
    directors: [defaultDirector()],
    finance,
    benefits,
    risks,
    directorIns,
    strategy,
    investments: DEFAULT_INVESTMENTS.map((i) => ({ ...i })),
  };
}
