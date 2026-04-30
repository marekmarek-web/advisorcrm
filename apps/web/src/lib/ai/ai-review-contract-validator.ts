import type { InsuredRiskRecord } from "./document-packet-types";
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
type PersonPremiumRow = { label: string; amount: number; frequency: "monthly" };

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

function roughlyEqual(a: number, b: number): boolean {
  return Math.abs(a - b) < 1;
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

function premiumValueFromEnvelope(env: DocumentReviewEnvelope, key: "totalMonthlyPremium" | "totalAnnualPremium"): number | null {
  const rawPremium = (env as unknown as { premium?: Record<string, unknown> | null }).premium;
  return parseMoneyInput(rawPremium?.[key]);
}

function resolvePremiumAggregation(params: {
  explicitMonthly: number | null;
  currentMonthly: number | null;
  currentPremiumAmount: number | null;
  explicitAnnual: number | null;
  personPremiums: PersonPremiumRow[];
}): {
  totalMonthly: number | null;
  totalAnnual: number | null;
  source: string;
  warnings: string[];
} {
  const { explicitMonthly, currentMonthly, currentPremiumAmount, explicitAnnual, personPremiums } = params;
  const sum = personPremiums.reduce((acc, p) => acc + p.amount, 0);
  const hasMultiPersonPremiums = personPremiums.length >= 2 && sum > 0;
  const warnings: string[] = [];

  if (hasMultiPersonPremiums) {
    const conflictingMonthly = [explicitMonthly, currentMonthly, currentPremiumAmount]
      .filter((n): n is number => n != null && !roughlyEqual(n, sum));
    for (const monthly of conflictingMonthly) {
      const looksLikeSingleInsured = personPremiums.some((p) => roughlyEqual(p.amount, monthly));
      warnings.push(
        looksLikeSingleInsured
          ? `Celkové pojistné bylo v extrakci shodné s pojistným jedné pojištěné osoby (${monthly}); použil se součet všech pojištěných (${sum}).`
          : `Celkové pojistné v extrakci (${monthly}) se liší od součtu pojištěných (${sum}).`,
      );
    }
    const annualFromSum = Math.round(sum * 12 * 100) / 100;
    if (explicitAnnual != null && !roughlyEqual(explicitAnnual, annualFromSum)) {
      warnings.push(`Roční pojistné v extrakci (${explicitAnnual}) neodpovídá součtu pojištěných za rok (${annualFromSum}).`);
    }
    return {
      totalMonthly: sum,
      totalAnnual: annualFromSum,
      source: "sum_of_insured_persons",
      warnings,
    };
  }

  const totalMonthly = explicitMonthly ?? (sum > 0 ? sum : currentMonthly ?? currentPremiumAmount);
  const totalAnnual = explicitAnnual ?? (totalMonthly != null ? Math.round(totalMonthly * 12 * 100) / 100 : null);
  return {
    totalMonthly,
    totalAnnual,
    source: explicitMonthly != null ? "explicit_total" : sum > 0 ? "sum_of_insured_persons" : "manual_override",
    warnings,
  };
}

function riskTypeFromLabel(label: string): string {
  const l = label.toLowerCase();
  if (l.includes("smrt")) return "death";
  if (l.includes("invalid")) return "disability";
  if (l.includes("trvalé následky") || l.includes("trvale nasledky")) return "accident_permanent_consequences";
  if (l.includes("pracovní neschopnost") || l.includes("pracovni neschopnost")) return "incapacity";
  if (l.includes("soběstačnost") || l.includes("sobestacnost")) return "dependency";
  if (l.includes("úraz") || l.includes("uraz")) return "accident";
  return "other";
}

function extractLifeRiskRowsFromPersonWindow(
  window: string,
  person: Record<string, unknown>,
): InsuredRiskRecord[] {
  const lines = window
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean);
  const out: InsuredRiskRecord[] = [];
  let buffer = "";
  const rowPattern = /^(.+?)\s+([A-Z0-9]{3,})\s+(\d{1,2}\.\s*\d{1,2}\.\s*\d{4})\s+(.+?)\s+((?:[\d\s.,]+)\s*Kč|V ceně pojištění)$/i;
  const skipPattern =
    /^(Přehled|Kód\s+tarifu|Konec\s+pojištění|Pojistná\s+částka|Měsíční\s+pojistné|Celkové\s+běžné|Strana|Osobní\s+dotazník|Zdravotní\s+dotazník)/i;

  const flush = () => {
    const candidate = buffer.replace(/\s+/g, " ").trim();
    buffer = "";
    if (!candidate || skipPattern.test(candidate)) return;
    const match = rowPattern.exec(candidate);
    if (!match) return;
    const label = match[1].trim();
    if (!label || /^Virtuální klinika/i.test(label)) return;
    out.push({
      linkedParticipantName: typeof person.fullName === "string" ? person.fullName : null,
      linkedParticipantRole: typeof person.role === "string" ? person.role as InsuredRiskRecord["linkedParticipantRole"] : null,
      riskType: riskTypeFromLabel(label),
      riskLabel: label,
      termEnd: normalizeCzechDate(match[3]) ?? match[3].trim(),
      insuredAmount: match[4].trim(),
      premium: match[5].trim(),
    });
  };

  for (const line of lines) {
    if (skipPattern.test(line)) {
      flush();
      continue;
    }
    buffer = buffer ? `${buffer} ${line}` : line;
    if (rowPattern.test(buffer.replace(/\s+/g, " ").trim())) flush();
  }
  flush();
  return out;
}

