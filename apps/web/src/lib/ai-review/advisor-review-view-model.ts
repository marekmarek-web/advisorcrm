import type { DocumentReviewEnvelope, PrimaryDocumentType } from "../ai/document-review-types";
import { buildAllDraftActions, pruneRedundantDraftActions } from "../ai/draft-actions";
import type { DraftActionBase } from "../ai/review-queue";
import { getDocumentTypeLabel } from "../ai/document-messages";
import { getReasonMessage } from "../ai/reason-codes";
import { formatAiClassifierForAdvisor } from "./czech-labels";
import type { AdvisorReviewViewModel, DraftAction, PaymentSyncPreview } from "./types";
import {
  buildCanonicalPaymentPayload,
  isPaymentSyncReady,
  hasPaymentTarget,
  missingRequiredPaymentFields,
  PAYMENT_FIELD_SPECS,
} from "../ai/payment-field-contract";

function fv(env: DocumentReviewEnvelope, key: string): unknown {
  return env.extractedFields[key]?.value;
}

function str(v: unknown): string {
  if (v == null || v === "") return "";
  return String(v).trim();
}

function formatMoneyLine(env: DocumentReviewEnvelope): string {
  const parts: string[] = [];
  const amt =
    str(fv(env, "totalMonthlyPremium")) ||
    str(fv(env, "premiumAmount")) ||
    str(fv(env, "monthlyPremium")) ||
    str(fv(env, "regularAmount")) ||
    str(fv(env, "installmentAmount"));
  const freq = str(fv(env, "paymentFrequency")) || str(fv(env, "premiumFrequency"));
  if (amt) {
    parts.push(freq ? `${amt} (${freq})` : amt);
  }
  const vs = str(fv(env, "variableSymbol"));
  if (vs) parts.push(`VS ${vs}`);
  const iban = str(fv(env, "iban"));
  const acc = str(fv(env, "bankAccount"));
  if (iban) parts.push(`IBAN: ${iban}`);
  else if (acc) parts.push(`Účet: ${acc}`);
  const pt = str(fv(env, "paymentType"));
  if (/trval|standing|direct/i.test(pt) || /trvalý/i.test(pt)) {
    parts.push("trvalý příkaz");
  }
  return parts.length ? parts.join(" · ") : "—";
}

function clientLine(env: DocumentReviewEnvelope): string {
  const name =
    str(fv(env, "fullName")) ||
    str(fv(env, "clientFullName")) ||
    [str(fv(env, "firstName")), str(fv(env, "lastName"))].filter(Boolean).join(" ");
  const bits = [name].filter(Boolean);
  const email = str(fv(env, "clientEmail")) || str(fv(env, "email"));
  const phone = str(fv(env, "clientPhone")) || str(fv(env, "phone"));
  if (email) bits.push(email);
  if (phone) bits.push(phone);
  return bits.length ? bits.join(" · ") : "—";
}

function productLine(env: DocumentReviewEnvelope): string {
  const prod = str(fv(env, "productName"));
  const inst =
    str(fv(env, "institutionName")) || str(fv(env, "insurer")) || str(fv(env, "provider"));
  const cn = str(fv(env, "contractNumber")) || str(fv(env, "existingPolicyNumber"));
  const parts = [prod, inst].filter(Boolean);
  if (cn) parts.push(`ref. ${cn}`);
  return parts.length ? parts.join(" · ") : "—";
}

function sensitivityLine(env: DocumentReviewEnvelope): string {
  const sp = env.sensitivityProfile;
  if (sp === "health_data" || sp === "special_category_data" || sp === "high_sensitivity_scan") {
    return "V dokumentu jsou údaje citlivé kategorie (např. zdravotní) — zpracovávejte v souladu s interními pravidly a GDPR.";
  }
  const sec = env.sectionSensitivity ?? {};
  const hasHealth = Object.values(sec).some((v) => v === "health_data" || v === "special_category_data");
  if (hasHealth) {
    return "Ve struktuře dokumentu je označena zdravotní nebo jiná citlivá část.";
  }
  return "Standardní osobní údaje — bez zvláštní citlivé kategorie v metadatech.";
}

