/**
 * AI Photo / Image Intake — advanced case/opportunity signal extraction v1 (Phase 5).
 *
 * Extracts structured binding-assist signals from existing fact bundles and
 * classification results. These signals help case/opportunity binding v2 but
 * do NOT produce confident auto-picks on their own.
 *
 * Safety rules:
 * - All signals are evidence-backed (from existing extracted facts)
 * - Signals are marked bindingAssistOnly: true
 * - No model calls — pure transformation of existing extraction output
 * - Weak signals do not trigger confident case binding
 * - Signals feed into binding v2 as hints only
 *
 * Cost: Zero additional model calls.
 */

import type {
  ExtractedFactBundle,
  InputClassificationResult,
  CaseOpportunitySignal,
  CaseSignalBundle,
  CaseSignalStrength,
} from "./types";

// ---------------------------------------------------------------------------
// Signal detection patterns (keyword-based, no model)
// ---------------------------------------------------------------------------

const PRODUCT_TYPE_KEYWORDS = [
  { term: /hypotéka|mortgage|refinanc/i, label: "Hypotéka / Refinancování" },
  { term: /pojistka|pojištění|insurance/i, label: "Pojistka / Pojištění" },
  { term: /investice|investiční|fund|podílový/i, label: "Investice" },
  { term: /leasing|auto.*úvěr|car.*loan/i, label: "Leasing / Auto úvěr" },
  { term: /spořicí|savings|termínovaný/i, label: "Spoření" },
  { term: /důchodové|penzijní|pension/i, label: "Penzijní připojištění" },
  { term: /životní pojist/i, label: "Životní pojistka" },
];

const BANK_KEYWORDS = [
  /česk[áé] spořitelna|komerčn[íi] bank[ay]|kb banka|moneta|unicredit|raiffeisen|air bank|fio banka/i,
  /čsob|citibank|mbank|equa bank|creditas|oberbank/i,
];

const DEADLINE_PATTERNS = [
  /do \d+\.\s?\d+\.\s?\d{4}/i,
  /termín|deadline|nejpozději|do konce|platnost do/i,
  /schůzka|meeting|call.*v \d/i,
];

const PROCESS_REFERENCE_PATTERNS = [
  /smlouva č\.|číslo žádosti|referenční číslo|číslo nabídky|variabilní symbol/i,
  /žádost|nabídka č\.|kontrakt/i,
  /objednávka|order.*#|req.*#/i,
];

// ---------------------------------------------------------------------------
// Signal extraction helpers
// ---------------------------------------------------------------------------

function detectProductTypeSignals(
  facts: ExtractedFactBundle["facts"],
  assetId: string,
): CaseOpportunitySignal[] {
  const signals: CaseOpportunitySignal[] = [];

  for (const fact of facts) {
    const raw = String(fact.value ?? "");
    if (!raw) continue;

    for (const { term, label } of PRODUCT_TYPE_KEYWORDS) {
      if (term.test(raw)) {
        signals.push({
          signalType: "product_type_mention",
          rawValue: raw.slice(0, 120),
          normalizedValue: label,
          strength: fact.confidence >= 0.8 ? "strong" : fact.confidence >= 0.6 ? "moderate" : "weak",
          evidenceText: raw.slice(0, 100),
          sourceAssetId: assetId,
          bindingAssistOnly: true,
        });
        break; // one signal per fact
      }
    }
  }

  return signals;
}

function detectBankSignals(
  facts: ExtractedFactBundle["facts"],
  assetId: string,
): CaseOpportunitySignal[] {
  const signals: CaseOpportunitySignal[] = [];

  for (const fact of facts) {
    const raw = String(fact.value ?? "");
    if (!raw) continue;

    for (const pattern of BANK_KEYWORDS) {
      const match = raw.match(pattern);
      if (match) {
        signals.push({
          signalType: "bank_or_institution_mention",
          rawValue: raw.slice(0, 120),
          normalizedValue: match[0],
          strength: "moderate",
          evidenceText: raw.slice(0, 100),
          sourceAssetId: assetId,
          bindingAssistOnly: true,
        });
        break;
      }
    }
  }

  return signals;
}

function detectDeadlineSignals(
  facts: ExtractedFactBundle["facts"],
  assetId: string,
): CaseOpportunitySignal[] {
  const signals: CaseOpportunitySignal[] = [];

  // Look in due_date, possible_dates fact keys, and any other text
  const relevantFacts = facts.filter((f) =>
    ["due_date", "possible_dates", "required_follow_up", "what_client_wants"].includes(f.factKey),
  );

  for (const fact of relevantFacts) {
    const raw = String(fact.value ?? "");
    if (!raw) continue;

    for (const pattern of DEADLINE_PATTERNS) {
      if (pattern.test(raw)) {
        signals.push({
          signalType: "deadline_or_date_mention",
          rawValue: raw.slice(0, 120),
          normalizedValue: raw.slice(0, 80),
          strength: fact.factKey === "due_date" ? "strong" : "moderate",
          evidenceText: raw.slice(0, 100),
          sourceAssetId: assetId,
          bindingAssistOnly: true,
        });
        break;
      }
    }
  }

  return signals;
}

