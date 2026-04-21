/**
 * Derive CRM contract premium fields from AI extraction for apply-to-CRM drafts.
 */

import type { ExtractedContractSchema } from "./extraction-schemas";
import type { DocumentReviewEnvelope } from "./document-review-types";

export function parseMoneyInput(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "number" && Number.isFinite(v) && v >= 0) return v;
  const s = String(v)
    .replace(/\s/g, "")
    .replace(/(\d)[,.](\d{3})\b/g, "$1$2")
    .replace(",", ".")
    .replace(/[^\d.-]/g, "");
  const n = parseFloat(s);
  return Number.isFinite(n) && n >= 0 ? n : null;
}

function annualizeByFrequency(base: number, frequencyRaw: string): number {
  const f = frequencyRaw.toLowerCase();
  if (/year|roč|rocn|annual|yearly|ročne|rocne/.test(f)) return base;
  if (/quarter|čtvrt|ctvrt|kvart/.test(f)) return base * 4;
  if (/month|měsíč|mesic|monthly|měs|mes/.test(f)) return base * 12;
  if (/week|týden|tyden|weekly/.test(f)) return base * 52;
  if (/day|denně|denne|daily/.test(f)) return base * 365;
  // One-time / lump sum — no annualization
  if (/jednorázov|jednorazov|one.?time|lump.?sum|single.?prem/.test(f)) return base;
  // Default: treat as monthly instalment (common for ŽP / penze / invest)
  return base * 12;
}

/** Pick first positive monetary value from candidates. */
export function pickFirstAmount(...candidates: unknown[]): number | null {
  for (const c of candidates) {
    const n = parseMoneyInput(c);
    if (n != null && n > 0) return n;
  }
  return null;
}

export function computeDraftPremiums(
  segment: string,
  extracted: ExtractedContractSchema
): { premiumAmount: string | null; premiumAnnual: string | null } {
  const freq = String(extracted.paymentDetails?.frequency ?? "");
  const base = pickFirstAmount(extracted.paymentDetails?.amount);
  if (base == null) return { premiumAmount: null, premiumAnnual: null };

  if (segment === "HYPO" || segment === "UVER") {
    const s = String(base);
    return { premiumAmount: s, premiumAnnual: s };
  }

  const annual = annualizeByFrequency(base, freq);
  const rounded = Math.round(annual * 100) / 100;
  return { premiumAmount: String(base), premiumAnnual: String(rounded) };
}

function fieldValue(envelope: DocumentReviewEnvelope, key: string): unknown {
  const direct = envelope.extractedFields[key];
  if (direct) return direct.value;
  const stripped = key.replace(/^extractedFields\./, "");
  return envelope.extractedFields[stripped]?.value;
}

/** Premium fields for draft payload from envelope (same sources as legacy projection + common aliases).
 *
 * DŮLEŽITÁ SÉMANTIKA:
 *   • `premiumAmount` v DB = MĚSÍČNÍ částka (u pojištění/penze/invest segmentů).
 *   • `premiumAnnual`  v DB = ROČNÍ  částka.
 *
 * Historický bug (návrh ČSOB Naše odpovědnost, 4 959 Kč/rok → UI ukazoval 4 959 Kč/měs
 * a dopočítával 59 508 Kč/rok): funkce brala první dostupnou částku jako `premiumAmount`
 * bez ohledu na to, jestli pochází z ročního nebo měsíčního pole. Když AI extrahuje
 * pouze `annualPremium` (frekvence = ročně), přiřadila tu samou hodnotu i jako
 * měsíční → roční sazba se interpretovala × 12.
 *
 * Správné pravidlo:
 *   1) monthlyPremium / regularAmount s monthly freq → premiumAmount = ten, premiumAnnual = × 12 (nebo z annualPremium)
 *   2) annualPremium bez monthly → premiumAmount = annual / 12, premiumAnnual = annual
 *   3) regularAmount s jinou freq (quarterly/…) → premiumAmount = base / periodicita → měsíční, premiumAnnual = roční ekvivalent
 */