function humanizeReason(code: string): string {
  if (/^[a-z][a-z0-9_]+$/.test(code)) {
    const m = getReasonMessage(code);
    if (m && m !== code) return m;
  }
  return code;
}

const MAX_ADVISOR_BRIEF_LENGTH = 2000;
const RAW_CODE_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/g;

/**
 * Sanitize LLM-generated advisor summary:
 * - strip raw snake_case pipeline codes,
 * - enforce max length,
 * - prefer Czech content (warn if mostly non-Czech).
 */
function sanitizeAdvisorBrief(
  raw: string | undefined,
  envelope: DocumentReviewEnvelope
): string | undefined {
  if (!raw) return undefined;
  let text = raw.trim();
  if (!text) return undefined;

  text = text.replace(RAW_CODE_PATTERN, (match) => {
    const human = getReasonMessage(match);
    return human && human !== match ? human : "";
  });
  text = text.replace(/\s{2,}/g, " ").trim();

  if (text.length > MAX_ADVISOR_BRIEF_LENGTH) {
    text = text.slice(0, MAX_ADVISOR_BRIEF_LENGTH).replace(/\s+\S*$/, "") + "…";
  }

  const ef = envelope.extractedFields;
  const productName = str(ef.productName?.value);
  const contractNum = str(ef.contractNumber?.value);
  if (productName && !text.includes(productName)) {
    const mentionsAlternate =
      text.toLowerCase().includes(productName.toLowerCase().slice(0, 10));
    if (!mentionsAlternate) {
      text = `Produkt: ${productName}. ${text}`;
    }
  }
  if (contractNum && text.includes(contractNum)) {
    // ok, consistent
  }

  return text || undefined;
}

function buildDeterministicBrief(env: DocumentReviewEnvelope, recognition: string): string | undefined {
  const parts: string[] = [];
  if (recognition) parts.push(recognition);
  const product = str(fv(env, "productName"));
  const insurer = str(fv(env, "insurer")) || str(fv(env, "institutionName"));
  if (product || insurer) parts.push([product, insurer].filter(Boolean).join(" — "));
  const cn = str(fv(env, "contractNumber"));
  if (cn) parts.push(`Č. smlouvy: ${cn}`);
  const mn = str(fv(env, "modelationId"));
  if (mn && mn !== cn) parts.push(`Č. modelace: ${mn}`);
  const lifecycle = env.documentClassification.lifecycleStatus;
  if (lifecycle === "proposal" || lifecycle === "modelation" || lifecycle === "illustration") {
    parts.push("Dokument je označen jako návrh/modelace, ne finální smlouva.");
  }
  return parts.length > 0 ? parts.join(". ") + "." : undefined;
}

const PAYMENT_GATE_MESSAGES: Record<string, string> = {
  PAYMENT_MISSING_AMOUNT: "Chybí částka — platbu nelze zpracovat bez výše.",
  PAYMENT_MISSING_TARGET: "Chybí IBAN nebo číslo účtu — platbu nelze spárovat s příjemcem.",
  PAYMENT_MISSING_FREQUENCY: "Frekvence platby není uvedena — ověřte v dokumentu.",
  PAYMENT_MISSING_IDENTIFIER: "Chybí variabilní nebo konstantní symbol.",
  PAYMENT_MISSING_INSTITUTION: "Není uveden poskytovatel ani produkt.",
  PAYMENT_NEEDS_HUMAN_REVIEW: "Platební údaje vyžadují ruční kontrolu.",
  PAYMENT_LOW_CONFIDENCE: "Nízká jistota platebních údajů — ověřte oproti originálu.",
};

