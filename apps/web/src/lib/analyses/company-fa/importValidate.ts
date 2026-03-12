/**
 * Validation and normalization of company FA JSON import payload.
 * Mirrors migrateImportedData from FA s.r.o. hlavní.html (Phase 1).
 */

import type {
  CompanyFaPayload,
  CompanyFaImportPayload,
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
import type { ValidateResult } from "./types";

const DEFAULT_INVESTMENTS: CompanyFaInvestmentItem[] = [
  { productKey: "imperial", type: "lump", amount: 0, years: 10, annualRate: 0.12, computed: { fv: 0 } },
  { productKey: "creif", type: "lump", amount: 0, years: 10, annualRate: 0.06, computed: { fv: 0 } },
  { productKey: "atris", type: "lump", amount: 0, years: 10, annualRate: 0.06, computed: { fv: 0 } },
  { productKey: "penta", type: "lump", amount: 0, years: 10, annualRate: 0.09, computed: { fv: 0 } },
  { productKey: "ishares", type: "monthly", amount: 0, years: 20, annualRate: 0.12, computed: { fv: 0 } },
  { productKey: "fidelity2040", type: "monthly", amount: 0, years: 20, annualRate: 0.07, computed: { fv: 0 } },
  { productKey: "conseq", type: "pension", amount: 0, years: 30, annualRate: 0.095, computed: { fv: 0 } },
];

const INDUSTRY_VALUES = ["office", "services", "light-manufacturing", "heavy-manufacturing", "construction", "transport"];

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

function ensureNumber(v: unknown, def: number): number {
  if (typeof v === "number" && !Number.isNaN(v)) return v;
  if (typeof v === "string") {
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? def : n;
  }
  return def;
}

/**
 * Normalize raw import payload to canonical CompanyFaPayload.
 * Handles legacy shape (single director, missing sections).
 */
export function normalizeCompanyFaPayload(raw: CompanyFaImportPayload): CompanyFaPayload {
  const data = JSON.parse(JSON.stringify(raw)) as Record<string, unknown>;

  // Legacy: single director -> directors[]
  if (data.director && !data.directors) {
    const dir = data.director as Record<string, unknown>;
    const birthYear = dir.birthYear as number | undefined;
    data.directors = [
      defaultDirector({
        name: String(dir.name ?? ""),
        age: birthYear != null ? new Date().getFullYear() - birthYear : null,
        share: typeof dir.share === "number" ? dir.share : 100,
        hasSpouse: !!dir.hasFamily,
        childrenCount: 0,
        incomeType: dir.incomeType === "osvc" ? "osvc" : "employee",
        netIncome: Number(dir.netIncome) || 0,
        savings: Number(dir.savings) || 0,
        goal: (dir.goal === "security" || dir.goal === "rent" || dir.goal === "tax" ? dir.goal : "tax"),
      }),
    ];
    delete data.director;
  }

  if (!data.investment) {
    data.investment = { goal: "renta", targetAmount: 0, targetRentaMonthly: 0, horizonYears: 10, currentAssets: 0, strategy: "balanced" };
  }

  if (!data.strategy) {
    data.strategy = { profile: "balanced", conservativeMode: false };
  }

  if (!Array.isArray(data.investments) || data.investments.length === 0) {
    data.investments = DEFAULT_INVESTMENTS.map((i) => ({ ...i }));
  }

  if (!data.directorIns) {
    data.directorIns = { death: 0, invalidity: 0, sick: 0, invalidityDegree: 3, statePensionMonthly: 0 };
  }
  const ins = data.directorIns as Record<string, unknown>;
  if (ins.invalidityDegree == null) ins.invalidityDegree = 3;
  if (ins.statePensionMonthly == null) ins.statePensionMonthly = 0;

  if (!Array.isArray(data.directors)) data.directors = [];

  if (!data.risks) {
    data.risks = {
      property: defaultRiskDetail(),
      interruption: defaultRiskDetail(),
      liability: defaultRiskDetail(),
      director: false,
      fleet: false,
      cyber: false,
    };
  } else {
    const r = data.risks as Record<string, unknown>;
    if (typeof r.property === "boolean") (data.risks as Record<string, unknown>).property = defaultRiskDetail(r.property);
    if (typeof r.interruption === "boolean") (data.risks as Record<string, unknown>).interruption = defaultRiskDetail(r.interruption);
    if (typeof r.liability === "boolean") (data.risks as Record<string, unknown>).liability = defaultRiskDetail(r.liability);
    if ((data.risks as Record<string, unknown>).director === undefined) (data.risks as Record<string, unknown>).director = false;
    if ((data.risks as Record<string, unknown>).fleet === undefined) (data.risks as Record<string, unknown>).fleet = false;
    if ((data.risks as Record<string, unknown>).cyber === undefined) (data.risks as Record<string, unknown>).cyber = false;
  }

  // Ensure company, finance, benefits have required shape
  if (!data.company || typeof data.company !== "object") {
    data.company = { name: "", ico: "", industry: "office", employees: 0, cat3: 0, avgWage: 0, topClient: 0 };
  }
  const comp = data.company as Record<string, unknown>;
  data.company = {
    name: String(comp.name ?? ""),
    ico: String(comp.ico ?? ""),
    industry: String(comp.industry ?? "office"),
    employees: ensureNumber(comp.employees, 0),
    cat3: ensureNumber(comp.cat3, 0),
    avgWage: ensureNumber(comp.avgWage, 0),
    topClient: ensureNumber(comp.topClient, 0),
  };

  if (!data.finance || typeof data.finance !== "object") {
    data.finance = { revenue: 0, profit: 0, reserve: 0, loanPayment: 0 };
  } else {
    const f = data.finance as Record<string, unknown>;
    data.finance = {
      revenue: ensureNumber(f.revenue, 0),
      profit: ensureNumber(f.profit, 0),
      reserve: ensureNumber(f.reserve, 0),
      loanPayment: ensureNumber(f.loanPayment, 0),
    };
  }

  if (!data.benefits || typeof data.benefits !== "object") {
    data.benefits = { dps: false, dip: false, izp: false, amount: 0, count: 0, directorsAmount: 0 };
  } else {
    const b = data.benefits as Record<string, unknown>;
    data.benefits = {
      dps: !!b.dps,
      dip: !!b.dip,
      izp: !!b.izp,
      amount: ensureNumber(b.amount, 0),
      count: ensureNumber(b.count, 0),
      directorsAmount: ensureNumber(b.directorsAmount, 0),
    };
  }

  return data as unknown as CompanyFaPayload;
}

function ensureRiskDetail(v: unknown): RiskDetail {
  if (v && typeof v === "object" && "has" in v) {
    return {
      has: !!v.has,
      limit: ensureNumber((v as RiskDetail).limit, 0),
      contractYears: ensureNumber((v as RiskDetail).contractYears, 0),
    };
  }
  return defaultRiskDetail(!!v);
}

/**
 * Validate and normalize import payload. Returns normalized payload or errors.
 */
export function validateCompanyFaImportPayload(raw: unknown): ValidateResult {
  const errors: string[] = [];

  if (!raw || typeof raw !== "object") {
    return { success: false, errors: ["Payload must be an object"] };
  }

  const obj = raw as Record<string, unknown>;

  // Company: at least name or ico
  if (!obj.company || typeof obj.company !== "object") {
    errors.push("Missing or invalid 'company'");
  } else {
    const c = obj.company as Record<string, unknown>;
    if (!c.name && !c.ico) errors.push("company must have name or ico");
    if (c.industry != null && !INDUSTRY_VALUES.includes(String(c.industry))) {
      errors.push(`company.industry must be one of: ${INDUSTRY_VALUES.join(", ")}`);
    }
  }

  // Directors: must be array (will be normalized)
  if (obj.directors != null && !Array.isArray(obj.directors) && !obj.director) {
    errors.push("'directors' must be an array (or use legacy 'director')");
  }

  // Finance
  if (obj.finance != null && typeof obj.finance !== "object") {
    errors.push("'finance' must be an object");
  }

  // Benefits
  if (obj.benefits != null && typeof obj.benefits !== "object") {
    errors.push("'benefits' must be an object");
  }

  // Risks
  if (obj.risks != null && typeof obj.risks !== "object") {
    errors.push("'risks' must be an object");
  }

  // directorIns
  if (obj.directorIns != null && typeof obj.directorIns !== "object") {
    errors.push("'directorIns' must be an object");
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  try {
    const normalized = normalizeCompanyFaPayload(obj as CompanyFaImportPayload);

    // Post-normalization checks
    if (!normalized.company) {
      return { success: false, errors: ["Missing company after normalization"] };
    }
    const comp = normalized.company as CompanyFaCompany;
    if (!comp.name && !comp.ico) {
      return { success: false, errors: ["Company must have name or ico"] };
    }

    // Ensure directors array and shape
    if (!Array.isArray(normalized.directors)) {
      return { success: false, errors: ["directors must be an array"] };
    }

    // Ensure risks shape
    const risks = normalized.risks as CompanyFaRisks;
    normalized.risks = {
      property: ensureRiskDetail(risks?.property),
      interruption: ensureRiskDetail(risks?.interruption),
      liability: ensureRiskDetail(risks?.liability),
      director: !!risks?.director,
      fleet: !!risks?.fleet,
      cyber: !!risks?.cyber,
    };

    // Ensure directorIns defaults
    const di = normalized.directorIns as CompanyFaDirectorIns;
    normalized.directorIns = {
      death: ensureNumber(di?.death, 0),
      invalidity: ensureNumber(di?.invalidity, 0),
      sick: ensureNumber(di?.sick, 0),
      invalidityDegree: (di?.invalidityDegree === 1 || di?.invalidityDegree === 2 || di?.invalidityDegree === 3) ? di.invalidityDegree : 3,
      statePensionMonthly: ensureNumber(di?.statePensionMonthly, 0),
    };

    return { success: true, normalized };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return { success: false, errors: [`Normalization failed: ${message}`] };
  }
}
