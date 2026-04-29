const SYSTEM_PROMPT =
  "Extract structured AI Review JSON from Czech financial/insurance document text. Return only schema-valid JSON.";

const EMAIL_RE = /[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi;
const BIRTH_ID_RE = /\b\d{6}\/?\d{3,4}\b/g;
const PHONE_RE = /(?:\+420\s*)?(?:\d[\s.-]?){9,}/g;
const CONTRACT_RE = /\b(?:smlouva|číslo smlouvy|contract)\s*(?:č\.?|number|id)?\s*[:#]?\s*[A-Z0-9][A-Z0-9/-]{5,}\b/gi;
const ADDRESS_RE = /\b(?:ulice|adresa|bydliště)\s*[:#]?\s*[^.\n]+/gi;
const LABELED_NAME_RE = /\b(klient|pojistník|pojištěný|pojištěná|účastník)\s+([A-ZÁ-Ž][a-zá-ž]+(?:ová)?\s+[A-ZÁ-Ž][a-zá-ž]+(?:ová)?)/gi;
const RAW_PII_RE = new RegExp(`${EMAIL_RE.source}|${BIRTH_ID_RE.source}|${PHONE_RE.source}`, "i");

export type FineTuneJsonlRow = {
  messages: Array<{ role: "system" | "user" | "assistant"; content: string }>;
  metadata: {
    tenantScope: string;
    institution: string | null;
    product: string | null;
    documentType: string | null;
    sourceEvalCaseId: string;
    piiScrubbed: true;
  };
};

export type FineTuneExportSummary = {
  train: number;
  validation: number;
  holdout: number;
  institutions: Record<string, number>;
  productTypes: Record<string, number>;
  criticalFieldCoverage: Record<string, number>;
  skippedRecords: Array<{ id: string; reason: string }>;
};

export type FineTuneEvalCaseInput = {
  id: string;
  sourceCorrectionIds: string[];
  anonymizedInputRef: string | null;
  institutionName: string | null;
  productName: string | null;
  documentType: string | null;
  expectedOutputJson: unknown;
  criticalFields: unknown;
  piiScrubbed: boolean;
};

type AnonymizerState = {
  counters: Record<"client" | "birthId" | "address" | "phone" | "email" | "contract", number>;
  maps: Record<"client" | "birthId" | "address" | "phone" | "email" | "contract", Map<string, string>>;
};

function createAnonymizerState(): AnonymizerState {
  return {
    counters: { client: 0, birthId: 0, address: 0, phone: 0, email: 0, contract: 0 },
    maps: {
      client: new Map(),
      birthId: new Map(),
      address: new Map(),
      phone: new Map(),
      email: new Map(),
      contract: new Map(),
    },
  };
}

function replacement(state: AnonymizerState, kind: keyof AnonymizerState["counters"], raw: string, prefix: string): string {
  const existing = state.maps[kind].get(raw);
  if (existing) return existing;
  state.counters[kind] += 1;
  const next = `${prefix}_${state.counters[kind]}`;
  state.maps[kind].set(raw, next);
  return next;
}

export function anonymizeAiReviewFineTuneText(value: string, state = createAnonymizerState()): string {
  return value
    .replace(EMAIL_RE, (match) => replacement(state, "email", match, "EMAIL"))
    .replace(BIRTH_ID_RE, (match) => replacement(state, "birthId", match, "BIRTH_ID"))
    .replace(PHONE_RE, (match) => replacement(state, "phone", match, "PHONE"))
    .replace(ADDRESS_RE, (match) => replacement(state, "address", match, "ADDRESS"))
    .replace(CONTRACT_RE, (match) => replacement(state, "contract", match, "CONTRACT_ID"))
    .replace(LABELED_NAME_RE, (_match, label: string, name: string) => `${label} ${replacement(state, "client", name, "CLIENT")}`);
}

export function anonymizeAiReviewFineTunePayload(value: unknown, state = createAnonymizerState()): unknown {
  if (typeof value === "string") return anonymizeAiReviewFineTuneText(value, state);
  if (Array.isArray(value)) return value.map((entry) => anonymizeAiReviewFineTunePayload(entry, state));
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([key, entry]) => [
        key,
        anonymizeAiReviewFineTunePayload(entry, state),
      ]),
    );
  }
  return value;
}

export function assertFineTuneJsonlRowsSafe(rows: FineTuneJsonlRow[]): void {
  for (const row of rows) {
    for (const message of row.messages) {
      if (RAW_PII_RE.test(message.content)) {
        throw new Error(`Fine-tune export validation failed: raw PII in ${row.metadata.sourceEvalCaseId}`);
      }
      if (message.role === "assistant") {
        JSON.parse(message.content);
      }
    }
  }
}

