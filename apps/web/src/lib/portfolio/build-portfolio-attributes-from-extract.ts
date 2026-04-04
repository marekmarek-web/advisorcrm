/**
 * Jednotné mapování volitelných polí z extraktu do `contracts.portfolio_attributes`.
 * Nevyplňuje odhadované metriky — jen pokud extrakt pole spolehlivě dodává.
 * P2: strukturované osoby (`persons`) a rizika (`risks`) z envelope / extractedFields.
 */

export type CoverageLineUi = { label?: string; amount?: string; description?: string };

/** Role osoby v portfoliu (zjednodušený kanon pro UI a CRM). */
export type PortfolioPersonRole =
  | "policyholder"
  | "insured"
  | "child"
  | "beneficiary"
  | "other";

export type PortfolioPersonEntry = {
  role: PortfolioPersonRole;
  name?: string;
  birthDate?: string;
  personalId?: string;
};

export type PortfolioRiskEntry = {
  label: string;
  amount?: string;
  /** Jméno osoby nebo volný odkaz z extraktu */
  personRef?: string;
  description?: string;
};

/** Kanonický tvar portfolio_attributes (JSONB); index signature pro zpětnou kompatibilitu. */
export type PortfolioAttributes = {
  loanPrincipal?: string;
  sumInsured?: string;
  insuredPersons?: unknown;
  persons?: PortfolioPersonEntry[];
  risks?: PortfolioRiskEntry[];
  coverageLines?: CoverageLineUi[];
  vehicleRegistration?: string;
  propertyAddress?: string;
  subcategory?: string;
  loanFixationUntil?: string;
  loanMaturityDate?: string;
  [key: string]: unknown;
};

function unwrapExtractedCell(raw: unknown): unknown {
  if (raw == null || typeof raw !== "object") return raw;
  const o = raw as Record<string, unknown>;
  if ("value" in o) return o.value;
  return raw;
}

/** Sloučí root + hodnoty z `extractedFields.*.value` pro mapování do portfolia. */
function flattenExtractForPortfolio(p: Record<string, unknown>): Record<string, unknown> {
  const flat: Record<string, unknown> = { ...p };
  const ef = p.extractedFields;
  if (ef && typeof ef === "object") {
    for (const [k, cell] of Object.entries(ef as Record<string, unknown>)) {
      const v = unwrapExtractedCell(cell);
      if (v !== undefined && v !== null && !(k in flat)) {
        flat[k] = v;
      }
    }
  }
  return flat;
}

function mapPartyKeyToRole(key: string): PortfolioPersonRole {
  const k = key.toLowerCase().replace(/\s+/g, "_");
  if (k.includes("policyholder") || k === "pojistnik" || k === "holder") return "policyholder";
  if (k.includes("benefici") || k.includes("oprávněn") || k.includes("opravnen")) return "beneficiary";
  if (k.includes("child") || k.includes("dět") || k.includes("det")) return "child";
  if (k.includes("insured") || k.includes("pojištěn") || k.includes("pojisteny")) return "insured";
  return "other";
}

function personNameFromRecord(r: Record<string, unknown>): string | undefined {
  const full = r.fullName ?? r.name ?? r.displayName;
  if (typeof full === "string" && full.trim()) return full.trim();
  const fn = typeof r.firstName === "string" ? r.firstName.trim() : "";
  const ln = typeof r.lastName === "string" ? r.lastName.trim() : "";
  const joined = [fn, ln].filter(Boolean).join(" ");
  return joined || undefined;
}

function normalizeOnePerson(raw: unknown, role: PortfolioPersonRole): PortfolioPersonEntry | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return null;
    return { role, name: t };
  }
  if (typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const name = personNameFromRecord(r);
  const birthDate =
    typeof r.birthDate === "string"
      ? r.birthDate.trim()
      : typeof r.dateOfBirth === "string"
        ? r.dateOfBirth.trim()
        : undefined;
  const personalId =
    typeof r.personalId === "string"
      ? r.personalId.trim()
      : typeof r.birthNumber === "string"
        ? r.birthNumber.trim()
        : typeof r.rc === "string"
          ? r.rc.trim()
          : undefined;
  if (!name && !birthDate && !personalId) return null;
  return { role, name, birthDate, personalId };
}