function humanizePaymentGateCode(code: string): string {
  return PAYMENT_GATE_MESSAGES[code] ?? code;
}

/**
 * Phase 3D: build advisor-facing preview of what will happen to payment data
 * when the review is applied. Built from the canonical payment contract so
 * it reflects the same logic as the actual apply path.
 */
function buildPaymentSyncPreview(envelope: DocumentReviewEnvelope): PaymentSyncPreview {
  const lifecycle = envelope.documentClassification.lifecycleStatus;
  const isModelation = lifecycle === "modelation" || lifecycle === "illustration";

  if (isModelation) {
    return {
      status: "skipped_modelation",
      summary: "Dokument je modelace — platební instrukce se nezapisují do klientského záznamu.",
      presentFields: [],
      missingFields: [],
      warnings: [],
    };
  }

  const cp = buildCanonicalPaymentPayload(envelope);
  const hasAnyPayment = cp.amount || cp.iban || cp.accountNumber || cp.variableSymbol;

  if (!hasAnyPayment) {
    return {
      status: "no_payment_data",
      summary: "Žádné platební údaje nebyly nalezeny.",
      presentFields: [],
      missingFields: [],
      warnings: [],
    };
  }

  const missing = missingRequiredPaymentFields(cp);
  const syncReady = isPaymentSyncReady(cp);

  const presentFields: PaymentSyncPreview["presentFields"] = [];
  for (const spec of PAYMENT_FIELD_SPECS) {
    if (spec.tier === "note_only") continue;
    const val = cp[spec.canonical];
    if (val) presentFields.push({ label: spec.label, value: val });
  }

  const warnings: string[] = [];
  if (!cp.variableSymbol && !cp.constantSymbol) {
    warnings.push(humanizePaymentGateCode("PAYMENT_MISSING_IDENTIFIER"));
  }
  if (!cp.paymentFrequency) {
    warnings.push(humanizePaymentGateCode("PAYMENT_MISSING_FREQUENCY"));
  }
  if (!cp.provider && !cp.productName) {
    warnings.push(humanizePaymentGateCode("PAYMENT_MISSING_INSTITUTION"));
  }

  if (!syncReady) {
    const hasTarget = hasPaymentTarget(cp);
    const status = hasTarget || cp.amount ? "will_draft" : "blocked_missing_fields";
    const missingLabels = missing.map((s) => ({ label: s.label }));
    const summaryParts: string[] = [];
    if (!cp.amount) summaryParts.push("částka");
    if (!hasTarget) summaryParts.push("číslo účtu nebo IBAN");
    return {
      status,
      summary: `Platební instrukce se uloží jako návrh (chybí: ${summaryParts.join(", ")}).`,
      presentFields,
      missingFields: missingLabels,
      warnings,
    };
  }

  const targetPart = cp.iban ? `IBAN: ${cp.iban}` : `${cp.accountNumber}/${cp.bankCode}`;
  const amtPart = cp.currency ? `${cp.amount} ${cp.currency}` : cp.amount;
  return {
    status: "will_sync",
    summary: `${amtPart} → ${targetPart}${cp.variableSymbol ? ` VS ${cp.variableSymbol}` : ""}`,
    presentFields,
    missingFields: [],
    warnings,
  };
}

function mergeWorkActions(envelope: DocumentReviewEnvelope): DraftAction[] {
  const deterministic = buildAllDraftActions(envelope) as DraftAction[];
  const fromLlm: DraftAction[] = (envelope.suggestedActions ?? []).map((a, i) => ({
    type: a.type?.trim() || `workflow_suggestion_${i}`,
    label: a.label?.trim() || "Návrh kroku",
    payload: (a.payload ?? {}) as Record<string, unknown>,
  }));
  const merged = pruneRedundantDraftActions([...deterministic, ...fromLlm] as DraftActionBase[]);
  const seenByType = new Set<string>();
  const seenByLabel = new Set<string>();
  const out: DraftAction[] = [];
  for (const a of merged) {
    const typeKey = `${a.type}:${a.label}`;
    const labelKey = (a.label ?? "").trim().toLowerCase();
    if (seenByType.has(typeKey) || seenByLabel.has(labelKey)) continue;
    seenByType.add(typeKey);
    seenByLabel.add(labelKey);
    out.push(a as DraftAction);
  }
  return out.slice(0, 10);
}

