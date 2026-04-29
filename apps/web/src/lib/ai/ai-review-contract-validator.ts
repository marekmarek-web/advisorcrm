import type { DocumentReviewEnvelope } from "./document-review-types";
import { parseMoneyInput } from "./contract-draft-premiums";
import {
  applyValidatorHints,
  validateCriticalFields as validateLearningCriticalFields,
  validateParticipantCount as validateLearningParticipantCount,
} from "./ai-review-learning-validators";

export type UserDeclaredDocumentIntent = {
  isModelation: boolean;
  declaredByAdvisor: true;
  declaredAtUpload: string;
};

type FieldCell = { value?: unknown; status?: string; confidence?: number; evidenceSnippet?: string; sourcePage?: number };

export function normalizeUserDeclaredDocumentIntent(raw: unknown): UserDeclaredDocumentIntent {
  if (raw && typeof raw === "object" && !Array.isArray(raw)) {
    const obj = raw as Record<string, unknown>;
    return {
      isModelation: obj.isModelation === true,
      declaredByAdvisor: true,
      declaredAtUpload:
        typeof obj.declaredAtUpload === "string" && obj.declaredAtUpload.trim()
          ? obj.declaredAtUpload
          : new Date(0).toISOString(),
    };
  }
  return {
    isModelation: false,
    declaredByAdvisor: true,
    declaredAtUpload: new Date(0).toISOString(),
  };
}

export function isAdvisorDeclaredModelation(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  return normalizeUserDeclaredDocumentIntent((payload as Record<string, unknown>).userDeclaredDocumentIntent)
    .isModelation;
}

export function shouldPublishToCrm(params: {
  extractedPayload: unknown;
  reviewApprovedByAdvisor: boolean;
}): boolean {
  return params.reviewApprovedByAdvisor && !isAdvisorDeclaredModelation(params.extractedPayload);
}

function field(env: DocumentReviewEnvelope, key: string): FieldCell | undefined {
  return env.extractedFields?.[key] as FieldCell | undefined;
}

function fieldValue(env: DocumentReviewEnvelope, key: string): unknown {
  return field(env, key)?.value;
}

function setField(env: DocumentReviewEnvelope, key: string, value: unknown, confidence = 0.9): void {
  env.extractedFields[key] = {
    ...(env.extractedFields[key] ?? {}),
    value,
    status: "extracted",
    confidence,
    evidenceTier: "normalized_alias_match",
    sourceKind: "pipeline_normalized",
  } as DocumentReviewEnvelope["extractedFields"][string];
}

function parseCount(raw: unknown): number | null {
  const text = String(raw ?? "").toLowerCase();
  const adult = /(\d+)\s*dosp/.exec(text)?.[1];
  const child = /(\d+)\s*d[ií]t/.exec(text)?.[1];
  if (adult || child) return Number(adult ?? 0) + Number(child ?? 0);
  const n = parseInt(text.replace(/[^\d]/g, ""), 10);
  return Number.isFinite(n) && n > 0 ? n : null;
}

function personName(raw: Record<string, unknown>): string | null {
  const v = raw.fullName ?? raw.name ?? raw.clientFullName;
  return typeof v === "string" && v.trim() ? v.trim() : null;
}

function amountFromPerson(raw: Record<string, unknown>): number | null {
  return parseMoneyInput(
    raw.monthlyPremium ??
      raw.totalMonthlyPremium ??
      raw.premiumAmount ??
      raw.premium ??
      raw.regularAmount,
  );
}

function extractStructuredPersons(env: DocumentReviewEnvelope): Array<Record<string, unknown>> {
  const out: Array<Record<string, unknown>> = [];
  const rawRoot = (env as unknown as { insuredPersons?: unknown }).insuredPersons;
  if (Array.isArray(rawRoot)) out.push(...rawRoot.filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p)));

  const rawField = fieldValue(env, "insuredPersons");
  if (Array.isArray(rawField)) {
    out.push(...rawField.filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p)));
  } else if (typeof rawField === "string" && rawField.trim()) {
    try {
      const parsed = JSON.parse(rawField) as unknown;
      if (Array.isArray(parsed)) out.push(...parsed.filter((p): p is Record<string, unknown> => !!p && typeof p === "object" && !Array.isArray(p)));
    } catch {
      // Non-JSON legacy display value.
    }
  }
  return out;
}

