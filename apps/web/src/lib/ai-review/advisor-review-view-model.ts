import type { DocumentReviewEnvelope, ExtractedField, PrimaryDocumentType } from "../ai/document-review-types";
import { resolvePaymentSemanticContext, selectCanonicalPaymentAmount } from "../ai/payment-semantics";
import { buildAllDraftActions, pruneRedundantDraftActions } from "../ai/draft-actions";
import type { DraftActionBase } from "../ai/review-queue";
import { getDocumentTypeLabel } from "../ai/document-messages";
import { getReasonMessage } from "../ai/reason-codes";
import { formatAiClassifierForAdvisor, humanizeReviewReasonLine, sanitizeAdvisorVisibleText } from "./czech-labels";
import type { AdvisorReviewViewModel, DraftAction, PaymentSyncPreview } from "./types";
import { isDateFieldKey, normalizeDateForAdvisorDisplay } from "../ai/canonical-date-normalize";
import {
  buildCanonicalPaymentPayload,
  formatDomesticAccountDisplayLine,
  isPaymentSyncReady,
  hasPaymentTarget,
  missingRequiredPaymentFields,
  PAYMENT_FIELD_SPECS,
  sanitizeVariableSymbolForCanonical,
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
  const annual = str(fv(env, "annualPremium"));
  const ef = env.extractedFields as Record<string, ExtractedField | undefined>;
  const amt =
    selectCanonicalPaymentAmount(ef, resolvePaymentSemanticContext(env)) ||
    str(fv(env, "totalMonthlyPremium")) ||
    str(fv(env, "premiumAmount")) ||
    str(fv(env, "monthlyPremium")) ||
    str(fv(env, "regularAmount")) ||
    str(fv(env, "installmentAmount")) ||
    annual;
  let freq = str(fv(env, "paymentFrequency")) || str(fv(env, "premiumFrequency"));
  if (annual && !freq) {
    freq = "ročně";
  }
  if (amt) {
    parts.push(freq ? `${amt} (${freq})` : amt);
  }
  const vsRaw = str(fv(env, "variableSymbol"));
  const vs = vsRaw ? sanitizeVariableSymbolForCanonical(vsRaw) : "";
  if (vs) parts.push(`VS ${vs}`);
  const iban = str(fv(env, "iban"));
  const acc = str(fv(env, "bankAccount")) || str(fv(env, "accountNumber"));
  const recipientAcc = str(fv(env, "recipientAccount"));
  const bankCode = str(fv(env, "bankCode"));
  if (iban) parts.push(`IBAN: ${iban}`);
  else if (acc) {
    parts.push(`Účet: ${formatDomesticAccountDisplayLine(acc, bankCode)}`);
  }
  if (recipientAcc && recipientAcc !== acc) {
    parts.push(`Příjemce (instituce): ${formatDomesticAccountDisplayLine(recipientAcc, "")}`);
  }
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
  const cn =
    str(fv(env, "contractNumber")) ||
    str(fv(env, "existingPolicyNumber")) ||
    str(fv(env, "proposalNumber_or_contractNumber")) ||
    str(fv(env, "proposalNumber"));
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

/**
 * Max délka stručného shrnutí pro poradce — CRM-usable, ne esej.
 * Cíl: 3–5 vět, max ~500 znaků.
 */
const MAX_ADVISOR_BRIEF_LENGTH = 500;
const RAW_CODE_PATTERN = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+){2,}\b/g;
/** e.g. `combined_dip_dps_type_override:dps_keywords` from classification reasons */
const INTERNAL_REASON_CODE_WITH_SUFFIX = /\b[a-z][a-z0-9]*(?:_[a-z0-9]+)+:[a-z0-9_]+\b/gi;

/**
 * Sanitize LLM-generated advisor summary:
 * - strip raw snake_case pipeline codes,
 * - enforce max length (short, CRM-usable),
 * - strip English-sounding sentences (heuristic),
 * - prefer Czech content.
 */
/** LLM shrnutí + dedikovaná sanitizace (nad rámec sanitizeAdvisorVisibleText). */
function scrubInternalPipelineLabelsFromAdvisorText(text: string): string {
  return sanitizeAdvisorVisibleText(text);
}

