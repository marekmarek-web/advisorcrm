import type { DocumentReviewEnvelope, ReviewWarning } from "./document-review-types";
import { logAiReviewLearningEvent } from "./ai-review-learning-observability";

export type UploadIntentForPublish = {
  isModelation?: boolean;
};

export type LearningValidatorResult = {
  envelope: DocumentReviewEnvelope;
  warnings: ReviewWarning[];
  autoFixesApplied: string[];
};

function toNumber(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value)) return value;
  if (typeof value !== "string") return null;
  const normalized = value.replace(/\s/g, "").replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function approxEqual(a: number, b: number, tolerance = 0.01): boolean {
  return Math.abs(a - b) <= tolerance;
}

export function expectedInsuredCountFromText(documentText: string): number | null {
  const text = documentText.toLowerCase();
  const countLine = text.match(/počet\s+pojištěných\s*:[^\n\r]*/i)?.[0] ?? "";
  if (countLine) {
    const adults = Number.parseInt(countLine.match(/(\d+)\s*dospěl/i)?.[1] ?? "0", 10);
    const children = Number.parseInt(countLine.match(/(\d+)\s*d[ií]t[eě]/i)?.[1] ?? "0", 10);
    const total = adults + children;
    if (total > 0) return total;
  }
  const numbered = [...text.matchAll(/(\d+)\.\s*pojištěn/gi)]
    .map((match) => Number.parseInt(match[1], 10))
    .filter(Number.isFinite);
  if (numbered.length) return Math.max(...numbered);
  return null;
}

function markAdvisorDecisionRequired(envelope: DocumentReviewEnvelope): void {
  const mutable = envelope as DocumentReviewEnvelope & {
    requiresAdvisorDecision?: boolean;
    reviewRequired?: boolean;
  };
  mutable.requiresAdvisorDecision = true;
  mutable.reviewRequired = true;
}

function appendWarning(envelope: DocumentReviewEnvelope, warning: ReviewWarning): void {
  envelope.reviewWarnings = envelope.reviewWarnings ?? [];
  if (!envelope.reviewWarnings.some((existing) => existing.code === warning.code && existing.field === warning.field)) {
    envelope.reviewWarnings.push(warning);
    logAiReviewLearningEvent("validator_warning_created", {
      code: warning.code,
      field: warning.field ?? null,
      severity: warning.severity ?? null,
    });
  }
}

export function validateParticipantCount(envelope: DocumentReviewEnvelope, documentText: string): ReviewWarning[] {
  const expected = expectedInsuredCountFromText(documentText);
  if (!expected) return [];
  const actual = envelope.insuredPersons?.length || envelope.participants?.length || 0;
  if (actual >= expected) return [];
  markAdvisorDecisionRequired(envelope);
  const warning = {
    code: "participant_count_mismatch",
    message: `Dokument naznačuje ${expected} pojištěné osoby, ale extrakce obsahuje ${actual}. Ověřte seznam účastníků.`,
    field: "participants",
    severity: "critical",
  } as const satisfies ReviewWarning;
  appendWarning(envelope, warning);
  return [warning];
}