function fallbackPersonsFromFlatFields(env: DocumentReviewEnvelope): Array<Record<string, unknown>> {
  const firstName = fieldValue(env, "insuredPersonName") ?? fieldValue(env, "fullName") ?? fieldValue(env, "clientFullName");
  const secondName = fieldValue(env, "secondInsuredName") ?? fieldValue(env, "insuredPerson2");
  const firstPremium = fieldValue(env, "insuredPerson1MonthlyPremium") ?? fieldValue(env, "firstInsuredMonthlyPremium");
  const secondPremium = fieldValue(env, "insuredPerson2MonthlyPremium") ?? fieldValue(env, "secondInsuredMonthlyPremium");
  const people = [
    firstName
      ? {
          order: 1,
          role: "primary_insured",
          fullName: String(firstName),
          birthDate: fieldValue(env, "birthDate") ?? fieldValue(env, "insuredBirthDate"),
          birthNumber: fieldValue(env, "personalId"),
          monthlyPremium: firstPremium,
        }
      : null,
    secondName
      ? {
          order: 2,
          role: "child_insured",
          fullName: String(secondName),
          birthDate: fieldValue(env, "secondInsuredBirthDate"),
          birthNumber: fieldValue(env, "secondInsuredPersonalId"),
          monthlyPremium: secondPremium,
        }
      : null,
  ];
  return people.filter((p): p is NonNullable<typeof p> => Boolean(p));
}

function normalizeDocumentText(text: string): string {
  return text.replace(/\u00a0/g, " ").replace(/\r/g, "\n");
}

function normalizeCzechDate(raw: string | null): string | undefined {
  if (!raw) return undefined;
  const m = /(\d{1,2})\.\s*(\d{1,2})\.\s*(\d{4})/.exec(raw);
  if (!m) return raw.trim();
  return `${m[1].padStart(2, "0")}.${m[2].padStart(2, "0")}.${m[3]}`;
}

function extractInsuredPersonsFromDocumentText(documentText: string): Array<Record<string, unknown>> {
  const text = normalizeDocumentText(documentText);
  if (!text.trim()) return [];

  const orderToPremium = new Map<number, number>();
  const premiumPattern = /Celkové\s+běžné\s+měsíční\s+pojistné\s+pro\s+(\d+)\.\s*pojištěného\s+([\d\s.,]+)\s*Kč/gi;
  for (const match of text.matchAll(premiumPattern)) {
    const order = Number(match[1]);
    const amount = parseMoneyInput(match[2]);
    if (Number.isFinite(order) && amount != null) orderToPremium.set(order, amount);
  }

  const persons: Array<Record<string, unknown>> = [];
  for (const [order, monthlyPremium] of [...orderToPremium.entries()].sort(([a], [b]) => a - b)) {
    const premiumNeedle = `Celkové běžné měsíční pojistné pro ${order}. pojištěného`;
    const premiumIndex = text.indexOf(premiumNeedle);
    const headingIndex = premiumIndex >= 0 ? text.lastIndexOf(`${order}. pojištěný`, premiumIndex) : -1;
    const window = headingIndex >= 0
      ? text.slice(headingIndex, premiumIndex + 2200)
      : text.slice(Math.max(0, premiumIndex - 2200), premiumIndex + 2200);

    const name =
      /Titul,\s*jméno\s+a\s+příjmení:\s*([^\n]+)/i.exec(window)?.[1]?.trim() ??
      /Jméno\s+a\s+příjmení:\s*([^\n]+)/i.exec(window)?.[1]?.trim();
    const birthNumber = /Rodné\s+číslo:\s*([0-9/]+)/i.exec(window)?.[1]?.trim();
    const birthDate = normalizeCzechDate(/Datum\s+narození:\s*([0-9.\s]+)/i.exec(window)?.[1]?.trim() ?? null);
    const address = /Trvalé\s+bydliště:\s*([^\n]+)/i.exec(window)?.[1]?.trim();
    const occupation = /Zaměstnání:\s*([^\n]+)/i.exec(window)?.[1]?.trim();

    persons.push({
      order,
      role: order === 1 ? "primary_insured" : "insured",
      fullName: name,
      birthNumber,
      birthDate,
      address,
      occupation,
      monthlyPremium,
    });
  }
  return persons.filter((p) => p.fullName || p.monthlyPremium != null);
}

