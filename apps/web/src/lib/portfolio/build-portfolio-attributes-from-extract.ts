/**
 * Jednotné mapování volitelných polí z extraktu do `contracts.portfolio_attributes`.
 * Nevyplňuje odhadované metriky — jen pokud extrakt pole spolehlivě dodává.
 * P2: strukturované osoby (`persons`) a rizika (`risks`) z envelope / extractedFields.
 *
 * Typy JSONB jsou kanonicky v `packages/db` (`schema/portfolio-attributes.ts`).
 */

import type {
  CoverageLineUi,
  PortfolioPersonEntry,
  PortfolioPersonRole,
  PortfolioRiskEntry,
} from "db";
import { normalizeRiskLabel, portfolioRiskDedupKey } from "@/lib/portfolio/portfolio-risks-dedupe";

export type {
  CoverageLineUi,
  PortfolioAttributes,
  PortfolioPersonEntry,
  PortfolioPersonRole,
  PortfolioRiskEntry,
} from "db";

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
    (typeof r.riskLabel === "string" && r.riskLabel.trim()) ||
    (typeof r.label === "string" && r.label.trim()) ||
    (typeof r.name === "string" && r.name.trim()) ||
    (typeof r.coverageName === "string" && r.coverageName.trim()) ||
    (typeof r.riskName === "string" && r.riskName.trim()) ||
    (typeof r.type === "string" && r.type.trim()) ||
    (typeof r.riskType === "string" && r.riskType.trim());
  return label || undefined;
}