export function computeDraftPremiumsFromEnvelope(
  envelope: DocumentReviewEnvelope,
  segment: string
): { premiumAmount: string | null; premiumAnnual: string | null } {
  const freq = String(
    fieldValue(envelope, "paymentFrequency") ??
      fieldValue(envelope, "frequency") ??
      ""
  );

  const monthlyExplicit = parseMoneyInput(
    fieldValue(envelope, "monthlyPremium") ??
      fieldValue(envelope, "totalMonthlyPremium")
  );
  const annualExplicit = parseMoneyInput(fieldValue(envelope, "annualPremium"));
  const regularAmount = parseMoneyInput(
    fieldValue(envelope, "regularAmount") ??
      fieldValue(envelope, "premium") ??
      fieldValue(envelope, "installmentAmount") ??
      fieldValue(envelope, "amount")
  );
  const loanAmount = parseMoneyInput(fieldValue(envelope, "loanAmount"));

  const hasAny =
    (monthlyExplicit != null && monthlyExplicit > 0) ||
    (annualExplicit != null && annualExplicit > 0) ||
    (regularAmount != null && regularAmount > 0) ||
    (loanAmount != null && loanAmount > 0);
  if (!hasAny) return { premiumAmount: null, premiumAnnual: null };

  if (segment === "HYPO" || segment === "UVER") {
    const base = monthlyExplicit ?? regularAmount ?? loanAmount ?? annualExplicit;
    const s = base != null ? String(base) : null;
    return { premiumAmount: s, premiumAnnual: s };
  }

  const freqLower = freq.toLowerCase();
  const isOneTime =
    /jednorázov|jednorazov|one.?time|lump.?sum|single.?prem/.test(freqLower);
  if (isOneTime) {
    const base = regularAmount ?? monthlyExplicit ?? annualExplicit;
    return { premiumAmount: base != null ? String(base) : null, premiumAnnual: null };
  }

  const round2 = (n: number) => Math.round(n * 100) / 100;

  // Monthly má prioritu: explicitní monthlyPremium / totalMonthlyPremium,
  // nebo regularAmount s měsíční frekvencí.
  const regularIsMonthly = /month|měsíč|mesic|monthly|měs|mes/.test(freqLower);
  if (monthlyExplicit != null && monthlyExplicit > 0) {
    const monthly = round2(monthlyExplicit);
    const annual = annualExplicit != null && annualExplicit > 0 ? round2(annualExplicit) : round2(monthly * 12);
    return { premiumAmount: String(monthly), premiumAnnual: String(annual) };
  }
  if (regularIsMonthly && regularAmount != null && regularAmount > 0) {
    const monthly = round2(regularAmount);
    const annual = annualExplicit != null && annualExplicit > 0 ? round2(annualExplicit) : round2(monthly * 12);
    return { premiumAmount: String(monthly), premiumAnnual: String(annual) };
  }

  // Jen roční pojistné (typický případ návrhů pojistek — "ročně 4 959 Kč"):
  // přepočti na měsíční ekvivalent. Bez tohoto kroku UI ukazuje roční hodnotu
  // v poli "měsíční", pak z ní udělá × 12 a tváří se, že klient platí 12× víc.
  if (annualExplicit != null && annualExplicit > 0) {
    const annual = round2(annualExplicit);
    const monthly = round2(annual / 12);
    return { premiumAmount: String(monthly), premiumAnnual: String(annual) };
  }

  // Regular amount s jinou frekvencí (čtvrtletně, pololetně, ročně, …) — přepočti
  // na roční ekvivalent a odvoď měsíční.
  if (regularAmount != null && regularAmount > 0) {
    const annual = round2(annualizeByFrequency(regularAmount, freq));
    const monthly = round2(annual / 12);
    return { premiumAmount: String(monthly), premiumAnnual: String(annual) };
  }

  return { premiumAmount: null, premiumAnnual: null };
}