function normalizePerson(raw: Record<string, unknown>, index: number): Record<string, unknown> {
  const coverages = Array.isArray(raw.coverages)
    ? raw.coverages
    : Array.isArray(raw.insuredRisks)
      ? raw.insuredRisks
      : [];
  const coverageSum = coverages.reduce((sum, c) => {
    if (!c || typeof c !== "object") return sum;
    const n = parseMoneyInput((c as Record<string, unknown>).monthlyPremium ?? (c as Record<string, unknown>).premium);
    return n != null ? sum + n : sum;
  }, 0);
  const explicit = amountFromPerson(raw);
  return {
    order: Number(raw.order ?? index + 1),
    role: raw.role ?? (index === 0 ? "primary_insured" : "insured"),
    fullName: personName(raw) ?? undefined,
    birthNumber: raw.birthNumber ?? raw.personalId ?? raw.maskedPersonalId,
    birthDate: raw.birthDate ?? raw.dateOfBirth,
    address: raw.address,
    occupation: raw.occupation,
    monthlyPremium: explicit ?? (coverageSum > 0 ? coverageSum : undefined),
    coverages,
  };
}

export function validatePremiumAggregation(env: DocumentReviewEnvelope, documentText = ""): void {
  env.extractedFields = env.extractedFields ?? {};
  const textCount = /Počet\s+pojištěných:\s*([^\n]+)/i.exec(normalizeDocumentText(documentText))?.[1];
  const declaredInsuredCount =
    parseCount(fieldValue(env, "insuredCount") ?? fieldValue(env, "insuredPersonsCount") ?? fieldValue(env, "numberOfInsuredPersons") ?? textCount);
  if (textCount && !fieldValue(env, "insuredCount")) {
    setField(env, "insuredCount", textCount, 0.95);
  }
  const sourcePersons = extractStructuredPersons(env);
  const fallbackPersons = sourcePersons.length > 0 ? [] : fallbackPersonsFromFlatFields(env);
  const textPersons = extractInsuredPersonsFromDocumentText(documentText);
  const personSource = textPersons.length >= sourcePersons.length && textPersons.length > 0
    ? textPersons
    : [...sourcePersons, ...fallbackPersons];
  const insuredPersons = personSource.map(normalizePerson).filter((p) => p.fullName || p.monthlyPremium != null);

  if (insuredPersons.length > 0) {
    (env as unknown as { insuredPersons: unknown }).insuredPersons = insuredPersons;
    setField(env, "insuredPersons", insuredPersons);
  }

  const personPremiums = insuredPersons
    .map((p, i) => ({
      label: `${p.order ?? i + 1}. pojištěný ${typeof p.fullName === "string" ? p.fullName : ""}`.trim(),
      amount: parseMoneyInput(p.monthlyPremium),
      frequency: "monthly",
    }))
    .filter((p): p is { label: string; amount: number; frequency: "monthly" } => p.amount != null);

  const explicitTotal = parseMoneyInput(fieldValue(env, "totalContractMonthlyPremium"));
  const currentTotal = parseMoneyInput(fieldValue(env, "totalMonthlyPremium"));
  const sum = personPremiums.reduce((acc, p) => acc + p.amount, 0);
  const total = explicitTotal ?? (sum > 0 ? sum : currentTotal);
  const source = explicitTotal != null ? "explicit_total" : sum > 0 ? "sum_of_insured_persons" : "manual_override";
  const validationWarnings: string[] = [];

  if (declaredInsuredCount != null && insuredPersons.length > 0 && declaredInsuredCount !== insuredPersons.length) {
    validationWarnings.push(`Dokument deklaruje ${declaredInsuredCount} pojištěných, extrakce vrátila ${insuredPersons.length}.`);
  }
  if (explicitTotal != null && sum > 0 && Math.abs(explicitTotal - sum) >= 1) {
    validationWarnings.push(`Celkové pojistné v dokumentu (${explicitTotal}) se liší od součtu pojištěných (${sum}).`);
  }

  if (total != null && total > 0) {
    const premium = {
      frequency: "monthly",
      totalMonthlyPremium: total,
      totalAnnualPremium: Math.round(total * 12 * 100) / 100,
      source,
      calculationBreakdown: personPremiums,
      validationWarnings,
    };
    (env as unknown as { premium: unknown }).premium = premium;
    setField(env, "totalMonthlyPremium", String(total));
    setField(env, "premiumAmount", String(total));
    setField(env, "annualPremium", String(premium.totalAnnualPremium));
  }

  if (validationWarnings.length > 0) {
    env.reviewWarnings = env.reviewWarnings ?? [];
    for (const message of validationWarnings) {
      if (!env.reviewWarnings.some((w) => w.message === message)) {
        env.reviewWarnings.push({ code: "premium_aggregation_validation", message, severity: "warning" });
      }
    }
  }
}