function parseCzechMoney(raw: string): number | null {
  const normalized = raw
    .replace(/\s+/g, "")
    .replace(/[^\d,.-]/g, "")
    .replace(",", ".");
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

export function extractPerInsuredMonthlyPremiums(documentText: string): Array<{ order: number; amount: number }> {
  const text = documentText.replace(/\u00a0/g, " ");
  const rows: Array<{ order: number; amount: number }> = [];
  const patterns = [
    /celkov[eé]\s+b[eě][zž]n[eé]\s+m[eě]s[ií][cč]n[ií]\s+pojistn[eé]\s+pro\s+(\d+)\.\s+pojištěn(?:ého|ou|y)?[^\d]{0,80}([\d\s]+(?:[,.]\d{1,2})?)\s*(?:kč|czk)?/gi,
    /m[eě]s[ií][cč]n[ií]\s+pojistn[eé]\s+pro\s+(\d+)\.\s+pojištěn(?:ého|ou|y)?[^\d]{0,80}([\d\s]+(?:[,.]\d{1,2})?)\s*(?:kč|czk)?/gi,
  ];
  for (const pattern of patterns) {
    for (const match of text.matchAll(pattern)) {
      const order = Number.parseInt(match[1] ?? "", 10);
      const amount = parseCzechMoney(match[2] ?? "");
      if (Number.isFinite(order) && order > 0 && amount != null) {
        rows.push({ order, amount });
      }
    }
  }
  const byOrder = new Map<number, number>();
  for (const row of rows) byOrder.set(row.order, row.amount);
  return [...byOrder.entries()]
    .sort(([a], [b]) => a - b)
    .map(([order, amount]) => ({ order, amount }));
}

export function validatePremiumAggregation(envelope: DocumentReviewEnvelope, documentText: string): LearningValidatorResult {
  const warnings: ReviewWarning[] = [];
  const autoFixesApplied: string[] = [];
  const textPremiums = extractPerInsuredMonthlyPremiums(documentText);
  const structuredPremiums = (envelope.insuredPersons ?? [])
    .map((person, index) => ({ order: Number(person.order ?? index + 1), amount: toNumber(person.monthlyPremium) }))
    .filter((row): row is { order: number; amount: number } => row.amount != null);
  const premiumRows = textPremiums.length >= 2 ? textPremiums : structuredPremiums;
  const insuredPremiums = premiumRows
    .map((row) => row.amount)
    .filter((value): value is number => value != null);
  const hasNumberedPremiumRows =
    /celkov[eé]\s+b[eě][zž]n[eé]\s+m[eě]s[ií][cč]n[ií]\s+pojistn[eé]\s+pro\s+1\.\s+pojištěn/i.test(documentText) &&
    /celkov[eé]\s+b[eě][zž]n[eé]\s+m[eě]s[ií][cč]n[ií]\s+pojistn[eé]\s+pro\s+2\.\s+pojištěn/i.test(documentText);
  if (insuredPremiums.length < 2 && !hasNumberedPremiumRows) {
    return { envelope, warnings, autoFixesApplied };
  }

  const sum = insuredPremiums.reduce((acc, value) => acc + value, 0);
  const current = toNumber(envelope.premium?.totalMonthlyPremium);
  if (sum <= 0 || current == null || approxEqual(current, sum)) {
    return { envelope, warnings, autoFixesApplied };
  }

  if (insuredPremiums.length >= 2 && approxEqual(current, insuredPremiums[0])) {
    envelope.premium = {
      frequency: envelope.premium?.frequency ?? "monthly",
      totalAnnualPremium: envelope.premium?.totalAnnualPremium,
      validationWarnings: envelope.premium?.validationWarnings ?? [],
      calculationBreakdown: premiumRows.map((row) => ({
        label: `${row.order}. pojištěný`,
        amount: row.amount,
        frequency: "monthly",
      })),
      totalMonthlyPremium: sum,
      source: "sum_of_insured_persons",
    };
    autoFixesApplied.push("premium.totalMonthlyPremium=sum_of_insured_persons");
    logAiReviewLearningEvent("validator_autofix_applied", {
      autofix: "premium.totalMonthlyPremium=sum_of_insured_persons",
      field: "premium.totalMonthlyPremium",
    });
    const warning = {
      code: "premium_total_autofixed_from_insured_sum",
      message: "Celkové měsíční pojistné bylo dopočteno jako součet pojistného pojištěných osob.",
      field: "premium.totalMonthlyPremium",
      severity: "warning",
    } as const satisfies ReviewWarning;
    appendWarning(envelope, warning);
    warnings.push(warning);
    return { envelope, warnings, autoFixesApplied };
  }

  markAdvisorDecisionRequired(envelope);
  const warning = {
    code: "premium_total_mismatch",
    message: "Celkové měsíční pojistné neodpovídá součtu pojistného pojištěných osob. Ověřte částky oproti dokumentu.",
    field: "premium.totalMonthlyPremium",
    severity: "critical",
  } as const satisfies ReviewWarning;
  appendWarning(envelope, warning);
  warnings.push(warning);
  return { envelope, warnings, autoFixesApplied };
}

export function validatePublishEligibility(params: {
  envelope: DocumentReviewEnvelope;
  uploadIntent?: UploadIntentForPublish | null;
  reviewApproved: boolean;
}): { shouldPublishToCrm: boolean; warnings: ReviewWarning[] } {
  const isModelation = params.uploadIntent?.isModelation === true || params.envelope.userDeclaredDocumentIntent?.isModelation === true;
  const shouldPublishToCrm = params.reviewApproved && !isModelation;
  const lifecycle = params.envelope.documentClassification?.lifecycleStatus?.toLowerCase?.() ?? "";
  const hasProposalSignal = /proposal|offer|modelation|illustration|návrh|modelace/.test(lifecycle);
  const proposalWarning: ReviewWarning[] = hasProposalSignal && !isModelation
    ? [{
        code: "proposal_signal_review",
        message: "Dokument obsahuje znaky návrhu/modelace. Ověřte před schválením.",
        field: "documentClassification.lifecycleStatus",
        severity: "warning",
      }]
    : [];
  return {
    shouldPublishToCrm,
    warnings: isModelation
      ? [{
          code: "publish_blocked_by_upload_intent_modelation",
          message: "Zápis do CRM je blokovaný pouze deklarovanou modelací při nahrání, ne samotnou AI klasifikací.",
          field: "publishHints.contractPublishable",
          severity: "warning",
        }]
      : proposalWarning,
  };
}

export function validateCriticalFields(envelope: DocumentReviewEnvelope): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];
  const primaryType = envelope.documentClassification?.primaryType ?? "";
  const criticalContractLikeDocument =
    /contract|insurance|mortgage|loan|pension|investment|payment/i.test(primaryType) &&
    !/supporting|income|payslip|tax|identity|medical|consent/i.test(primaryType);
  if (!criticalContractLikeDocument) return warnings;
  const ef = envelope.extractedFields ?? {};
  if (!ef.contractNumber?.value) {
    warnings.push({ code: "critical_contract_number_missing", message: "Chybí číslo smlouvy.", field: "contractNumber", severity: "critical" });
  }
  if (!ef.institutionName?.value && !ef.insurer?.value) {
    warnings.push({ code: "critical_institution_missing", message: "Chybí instituce.", field: "institutionName", severity: "critical" });
  }
  if (!ef.productName?.value) {
    warnings.push({ code: "critical_product_missing", message: "Chybí produkt.", field: "productName", severity: "critical" });
  }
  if (!ef.policyHolderFullName?.value && !ef.clientName?.value && !envelope.parties?.policyHolder) {
    warnings.push({ code: "critical_policy_holder_missing", message: "Chybí pojistník nebo klient.", field: "policyHolder.fullName", severity: "critical" });
  }
  if (!envelope.premium?.totalMonthlyPremium && !ef.totalMonthlyPremium?.value && !ef.premiumAmount?.value) {
    warnings.push({ code: "critical_premium_total_missing", message: "Chybí celkové pojistné.", field: "premium.totalMonthlyPremium", severity: "critical" });
  }
  if (!envelope.premium?.frequency && !ef.paymentFrequency?.value && !ef.premiumFrequency?.value) {
    warnings.push({ code: "critical_premium_frequency_missing", message: "Chybí frekvence pojistného.", field: "premium.frequency", severity: "critical" });
  }
  warnings.forEach((warning) => appendWarning(envelope, warning));
  return warnings;
}