function collectPersonsFromParties(parties: unknown): PortfolioPersonEntry[] {
  if (!parties || typeof parties !== "object") return [];
  const out: PortfolioPersonEntry[] = [];
  for (const [pk, pv] of Object.entries(parties as Record<string, unknown>)) {
    const role = mapPartyKeyToRole(pk);
    if (Array.isArray(pv)) {
      for (const item of pv) {
        const p = normalizeOnePerson(item, role);
        if (p) out.push(p);
      }
    } else {
      const p = normalizeOnePerson(pv, role);
      if (p) out.push(p);
    }
  }
  return out;
}

function collectPersonsFromInsuredPersons(raw: unknown): PortfolioPersonEntry[] {
  if (raw == null) return [];
  const out: PortfolioPersonEntry[] = [];
  const list = Array.isArray(raw) ? raw : [raw];
  for (const item of list) {
    const p = normalizeOnePerson(item, "insured");
    if (p) out.push(p);
  }
  return out;
}

function riskLabelFromRow(r: Record<string, unknown>): string | undefined {
  const label =
    (typeof r.label === "string" && r.label.trim()) ||
    (typeof r.name === "string" && r.name.trim()) ||
    (typeof r.coverageName === "string" && r.coverageName.trim()) ||
    (typeof r.riskName === "string" && r.riskName.trim()) ||
    (typeof r.type === "string" && r.type.trim());
  return label || undefined;
}

function collectRisksFromList(raw: unknown): PortfolioRiskEntry[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];
  const out: PortfolioRiskEntry[] = [];
  for (const row of raw.slice(0, 48)) {
    if (row == null) continue;
    if (typeof row === "string") {
      const t = row.trim();
      if (t) out.push({ label: t });
      continue;
    }
    if (typeof row !== "object") continue;
    const r = row as Record<string, unknown>;
    const label = riskLabelFromRow(r);
    if (!label) continue;
    const amountRaw =
      r.amount ?? r.sumInsured ?? r.sum ?? r.coverageAmount ?? r.insuredAmount ?? r.capital;
    const amount =
      amountRaw != null && amountRaw !== "" ? (typeof amountRaw === "string" ? amountRaw : String(amountRaw)) : undefined;
    const personRef =
      typeof r.insuredPerson === "string"
        ? r.insuredPerson.trim()
        : typeof r.personName === "string"
          ? r.personName.trim()
          : typeof r.person === "string"
            ? r.person.trim()
            : undefined;
    const description =
      typeof r.description === "string" ? r.description.trim() : typeof r.note === "string" ? r.note.trim() : undefined;
    out.push({ label, amount, personRef, description });
  }
  return out;
}