export function validatePublishEligibility(env: DocumentReviewEnvelope, intent: UserDeclaredDocumentIntent): void {
  (env as unknown as { userDeclaredDocumentIntent: UserDeclaredDocumentIntent }).userDeclaredDocumentIntent = intent;
  const hasProposalSignals =
    env.documentClassification.lifecycleStatus === "proposal" ||
    env.documentClassification.lifecycleStatus === "modelation" ||
    env.documentClassification.lifecycleStatus === "illustration" ||
    env.documentClassification.lifecycleStatus === "offer";

  if (hasProposalSignals && !intent.isModelation) {
    env.reviewWarnings = env.reviewWarnings ?? [];
    if (!env.reviewWarnings.some((w) => w.code === "proposal_signal_review")) {
      env.reviewWarnings.push({
        code: "proposal_signal_review",
        message: "Dokument obsahuje výraz návrh/modelace. Ověřte, zda jde o finální stav.",
        severity: "warning",
      });
    }
  }

  env.publishHints = {
    ...(env.publishHints ?? {
      needsSplit: false,
      needsManualValidation: false,
      reviewOnly: false,
      sensitiveAttachmentOnly: false,
    }),
    contractPublishable: !intent.isModelation,
    reviewOnly: intent.isModelation,
    reasons: [
      ...new Set([
        ...((env.publishHints?.reasons ?? []).filter((r) => r !== "proposal_treated_as_final_contract")),
        intent.isModelation ? "advisor_declared_modelation" : "advisor_declared_final_contract_default",
      ]),
    ],
  };
}

export function validateRequiredFieldsForCrm(env: DocumentReviewEnvelope): void {
  const required = [
    ["institutionName", "Chybí pojišťovna / instituce pro CRM zápis."],
    ["productName", "Chybí produkt pro CRM zápis."],
  ] as const;
  env.reviewWarnings = env.reviewWarnings ?? [];
  for (const [key, message] of required) {
    if (fieldValue(env, key) == null || String(fieldValue(env, key)).trim() === "") {
      if (!env.reviewWarnings.some((w) => w.message === message)) {
        env.reviewWarnings.push({ code: "crm_required_field_missing", message, severity: "warning" });
      }
    }
  }
}

export function validateListSummaryHasData(env: DocumentReviewEnvelope): void {
  env.extractedFields = env.extractedFields ?? {};
  const product = fieldValue(env, "productName");
  const institution = fieldValue(env, "institutionName") ?? fieldValue(env, "insurer");
  const premium = (env as unknown as { premium?: { totalMonthlyPremium?: number } }).premium?.totalMonthlyPremium;
  if (product != null) setField(env, "productName", product);
  if (institution != null) setField(env, "institutionName", institution);
  if (premium != null) setField(env, "totalMonthlyPremium", String(premium));
}

export function runAiReviewDeterministicValidators(
  env: DocumentReviewEnvelope,
  intentRaw: unknown,
  documentText = "",
  validatorHints: Record<string, unknown>[] = [],
): DocumentReviewEnvelope {
  const intent = normalizeUserDeclaredDocumentIntent(intentRaw);
  validatePremiumAggregation(env, documentText);
  validateLearningParticipantCount(env, documentText);
  validateLearningCriticalFields(env);
  applyValidatorHints(env, validatorHints);
  validatePublishEligibility(env, intent);
  validateRequiredFieldsForCrm(env);
  validateListSummaryHasData(env);
  return env;
}