function countInto(target: Record<string, number>, value: string | null | undefined): void {
  const key = value?.trim() || "unknown";
  target[key] = (target[key] ?? 0) + 1;
}

function splitRows(rows: FineTuneJsonlRow[]): { train: FineTuneJsonlRow[]; validation: FineTuneJsonlRow[]; holdout: FineTuneJsonlRow[] } {
  const holdoutEnabled = rows.length >= 20;
  const train: FineTuneJsonlRow[] = [];
  const validation: FineTuneJsonlRow[] = [];
  const holdout: FineTuneJsonlRow[] = [];
  rows.forEach((row, index) => {
    if (holdoutEnabled && index % 10 === 0) holdout.push(row);
    else if (index % 5 === 0) validation.push(row);
    else train.push(row);
  });
  return { train, validation, holdout };
}

export function buildFineTuneExportSummary(params: {
  rows: FineTuneJsonlRow[];
  skippedRecords: Array<{ id: string; reason: string }>;
  split: { train: FineTuneJsonlRow[]; validation: FineTuneJsonlRow[]; holdout: FineTuneJsonlRow[] };
}): FineTuneExportSummary {
  const institutions: Record<string, number> = {};
  const productTypes: Record<string, number> = {};
  const criticalFieldCoverage: Record<string, number> = {};
  for (const row of params.rows) {
    countInto(institutions, row.metadata.institution);
    countInto(productTypes, row.metadata.documentType);
    const assistant = JSON.parse(row.messages[2]?.content ?? "{}") as { __criticalFields?: string[] };
    for (const field of assistant.__criticalFields ?? []) {
      countInto(criticalFieldCoverage, field);
    }
  }
  return {
    train: params.split.train.length,
    validation: params.split.validation.length,
    holdout: params.split.holdout.length,
    institutions,
    productTypes,
    criticalFieldCoverage,
    skippedRecords: params.skippedRecords,
  };
}

export function buildAiReviewFineTuneDatasetFromEvalCases(params: {
  evalCases: FineTuneEvalCaseInput[];
  acceptedCorrectionIds: Set<string>;
  tenantScope?: "tenant" | "global_safe";
}): {
  rows: FineTuneJsonlRow[];
  split: { train: FineTuneJsonlRow[]; validation: FineTuneJsonlRow[]; holdout: FineTuneJsonlRow[] };
  summary: FineTuneExportSummary;
} {
  const tenantScope = params.tenantScope ?? "tenant";
  const skippedRecords: Array<{ id: string; reason: string }> = [];
  const rows: FineTuneJsonlRow[] = [];
  for (const evalCase of params.evalCases) {
    if (evalCase.piiScrubbed !== true) {
      skippedRecords.push({ id: evalCase.id, reason: "pii_not_scrubbed" });
      continue;
    }
    const sourceIds = Array.isArray(evalCase.sourceCorrectionIds) ? evalCase.sourceCorrectionIds : [];
    if (sourceIds.some((id) => !params.acceptedCorrectionIds.has(id))) {
      skippedRecords.push({ id: evalCase.id, reason: "source_correction_not_accepted_or_superseded" });
      continue;
    }
    if (!evalCase.anonymizedInputRef?.trim()) {
      skippedRecords.push({ id: evalCase.id, reason: "missing_anonymized_input_ref" });
      continue;
    }

    const state = createAnonymizerState();
    const expected = anonymizeAiReviewFineTunePayload(evalCase.expectedOutputJson, state);
    const criticalFields = Array.isArray(evalCase.criticalFields) ? evalCase.criticalFields.map(String) : [];
    const assistantPayload = { ...expected as Record<string, unknown>, __criticalFields: criticalFields };
    rows.push({
      messages: [
        { role: "system", content: SYSTEM_PROMPT },
        { role: "user", content: anonymizeAiReviewFineTuneText(evalCase.anonymizedInputRef, state) },
        { role: "assistant", content: JSON.stringify(assistantPayload) },
      ],
      metadata: {
        tenantScope,
        institution: evalCase.institutionName,
        product: evalCase.productName,
        documentType: evalCase.documentType,
        sourceEvalCaseId: evalCase.id,
        piiScrubbed: true,
      },
    });
  }

  assertFineTuneJsonlRowsSafe(rows);
  const split = splitRows(rows);
  return {
    rows,
    split,
    summary: buildFineTuneExportSummary({ rows, split, skippedRecords }),
  };
}

export function toJsonl(rows: FineTuneJsonlRow[]): string {
  return rows.map((row) => JSON.stringify(row)).join("\n") + (rows.length ? "\n" : "");
}