function mergeRiskLists(lists: PortfolioRiskEntry[][]): PortfolioRiskEntry[] {
  const seen = new Set<string>();
  const out: PortfolioRiskEntry[] = [];
  for (const list of lists) {
    for (const r of list) {
      const key = `${r.label}|${r.amount ?? ""}|${r.personRef ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(r);
    }
  }
  return out;
}

function mergePersonLists(lists: PortfolioPersonEntry[][]): PortfolioPersonEntry[] {
  const seen = new Set<string>();
  const out: PortfolioPersonEntry[] = [];
  for (const list of lists) {
    for (const p of list) {
      const key = `${p.role}|${p.name ?? ""}|${p.personalId ?? ""}|${p.birthDate ?? ""}`;
      if (seen.has(key)) continue;
      seen.add(key);
      out.push(p);
    }
  }
  return out;
}

/**
 * Sloučení při aplikaci review: pole `persons` a `risks` z nového extraktu přepisují stará,
 * ostatní klíče se dělají mělkým merge (next přebíjí prev).
 */
export function mergePortfolioAttributesForApply(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...prev, ...next };
  if (Array.isArray(next.persons)) merged.persons = next.persons;
  if (Array.isArray(next.risks)) merged.risks = next.risks;
  return merged;
}

export function buildPortfolioAttributesFromExtracted(extracted: unknown): Record<string, unknown> {
  if (!extracted || typeof extracted !== "object") return {};
  const root = extracted as Record<string, unknown>;
  const p = flattenExtractForPortfolio(root);
  const out: Record<string, unknown> = {};
  const loan = p.loanAmount ?? p.loanPrincipal ?? p.principalAmount ?? p.creditAmount;
  if (loan != null && loan !== "") out.loanPrincipal = typeof loan === "string" ? loan : String(loan);
  const sum = p.sumInsured ?? p.totalCoverage ?? p.insuredAmount;
  if (sum != null && sum !== "") out.sumInsured = typeof sum === "string" ? sum : String(sum);
  if (p.insuredPersons != null) out.insuredPersons = p.insuredPersons;
  if (p.vehicleRegistration != null) out.vehicleRegistration = String(p.vehicleRegistration);
  if (p.propertyAddress != null) out.propertyAddress = String(p.propertyAddress);

  const subRaw = p.subcategory ?? p.portfolioSubcategory ?? p.productSubcategory;
  if (typeof subRaw === "string" && subRaw.trim()) {
    const s = subRaw.trim().toLowerCase();
    if (s.includes("child") || s === "child_coverage" || s.includes("dětsk")) {
      out.subcategory = "child_coverage";
    }
  }

  const cov = p.coverageLines ?? p.coverages ?? p.insuranceCoverages;
  if (Array.isArray(cov) && cov.length > 0) {
    const lines: CoverageLineUi[] = [];
    for (const row of cov.slice(0, 24)) {
      if (row && typeof row === "object") {
        const r = row as Record<string, unknown>;
        const label =
          typeof r.label === "string"
            ? r.label
            : typeof r.name === "string"
              ? r.name
              : typeof r.coverageName === "string"
                ? r.coverageName
                : undefined;
        const amount =
          r.amount != null && r.amount !== ""
            ? String(r.amount)
            : r.sumInsured != null
              ? String(r.sumInsured)
              : undefined;
        const description = typeof r.description === "string" ? r.description : undefined;
        if (label || amount || description) lines.push({ label, amount, description });
      } else if (typeof row === "string" && row.trim()) {
        lines.push({ label: row.trim() });
      }
    }
    if (lines.length) out.coverageLines = lines;
  }

  const fix = p.fixationUntil ?? p.rateFixationEnd ?? p.interestFixationUntil ?? p.fixationEndDate;
  if (typeof fix === "string" && fix.trim()) out.loanFixationUntil = fix.trim();

  const mat = p.maturityDate ?? p.loanMaturity ?? p.splatnost ?? p.loanEndDate;
  if (typeof mat === "string" && mat.trim()) out.loanMaturityDate = mat.trim();

  const partiesPersons = collectPersonsFromParties(root.parties);
  const insuredFromFlat = collectPersonsFromInsuredPersons(p.insuredPersons);
  const persons = mergePersonLists([partiesPersons, insuredFromFlat]);
  if (persons.length > 0) out.persons = persons;

  const risksMerged = mergeRiskLists([
    collectRisksFromList(unwrapExtractedCell(p.insuredRisks)),
    collectRisksFromList(unwrapExtractedCell(p.riders)),
    collectRisksFromList(Array.isArray(p.coverages) ? p.coverages : unwrapExtractedCell(p.coverages)),
  ]);
  if (risksMerged.length > 0) out.risks = risksMerged;

  return out;
}