function buildDebugSnapshot(
  envelope: DocumentReviewEnvelope,
  extras: {
    reasonsForReview?: string[];
    validationWarnings?: Array<{ code?: string; message: string }>;
    extractionTrace?: Record<string, unknown>;
  }
): Record<string, unknown> {
  return {
    documentClassification: envelope.documentClassification,
    documentMeta: envelope.documentMeta,
    contentFlags: envelope.contentFlags,
    reasonsForReview: extras.reasonsForReview,
    validationWarnings: extras.validationWarnings,
    extractionTrace: extras.extractionTrace,
    candidateMatchesSummary: {
      score: envelope.candidateMatches?.score,
      reason: envelope.candidateMatches?.reason,
    },
  };
}

type BuildArgs = {
  envelope: DocumentReviewEnvelope;
  aiClassifierJson?: Record<string, string>;
  detectedDocumentTypeLabel?: string;
  reasonsForReview?: string[];
  validationWarnings?: Array<{ code?: string; message: string }>;
  extractionTrace?: Record<string, unknown>;
  /** Z `extraction_trace.advisorDocumentSummary.text` po dokončení pipeline. */
  llmExecutiveBrief?: string;
};

export function buildAdvisorReviewViewModel(args: BuildArgs): AdvisorReviewViewModel {
  const {
    envelope,
    aiClassifierJson,
    detectedDocumentTypeLabel,
    reasonsForReview,
    validationWarnings,
    extractionTrace,
    llmExecutiveBrief,
  } = args;
  const primary = envelope.documentClassification.primaryType as PrimaryDocumentType;

  let recognition = detectedDocumentTypeLabel?.trim() || "";
  if (!recognition && aiClassifierJson && (aiClassifierJson.documentType || aiClassifierJson.productFamily)) {
    recognition = formatAiClassifierForAdvisor(aiClassifierJson);
  }
  if (!recognition) {
    const phrase = getDocumentTypeLabel(primary);
    recognition = phrase.charAt(0).toUpperCase() + phrase.slice(1);
  }

  const manualChecklist: string[] = [];
  for (const w of envelope.reviewWarnings ?? []) {
    if (w.severity === "critical" || w.severity === "warning") {
      manualChecklist.push(w.message);
    }
  }
  for (const r of reasonsForReview ?? []) {
    manualChecklist.push(humanizeReason(r));
  }
  for (const v of validationWarnings ?? []) {
    if (v.message) manualChecklist.push(v.message);
  }

  const uniqueManual = [...new Set(manualChecklist.map((s) => s.trim()).filter(Boolean))].slice(0, 24);

  const brief = sanitizeAdvisorBrief(llmExecutiveBrief, envelope) ?? buildDeterministicBrief(envelope, recognition);
  const paymentSyncPreview = buildPaymentSyncPreview(envelope);

  return {
    recognition,
    client: clientLine(envelope),
    product: productLine(envelope),
    payments: formatMoneyLine(envelope),
    healthSensitive: sensitivityLine(envelope),
    ...(brief ? { llmExecutiveBrief: brief } : {}),
    manualChecklist: uniqueManual,
    workActions: mergeWorkActions(envelope),
    debugSnapshot: buildDebugSnapshot(envelope, {
      reasonsForReview,
      validationWarnings,
      extractionTrace,
    }),
    paymentSyncPreview: paymentSyncPreview.status !== "no_payment_data" ? paymentSyncPreview : undefined,
  };
}