export function sanitizeAdvisorBrief(
  raw: string | undefined,
  _envelope: DocumentReviewEnvelope
): string | undefined {
  if (!raw) return undefined;
  let text = raw.trim();
  if (!text) return undefined;

  text = scrubInternalPipelineLabelsFromAdvisorText(text);

  text = text.replace(INTERNAL_REASON_CODE_WITH_SUFFIX, "");
  text = text.replace(/\b(?:dps|dip)_keywords\b/gi, "");

  text = text.replace(RAW_CODE_PATTERN, (match) => {
    const human = getReasonMessage(match);
    return human && human !== match ? human : "";
  });

  const sentences = text.split(/(?<=[.!?])\s+/).filter(Boolean);
  const czechSentences = sentences.filter((s) => {
    const hasCzechChars = /[áčďéěíňóřšťúůýžÁČĎÉĚÍŇÓŘŠŤÚŮÝŽ]/.test(s);
    const looksEnglish = /\b(the|this|document|was|has|been|with|from|for|that|which|contains|including)\b/i.test(s);
    return hasCzechChars || !looksEnglish;
  });

  text = (czechSentences.length > 0 ? czechSentences : sentences)
    .slice(0, 5)
    .join(" ")
    .replace(/\s{2,}/g, " ")
    .trim();

  if (text.length > MAX_ADVISOR_BRIEF_LENGTH) {
    text = text.slice(0, MAX_ADVISOR_BRIEF_LENGTH).replace(/\s+\S*$/, "") + "…";
  }

  const finalized = text ? sanitizeAdvisorVisibleText(text) : undefined;
  return finalized || undefined;
}

/**
 * Deterministický krátký brief — fakta z extrakce, max 3–5 řádků, česky, CRM-ready.
 */
function buildDeterministicBrief(env: DocumentReviewEnvelope, recognition: string): string | undefined {
  const parts: string[] = [];
  if (recognition) parts.push(recognition);
  const product = str(fv(env, "productName"));
  const insurer = str(fv(env, "insurer")) || str(fv(env, "institutionName"));
  if (product && insurer) {
    parts.push(`${product}, ${insurer}`);
  } else if (product || insurer) {
    parts.push(product || insurer);
  }
  const cn = str(fv(env, "contractNumber"));
  if (cn) parts.push(`Č. smlouvy: ${cn}`);
  const lifecycle = env.documentClassification.lifecycleStatus;
  if (lifecycle === "proposal" || lifecycle === "modelation" || lifecycle === "illustration") {
    parts.push("Návrh/modelace — ne finální smlouva.");
  }
  if (env.contentFlags?.containsPaymentInstructions) {
    parts.push("Obsahuje platební pokyny.");
  }
  return parts.length > 0 ? parts.join(". ").replace(/\.\./g, ".") : undefined;
}

const PAYMENT_GATE_MESSAGES: Record<string, string> = {
  PAYMENT_MISSING_AMOUNT: "Chybí částka — platbu nelze zpracovat bez výše.",
  PAYMENT_MISSING_TARGET:
    "Chybí cíl platby — vyplňte IBAN nebo číslo účtu včetně kódu banky (nebo obojí dle dokumentu).",
  PAYMENT_MISSING_FREQUENCY: "Frekvence platby není uvedena — ověřte v dokumentu.",
  PAYMENT_MISSING_IDENTIFIER: "Chybí variabilní nebo konstantní symbol.",
  PAYMENT_MISSING_INSTITUTION: "Není uveden poskytovatel ani produkt.",
  PAYMENT_NEEDS_HUMAN_REVIEW: "Platební údaje vyžadují ruční kontrolu.",
  PAYMENT_LOW_CONFIDENCE: "Nízká jistota platebních údajů — ověřte oproti originálu.",
};

function humanizePaymentGateCode(code: string): string {
  return PAYMENT_GATE_MESSAGES[code] ?? humanizeReviewReasonLine(code);
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
    if (!val) continue;
    const display =
      isDateFieldKey(spec.canonical) ? normalizeDateForAdvisorDisplay(val) || val : val;
    presentFields.push({ label: spec.label, value: display });
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

  const targetPart = cp.iban
    ? `IBAN: ${cp.iban}`
    : formatDomesticAccountDisplayLine(cp.accountNumber, cp.bankCode);
  const amtPart = cp.currency ? `${cp.amount} ${cp.currency}` : cp.amount;
  return {
    status: "will_sync",
    summary: `${amtPart} → ${targetPart}${cp.variableSymbol ? ` VS ${cp.variableSymbol}` : ""}`,
    presentFields,
    missingFields: [],
    warnings,
  };
}