function detectProcessReferenceSignals(
  facts: ExtractedFactBundle["facts"],
  assetId: string,
): CaseOpportunitySignal[] {
  const signals: CaseOpportunitySignal[] = [];

  for (const fact of facts) {
    const raw = String(fact.value ?? "");
    if (!raw) continue;

    for (const pattern of PROCESS_REFERENCE_PATTERNS) {
      if (pattern.test(raw)) {
        signals.push({
          signalType: "existing_process_reference",
          rawValue: raw.slice(0, 120),
          normalizedValue: raw.slice(0, 80),
          strength: "moderate",
          evidenceText: raw.slice(0, 100),
          sourceAssetId: assetId,
          bindingAssistOnly: true,
        });
        break;
      }
    }
  }

  return signals;
}

function detectFinancialAmountSignals(
  facts: ExtractedFactBundle["facts"],
  assetId: string,
): CaseOpportunitySignal[] {
  const signals: CaseOpportunitySignal[] = [];
  const amountFact = facts.find((f) =>
    ["amount", "transaction_amount", "balance"].includes(f.factKey) && f.value,
  );
  if (!amountFact) return signals;

  const raw = String(amountFact.value);
  if (/\d/.test(raw)) {
    signals.push({
      signalType: "financial_amount_hint",
      rawValue: raw.slice(0, 80),
      normalizedValue: raw.slice(0, 60),
      strength: amountFact.confidence >= 0.8 ? "strong" : "moderate",
      evidenceText: raw.slice(0, 80),
      sourceAssetId: assetId,
      bindingAssistOnly: true,
    });
  }

  return signals;
}

// ---------------------------------------------------------------------------
// Overall strength aggregation
// ---------------------------------------------------------------------------

function aggregateStrength(signals: CaseOpportunitySignal[]): CaseSignalStrength | "none" {
  if (signals.length === 0) return "none";
  if (signals.some((s) => s.strength === "strong")) return "strong";
  if (signals.some((s) => s.strength === "moderate")) return "moderate";
  return "weak";
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

/**
 * Extracts case/opportunity binding-assist signals from an existing fact bundle.
 *
 * Pure function — no model calls. Operates on already-extracted facts.
 * Returns a CaseSignalBundle safe for passing to binding v2 as hints.
 *
 * @param factBundle The extracted fact bundle for this asset
 * @param classification The classifier result for context
 * @param assetId Source asset ID for evidence tracking
 */
export function extractCaseSignals(
  factBundle: ExtractedFactBundle,
  classification: InputClassificationResult | null,
  assetId: string,
): CaseSignalBundle {
  const allSignals: CaseOpportunitySignal[] = [
    ...detectProductTypeSignals(factBundle.facts, assetId),
    ...detectBankSignals(factBundle.facts, assetId),
    ...detectDeadlineSignals(factBundle.facts, assetId),
    ...detectProcessReferenceSignals(factBundle.facts, assetId),
    ...detectFinancialAmountSignals(factBundle.facts, assetId),
  ];

  // Deduplicate by signalType + normalizedValue
  const seen = new Set<string>();
  const deduped = allSignals.filter((s) => {
    const key = `${s.signalType}:${s.normalizedValue ?? s.rawValue.slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const overallStrength = aggregateStrength(deduped);

  const summary =
    deduped.length === 0
      ? null
      : deduped
          .slice(0, 3)
          .map((s) => s.normalizedValue ?? s.rawValue.slice(0, 40))
          .join(", ");

  return {
    signals: deduped,
    overallStrength,
    summary,
  };
}

/**
 * Merges multiple CaseSignalBundles (for thread/grouped assets) into one.
 */
export function mergeCaseSignalBundles(bundles: CaseSignalBundle[]): CaseSignalBundle {
  const allSignals = bundles.flatMap((b) => b.signals);

  // Deduplicate
  const seen = new Set<string>();
  const deduped = allSignals.filter((s) => {
    const key = `${s.signalType}:${s.normalizedValue ?? s.rawValue.slice(0, 30)}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  const overallStrength = aggregateStrength(deduped);
  const summary =
    deduped.length === 0
      ? null
      : deduped
          .slice(0, 3)
          .map((s) => s.normalizedValue ?? s.rawValue.slice(0, 40))
          .join(", ");

  return { signals: deduped, overallStrength, summary };
}