export function applyValidatorHints(
  envelope: DocumentReviewEnvelope,
  validatorHints: Record<string, unknown>[],
): ReviewWarning[] {
  const warnings: ReviewWarning[] = [];
  for (const hint of validatorHints) {
    if (hint.rule === "require_numbered_participants" && (envelope.insuredPersons?.length ?? 0) < 2) {
      const warning = {
        code: "learning_pattern_participant_check",
        message: "Dřívější schválené opravy pro tento kontext často doplňovaly další pojištěné osoby. Ověřte je v aktuálním dokumentu.",
        field: "participants",
        severity: "warning",
      } as const satisfies ReviewWarning;
      appendWarning(envelope, warning);
      warnings.push(warning);
    }
  }
  return warnings;
}

export const validateCorrectionPatterns = applyValidatorHints;

export function runAiReviewLearningValidators(params: {
  envelope: DocumentReviewEnvelope;
  documentText: string;
  uploadIntent?: UploadIntentForPublish | null;
  reviewApproved?: boolean;
  validatorHints?: Record<string, unknown>[];
}): LearningValidatorResult & { shouldPublishToCrm: boolean } {
  const premium = validatePremiumAggregation(params.envelope, params.documentText);
  const publish = validatePublishEligibility({
    envelope: premium.envelope,
    uploadIntent: params.uploadIntent,
    reviewApproved: params.reviewApproved ?? false,
  });
  const warnings = [
    ...validateParticipantCount(premium.envelope, params.documentText),
    ...premium.warnings,
    ...validateCriticalFields(premium.envelope),
    ...applyValidatorHints(premium.envelope, params.validatorHints ?? []),
    ...publish.warnings,
  ];
  return {
    envelope: premium.envelope,
    warnings,
    autoFixesApplied: premium.autoFixesApplied,
    shouldPublishToCrm: publish.shouldPublishToCrm,
  };
}