function extractInsuredRisksFromDocumentText(
  documentText: string,
  insuredPersons: Array<Record<string, unknown>>,
): InsuredRiskRecord[] {
  const text = normalizeDocumentText(documentText);
  if (!text.trim() || insuredPersons.length === 0) return [];
  const out: InsuredRiskRecord[] = [];
  const sortedPersons = [...insuredPersons].sort((a, b) => Number(a.order ?? 0) - Number(b.order ?? 0));

  for (const person of sortedPersons) {
    const order = Number(person.order);
    if (!Number.isFinite(order) || order <= 0) continue;
    const headingIndex = text.indexOf(`${order}. pojištěný`);
    if (headingIndex < 0) continue;
    const nextHeading = text.indexOf(`${order + 1}. pojištěný`, headingIndex + 1);
    const premiumNeedle = `Celkové běžné měsíční pojistné pro ${order}. pojištěného`;
    const premiumIndex = text.indexOf(premiumNeedle, headingIndex);
    const hardEndCandidates = [
      nextHeading,
      premiumIndex >= 0 ? premiumIndex + 220 : -1,
      text.indexOf("Osobní dotazník", headingIndex + 1),
      text.indexOf("Zdravotní dotazník", headingIndex + 1),
    ].filter((i) => i > headingIndex);
    const end = hardEndCandidates.length > 0 ? Math.min(...hardEndCandidates) : headingIndex + 5000;
    out.push(...extractLifeRiskRowsFromPersonWindow(text.slice(headingIndex, end), person));
  }

  return out;
}

function existingInsuredRisks(env: DocumentReviewEnvelope): InsuredRiskRecord[] {
  const root = (env as unknown as { insuredRisks?: unknown }).insuredRisks;
  if (Array.isArray(root)) return root.filter((r): r is InsuredRiskRecord => !!r && typeof r === "object" && !Array.isArray(r));
  const rawField = fieldValue(env, "insuredRisks");
  if (Array.isArray(rawField)) return rawField.filter((r): r is InsuredRiskRecord => !!r && typeof r === "object" && !Array.isArray(r));
  if (typeof rawField === "string" && rawField.trim()) {
    try {
      const parsed = JSON.parse(rawField) as unknown;
      if (Array.isArray(parsed)) return parsed.filter((r): r is InsuredRiskRecord => !!r && typeof r === "object" && !Array.isArray(r));
    } catch {
      return [];
    }
  }
  return [];
}

function riskKey(r: InsuredRiskRecord): string {
  return [
    String(r.linkedParticipantName ?? "").toLowerCase(),
    String(r.riskLabel ?? "").toLowerCase(),
    String(r.insuredAmount ?? "").toLowerCase(),
    String(r.termEnd ?? "").toLowerCase(),
  ].join("|").replace(/\s+/g, " ");
}

function mergeInsuredRisks(existing: InsuredRiskRecord[], fallback: InsuredRiskRecord[]): InsuredRiskRecord[] {
  const out: InsuredRiskRecord[] = [];
  const seen = new Set<string>();
  for (const risk of [...existing, ...fallback]) {
    if (!risk?.riskLabel) continue;
    const key = riskKey(risk);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(risk);
  }
  return out;
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
    .filter((p): p is PersonPremiumRow => p.amount != null);

  const explicitTotal = parseMoneyInput(fieldValue(env, "totalContractMonthlyPremium"));
  const currentTotal = parseMoneyInput(fieldValue(env, "totalMonthlyPremium"));
  const currentPremiumAmount = parseMoneyInput(fieldValue(env, "premiumAmount"));
  const explicitAnnual =
    parseMoneyInput(fieldValue(env, "totalContractAnnualPremium")) ??
    premiumValueFromEnvelope(env, "totalAnnualPremium") ??
    parseMoneyInput(fieldValue(env, "totalAnnualPremium")) ??
    parseMoneyInput(fieldValue(env, "annualPremium"));
  const aggregation = resolvePremiumAggregation({
    explicitMonthly: explicitTotal,
    currentMonthly: currentTotal,
    currentPremiumAmount,
    explicitAnnual,
    personPremiums,
  });
  const validationWarnings: string[] = [...aggregation.warnings];

  if (declaredInsuredCount != null && insuredPersons.length > 0 && declaredInsuredCount !== insuredPersons.length) {
    validationWarnings.push(`Dokument deklaruje ${declaredInsuredCount} pojištěných, extrakce vrátila ${insuredPersons.length}.`);
  }

  if (aggregation.totalMonthly != null && aggregation.totalMonthly > 0) {
    const premium = {
      frequency: "monthly",
      totalMonthlyPremium: aggregation.totalMonthly,
      totalAnnualPremium: aggregation.totalAnnual,
      source: aggregation.source,
      calculationBreakdown: personPremiums,
      validationWarnings,
    };
    (env as unknown as { premium: unknown }).premium = premium;
    setField(env, "totalMonthlyPremium", String(aggregation.totalMonthly));
    setField(env, "premiumAmount", String(aggregation.totalMonthly));
    setField(env, "annualPremium", String(premium.totalAnnualPremium));
  }

  const risksFromText = extractInsuredRisksFromDocumentText(documentText, insuredPersons);
  if (risksFromText.length > 0) {
    const mergedRisks = mergeInsuredRisks(existingInsuredRisks(env), risksFromText);
    (env as unknown as { insuredRisks: InsuredRiskRecord[] }).insuredRisks = mergedRisks;
    setField(env, "insuredRisks", mergedRisks, 0.95);
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
