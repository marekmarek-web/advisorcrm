import type { DocumentReviewEnvelope, PrimaryDocumentType } from "../ai/document-review-types";
import { buildAllDraftActions, pruneRedundantDraftActions } from "../ai/draft-actions";
import type { DraftActionBase } from "../ai/review-queue";
import { getDocumentTypeLabel } from "../ai/document-messages";
import { getReasonMessage } from "../ai/reason-codes";
import { formatAiClassifierForAdvisor } from "./czech-labels";
import type { AdvisorReviewViewModel, DraftAction } from "./types";

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

  const brief = llmExecutiveBrief?.trim();
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
  };
}