/**
 * Akce, které se provedou automaticky při zápisu do CRM (create contract, payment, client).
 * Po apply se stav přepne na "executed".
 */
const AUTO_EXECUTE_ON_APPLY = new Set([
  "create_or_update_contract_record",
  "create_or_update_contract_production",
  "create_contract",
  "create_payment_setup",
  "create_payment_setup_for_portal",
  "create_payment",
  "create_new_client",
  "create_client",
  "link_existing_client",
  "create_notification",
  "create_followup_email_draft",
  "draft_email",
  "mark_as_supporting_document",
]);

/**
 * Akce, které se spouští inline v UI (task, opportunity, pipeline deal).
 */
const INLINE_EXECUTABLE = new Set([
  "create_task",
  "create_service_task",
  "create_service_review_task",
  "create_task_followup",
  "create_manual_review_task",
  "schedule_consultation",
  "create_opportunity",
  "create_or_update_pipeline_deal",
  "create_or_update_business_plan_item",
]);

/**
 * Akce, které systém nemůže provést automaticky — jsou jen doporučení.
 */
const RECOMMENDATION_ONLY = new Set([
  "propose_financial_analysis_update",
  "propose_financial_analysis_refresh",
  "prepare_comparison",
  "request_manual_review",
  "request_contract_mapping",
  "update_income_profile",
  "create_income_verification_record",
]);

/**
 * Akce, kde musí poradce přejít jinam a provést akci ručně.
 */
const CANNOT_AUTO = new Set([
  "resolve_client_match",
  "attach_to_existing_client",
  "attach_to_existing_contract",
  "attach_to_client_documents",
  "attach_to_client_or_company",
  "attach_to_existing_financing_deal",
  "attach_to_business_client",
  "attach_to_loan_or_financing_deal",
  "link_client",
  "link_household",
  "create_or_link_company_entity",
  "create_service_task",
]);

function resolveInitialActionStatus(type: string): DraftAction["status"] {
  if (AUTO_EXECUTE_ON_APPLY.has(type)) return "available";
  if (INLINE_EXECUTABLE.has(type)) return "available";
  if (RECOMMENDATION_ONLY.has(type)) return "recommended";
  if (CANNOT_AUTO.has(type)) return "cannot_auto";
  return "recommended";
}

function resolveStatusNote(type: string): string | undefined {
  if (AUTO_EXECUTE_ON_APPLY.has(type)) return "Provede se automaticky při propsání do Aidvisory";
  if (INLINE_EXECUTABLE.has(type)) return undefined;
  if (RECOMMENDATION_ONLY.has(type)) return "Doporučení — rozhodněte podle situace";
  if (CANNOT_AUTO.has(type)) return "Vyžaduje ruční akci";
  return undefined;
}

function mergeWorkActions(envelope: DocumentReviewEnvelope): DraftAction[] {
  const deterministic = buildAllDraftActions(envelope) as DraftAction[];
  const fromLlm: DraftAction[] = (envelope.suggestedActions ?? []).map((a, i) => ({
    type: a.type?.trim() || `workflow_suggestion_${i}`,
    label: a.label?.trim() || "Návrh kroku",
    payload: (a.payload ?? {}) as Record<string, unknown>,
    status: "recommended" as const,
    statusNote: "Návrh z AI — rozhodněte podle situace",
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
    out.push({
      ...(a as DraftAction),
      status: (a as DraftAction).status ?? resolveInitialActionStatus(a.type),
      statusNote: (a as DraftAction).statusNote ?? resolveStatusNote(a.type),
    });
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
      manualChecklist.push(humanizeReviewReasonLine(w.message));
    }
  }
  // reasonsForReview se neopakují zde — stejné položky jsou v bloku „Stav a kontrola“ / „Co zkontrolovat“
  // (mapování v mappers.humanizeReasonForAdvisor + humanizeReviewReasonLine), aby UI nebylo duplicitní.
  for (const v of validationWarnings ?? []) {
    if (v.message) manualChecklist.push(humanizeReviewReasonLine(v.message));
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