/** Normalizuje pole rizik z AI (včetně JSON stringu v buňce extractedFields). */
function collectRisksFromList(raw: unknown): PortfolioRiskEntry[] {
  let list: unknown = raw;
  if (typeof raw === "string") {
    const t = raw.trim();
    if (!t) return [];
    if (t.startsWith("[") || t.startsWith("{")) {
      try {
        const parsed = JSON.parse(t) as unknown;
        if (Array.isArray(parsed)) list = parsed;
        else return [];
      } catch {
        return [{ label: t }];
      }
    } else {
      return [{ label: t }];
    }
  }
  if (!Array.isArray(list) || list.length === 0) return [];
  const out: PortfolioRiskEntry[] = [];
  const seenInList = new Set<string>();
  for (const row of list.slice(0, 48)) {
    if (row == null) continue;
    if (typeof row === "string") {
      const t = row.trim();
      if (!t) continue;
      const k = normalizeRiskLabel(t) + "||";
      if (seenInList.has(k)) continue;
      seenInList.add(k);
      out.push({ label: t });
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
      typeof r.linkedParticipantName === "string"
        ? r.linkedParticipantName.trim()
        : typeof r.linkedParticipant === "string"
          ? r.linkedParticipant.trim()
          : typeof r.insuredPerson === "string"
            ? r.insuredPerson.trim()
            : typeof r.personName === "string"
              ? r.personName.trim()
              : typeof r.person === "string"
                ? r.person.trim()
                : undefined;
    const description =
      typeof r.description === "string"
        ? r.description.trim()
        : typeof r.notes === "string"
          ? r.notes.trim()
          : typeof r.note === "string"
            ? r.note.trim()
            : undefined;
    const coverageEnd =
      typeof r.coverageEnd === "string"
        ? r.coverageEnd.trim()
        : typeof r.termEnd === "string"
          ? r.termEnd.trim()
          : typeof r.policyEnd === "string"
            ? r.policyEnd.trim()
            : typeof r.endDate === "string"
              ? r.endDate.trim()
              : undefined;
    const monthlyRiskPremium =
      typeof r.monthlyRiskPremium === "string"
        ? r.monthlyRiskPremium.trim()
        : typeof r.riskPremiumMonthly === "string"
          ? r.riskPremiumMonthly.trim()
          : r.premium != null && r.premium !== ""
            ? String(r.premium).trim()
            : undefined;
    const entry: PortfolioRiskEntry = {
      label,
      amount,
      ...(coverageEnd ? { coverageEnd } : {}),
      ...(monthlyRiskPremium ? { monthlyRiskPremium } : {}),
      personRef,
      description,
    };
    const k = portfolioRiskDedupKey(entry);
    if (seenInList.has(k)) continue;
    seenInList.add(k);
    out.push(entry);
  }
  return out;
}

function mergeRiskLists(lists: PortfolioRiskEntry[][]): PortfolioRiskEntry[] {
  const seen = new Set<string>();
  const out: PortfolioRiskEntry[] = [];
  for (const list of lists) {
    for (const r of list) {
      const key = portfolioRiskDedupKey(r);
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

function mergeInvestmentFundsArrays(
  prev: unknown,
  next: unknown,
): Array<{ name: string; allocation?: string; isin?: string }> | undefined {
  const out: Array<{ name: string; allocation?: string; isin?: string }> = [];
  const seen = new Set<string>();
  const push = (arr: unknown) => {
    if (!Array.isArray(arr)) return;
    for (const item of arr) {
      if (!item || typeof item !== "object") continue;
      const r = item as Record<string, unknown>;
      const name = typeof r.name === "string" ? r.name.trim() : "";
      if (!name) continue;
      const key = name.toLowerCase();
      if (seen.has(key)) continue;
      seen.add(key);
      out.push({
        name,
        ...(typeof r.allocation === "string" ? { allocation: r.allocation } : {}),
        ...(typeof r.isin === "string" ? { isin: r.isin } : {}),
      });
    }
  };
  push(prev);
  push(next);
  return out.length ? out : undefined;
}

/**
 * Sloučení při aplikaci review: pole `persons` a `risks` z nového extraktu přepisují stará,
 * ostatní klíče se dělají mělkým merge (next přebíjí prev).
 * Investment: `investmentFunds` se sjednocují; platební detaily doplňují mezery bez mazání produktové identity.
 */
export function mergePortfolioAttributesForApply(
  prev: Record<string, unknown>,
  next: Record<string, unknown>,
): Record<string, unknown> {
  const merged: Record<string, unknown> = { ...prev, ...next };
  if (Array.isArray(next.persons)) merged.persons = next.persons;
  if (Array.isArray(next.risks)) {
    if (next.risks.length > 0) merged.risks = next.risks;
    else {
      const prevRisks = prev.risks;
      if (Array.isArray(prevRisks) && prevRisks.length > 0) merged.risks = prevRisks;
      else merged.risks = next.risks;
    }
  }
  const mergedFunds = mergeInvestmentFundsArrays(prev.investmentFunds, next.investmentFunds);
  if (mergedFunds) merged.investmentFunds = mergedFunds;

  const paymentKeys = [
    "paymentVariableSymbol",
    "paymentAccountDisplay",
    "paymentFrequencyLabel",
    "extraPaymentAccountDisplay",
  ] as const;
  for (const k of paymentKeys) {
    const nv = next[k];
    const pv = prev[k];
    if (nv != null && nv !== "") merged[k] = nv;
    else if (pv != null && pv !== "") merged[k] = pv;
  }
  return merged;
}

export function buildPortfolioAttributesFromExtracted(extracted: unknown): Record<string, unknown> {
  if (!extracted || typeof extracted !== "object") return {};
  const root = extracted as Record<string, unknown>;
  const p = flattenExtractForPortfolio(root);
  const out: Record<string, unknown> = {};
  const dc = root.documentClassification as Record<string, unknown> | undefined;
  const primaryType = typeof dc?.primaryType === "string" ? dc.primaryType : "";
  const lifeInsuranceContext =
    primaryType.startsWith("life_insurance") ||
    primaryType === "life_insurance_contract" ||
    primaryType === "life_insurance_final_contract";

  const productFamily = typeof dc?.productFamily === "string" ? dc.productFamily : "";
  const flatSegment =
    typeof p.segment === "string"
      ? p.segment.trim().toUpperCase()
      : typeof (root as { segment?: string }).segment === "string"
        ? (root as { segment?: string }).segment!.trim().toUpperCase()
        : "";
  const investmentExtractionContext =
    !lifeInsuranceContext &&
    (productFamily.toLowerCase() === "investment" ||
      (primaryType.includes("investment") && !primaryType.includes("life_insurance")) ||
      (flatSegment === "INV" || flatSegment === "DIP" || flatSegment === "DPS"));

  if (!lifeInsuranceContext) {
    const loan = p.loanAmount ?? p.loanPrincipal ?? p.principalAmount ?? p.creditAmount;
    if (loan != null && loan !== "") out.loanPrincipal = typeof loan === "string" ? loan : String(loan);
  }
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

  if (!lifeInsuranceContext) {
    const fix = p.fixationUntil ?? p.rateFixationEnd ?? p.interestFixationUntil ?? p.fixationEndDate;
    if (typeof fix === "string" && fix.trim()) out.loanFixationUntil = fix.trim();

    const mat = p.maturityDate ?? p.loanMaturity ?? p.splatnost ?? p.loanEndDate;
    if (typeof mat === "string" && mat.trim()) out.loanMaturityDate = mat.trim();
  }

  const partiesPersons = collectPersonsFromParties(root.parties);
  const insuredFromFlat = collectPersonsFromInsuredPersons(p.insuredPersons);
  let persons = mergePersonLists([partiesPersons, insuredFromFlat]);
  if (investmentExtractionContext && persons.length > 0) {
    persons = persons.filter((x) => x.role !== "policyholder");
  }
  if (persons.length > 0) out.persons = persons;

  /**
   * Dual-view z pole `coverages` (záměr, ne omyl): stejný zdroj se mapuje na
   * `coverageLines` (přehled řádků pro UI) a současně na `risks` (struktura s personRef apod.).
   * Pokud existuje jen `coverageLines`, rizika z něj neodvozujeme — rizika bereme z insuredRisks / riders / coverages.
   */
  const risksMerged = mergeRiskLists([
    collectRisksFromList(unwrapExtractedCell(p.insuredRisks)),
    collectRisksFromList(unwrapExtractedCell(p.riders)),
    collectRisksFromList(Array.isArray(p.coverages) ? p.coverages : unwrapExtractedCell(p.coverages)),
  ]);
  if (risksMerged.length > 0) out.risks = risksMerged;

  // Investment fields
  const strategy = p.investmentStrategy ?? p.strategy;
  if (typeof strategy === "string" && strategy.trim()) out.investmentStrategy = strategy.trim();

  const horizon = p.investmentHorizon ?? p.horizon;
  if (typeof horizon === "string" && horizon.trim()) out.investmentHorizon = horizon.trim();

  const targetAmt = p.targetAmount ?? p.intendedInvestment ?? p.investmentAmount;
  if (targetAmt != null && targetAmt !== "") out.targetAmount = typeof targetAmt === "string" ? targetAmt : String(targetAmt);

  const expectedFv = p.expectedFutureValue;
  if (typeof expectedFv === "string" && expectedFv.trim()) out.expectedFutureValue = expectedFv.trim();

  const rawFunds = p.investmentFunds ?? p.funds;
  if (Array.isArray(rawFunds) && rawFunds.length > 0) {
    const funds: Array<{ name: string; allocation?: string; isin?: string }> = [];
    for (const f of rawFunds.slice(0, 20)) {
      if (f && typeof f === "object") {
        const r = f as Record<string, unknown>;
        const name = typeof r.name === "string" ? r.name.trim() : undefined;
        if (!name) continue;
        const allocation = r.allocation != null ? String(r.allocation).trim() : undefined;
        const isin = typeof r.isin === "string" ? r.isin.trim() : undefined;
        funds.push({ name, ...(allocation ? { allocation } : {}), ...(isin ? { isin } : {}) });
      }
    }
    if (funds.length > 0) out.investmentFunds = funds;
  }

  // DPS/DIP contributions
  const partContrib = p.participantContribution;
  if (typeof partContrib === "string" && partContrib.trim()) out.participantContribution = partContrib.trim();
  const empContrib = p.employerContribution;
  if (typeof empContrib === "string" && empContrib.trim()) out.employerContribution = empContrib.trim();

  // Fund-library resolution backbone fields (Fáze 1)
  if (typeof p.resolvedFundId === "string" && p.resolvedFundId.trim()) {
    out.resolvedFundId = p.resolvedFundId.trim();
  }
  if (typeof p.resolvedFundCategory === "string" && p.resolvedFundCategory.trim()) {
    out.resolvedFundCategory = p.resolvedFundCategory.trim();
  }
  if (typeof p.fvSourceType === "string" && p.fvSourceType.trim()) {
    out.fvSourceType = p.fvSourceType.trim();
  }

  // Praktický lékař (u ŽP)
  const gp = p.generalPractitioner ?? p.practitioner ?? p.doctor;
  if (typeof gp === "string" && gp.trim()) out.generalPractitioner = gp.trim();

  if (lifeInsuranceContext) {
    const vs = p.variableSymbol;
    if (typeof vs === "string" && vs.trim()) out.paymentVariableSymbol = vs.trim();
    const ba = p.bankAccount ?? p.recipientAccount ?? p.paymentAccountNumber;
    if (typeof ba === "string" && ba.trim()) out.paymentAccountDisplay = ba.trim();
    const freq = p.paymentFrequency ?? p.premiumFrequency;
    if (typeof freq === "string" && freq.trim()) out.paymentFrequencyLabel = freq.trim();
    const invp = p.investmentPremium;
    if (typeof invp === "string" && invp.trim()) out.investmentPremiumLabel = invp.trim();
    const extraAcc = p.extraPaymentAccount ?? p.accountForExtraPremium;
    if (typeof extraAcc === "string" && extraAcc.trim()) out.extraPaymentAccountDisplay = extraAcc.trim();
  }

  if (investmentExtractionContext) {
    const vs = p.variableSymbol;
    if (typeof vs === "string" && vs.trim()) out.paymentVariableSymbol = vs.trim();
    const ba = p.bankAccount ?? p.recipientAccount ?? p.paymentAccountNumber ?? p.iban;
    if (typeof ba === "string" && ba.trim()) out.paymentAccountDisplay = ba.trim();
    const freq = p.paymentFrequency ?? p.premiumFrequency;
    if (typeof freq === "string" && freq.trim()) out.paymentFrequencyLabel = freq.trim();
  }

  return out;
}
