import type {
  ExtractionDocument,
  ExtractedGroup,
  ExtractedField,
  AIRecommendation,
  FieldStatus,
  ExtractionDiagnostics,
  ProcessingStatus,
  ReviewStatus,
  ClientMatchCandidate,
  DraftAction,
} from "./types";
import { buildHumanSummary, buildHumanErrorMessage, getDocumentTypeLabel } from "../ai/document-messages";
import type { PrimaryDocumentType } from "../ai/document-review-types";
import type { DocumentReviewEnvelope } from "../ai/document-review-types";
import type { InputMode } from "../ai/input-mode-detection";
import { formatAiClassifierForAdvisor } from "./czech-labels";
import { advisorFieldPresentation, shouldCountFieldForAttentionBanner } from "./advisor-confidence-policy";
import { buildAdvisorReviewViewModel } from "./advisor-review-view-model";

type ApiReviewDetail = Record<string, unknown>;

function humanPrimaryTypeHeading(raw: string): string {
  if (!raw || raw === "Neznámý typ") return raw;
  const phrase = getDocumentTypeLabel(raw as PrimaryDocumentType);
  if (!phrase) return raw.replace(/_/g, " ");
  return phrase.charAt(0).toUpperCase() + phrase.slice(1);
}

const PROCESSING_STAGE_LABELS_CS: Record<string, string> = {
  document_recognized: "Dokument rozpoznán",
  extracting: "Extrahuji klienta a smlouvu",
  matching_client: "Ověřuji platby a páruji klienta",
  finalizing: "Připravuji návrhy akcí",
};

const SECTION_LABELS: Record<string, string> = {
  contract: "Smlouva",
  client: "Klient",
  institution: "Instituce",
  product: "Produkt",
  paymentDetails: "Platby",
  dates: "Datum",
  coverage: "Krytí",
  risks: "Krytá rizika",
  parties: "Smluvní strany",
  payment: "Platební údaje",
  other: "Ostatní",
};

const SECTION_ICONS: Record<string, string> = {
  client: "User",
  contract: "FileText",
  institution: "Building2",
  product: "FileText",
  paymentDetails: "FileText",
  dates: "FileText",
  coverage: "Shield",
  risks: "Shield",
  parties: "User",
  other: "Heart",
};

const FIELD_LABELS: Record<string, string> = {
  contractNumber: "Číslo smlouvy",
  existingPolicyNumber: "Číslo existující pojistky",
  businessCaseNumber: "Číslo obch. případu",
  institutionName: "Pojišťovna / instituce",
  insurer: "Pojišťovna",
  lender: "Poskytovatel úvěru",
  provider: "Poskytovatel",
  platform: "Platforma",
  productName: "Produkt",
  fullName: "Jméno a příjmení",
  clientFullName: "Jméno klienta",
  firstName: "Jméno",
  lastName: "Příjmení",
  email: "E-mail",
  clientEmail: "E-mail klienta",
  phone: "Telefon",
  clientPhone: "Telefon klienta",
  birthDate: "Datum narození",
  personalId: "Rodné číslo",
  maskedPersonalId: "Rodné číslo (maskované)",
  companyId: "IČO",
  address: "Adresa",
  permanentAddress: "Trvalé bydliště",
  startDate: "Počátek smlouvy",
  policyStartDate: "Počátek pojištění",
  policyEndDate: "Konec pojištění",
  endDate: "Konec smlouvy",
  dateSigned: "Datum podpisu",
  premiumAmount: "Pojistné",
  totalMonthlyPremium: "Celkové měsíční pojistné",
  riskPremium: "Rizikové pojistné",
  investmentPremium: "Investiční pojistné",
  premiumFrequency: "Frekvence plateb",
  paymentFrequency: "Frekvence plateb",
  deathBenefit: "Pojistná částka na smrt",
  beneficiary: "Obmyšlená osoba",
  beneficiaries: "Oprávněné osoby",
  vinkulace: "Vinkulace",
  coverages: "Sjednaná rizika",
  riders: "Připojištění",
  investmentStrategy: "Investiční strategie",
  investmentFunds: "Fondy",
  fundAllocation: "Alokace fondů",
  feeStructure: "Poplatková struktura",
  loanAmount: "Výše úvěru",
  installmentAmount: "Výše splátky",
  interestRate: "Úroková sazba",
  rpsn: "RPSN",
  installmentCount: "Počet splátek",
  bankAccount: "Číslo účtu",
  iban: "IBAN",
  bic: "SWIFT/BIC",
  bankCode: "Kód banky",
  variableSymbol: "Variabilní symbol",
  specificSymbol: "Specifický symbol",
  regularAmount: "Pravidelná částka",
  oneOffAmount: "Jednorázová částka",
  currency: "Měna",
  firstPaymentDate: "Datum první platby",
  paymentPurpose: "Účel platby",
  paymentType: "Typ platby",
  employerName: "Zaměstnavatel",
  employeeFullName: "Jméno zaměstnance",
  netWage: "Čistá mzda",
  grossWage: "Hrubá mzda",
  advisorName: "Zprostředkovatel",
  brokerName: "Makléř",
};

function fieldConfidence(
  fieldKey: string,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence: number
): number {
  if (fieldConfidenceMap) {
    for (const [section, val] of Object.entries(fieldConfidenceMap)) {
      if (fieldKey.toLowerCase().includes(section.toLowerCase())) {
        return Math.round(val * 100);
      }
    }
  }
  return Math.round(globalConfidence * 100);
}

function fieldStatus(conf: number, value: unknown): FieldStatus {
  if (!value || value === "—" || value === "Nenalezeno" || value === "Nevyplněno") return "error";
  if (conf < 85) return "warning";
  return "success";
}

export function formatExtractedValue(v: unknown): string {
  if (v == null) return "—";
  if (typeof v === "string" || typeof v === "number" || typeof v === "boolean") return String(v);
  if (Array.isArray(v)) {
    const parts = v.map((x) => formatExtractedValue(x)).filter((s) => s && s !== "—");
    return parts.length ? parts.join(", ") : "—";
  }
  if (typeof v === "object") {
    try {
      const s = JSON.stringify(v);
      return s.length > 480 ? `${s.slice(0, 477)}…` : s;
    } catch {
      return "—";
    }
  }
  return String(v);
}

function looksLikeDocumentEnvelope(payload: Record<string, unknown>): boolean {
  return (
    payload.documentClassification != null &&
    typeof payload.documentClassification === "object" &&
    payload.extractedFields != null &&
    typeof payload.extractedFields === "object"
  );
}

type ReadabilityCtx = {
  inputMode?: string;
  textCoverageEstimate?: number;
  preprocessStatus?: string;
};

function flattenEnvelopeToGroups(
  envelope: Record<string, unknown>,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence01: number,
  ctx: ReadabilityCtx
): ExtractedGroup[] {
  const groups: ExtractedGroup[] = [];
  const ef = envelope.extractedFields as
    | Record<string, { value?: unknown; status?: string; confidence?: number }>
    | undefined;
  if (ef && typeof ef === "object") {
    const fields: ExtractedField[] = [];
    for (const [fKey, fObj] of Object.entries(ef)) {
      if (!fObj || typeof fObj !== "object" || fKey.startsWith("_")) continue;
      const rawVal = fObj.value;
      const strVal = formatExtractedValue(rawVal);
      const conf01 =
        typeof fObj.confidence === "number" && Number.isFinite(fObj.confidence)
          ? fObj.confidence
          : globalConfidence01;
      const confPct = fieldConfidence(fKey, fieldConfidenceMap, globalConfidence01);
      const pres = advisorFieldPresentation(rawVal, fObj.status, conf01, {
        inputMode: ctx.inputMode as InputMode | undefined,
        textCoverageEstimate: ctx.textCoverageEstimate,
        preprocessStatus: ctx.preprocessStatus,
      });
      fields.push({
        id: `extractedFields.${fKey}`,
        groupId: "extractedFields",
        label: FIELD_LABELS[fKey] ?? fKey.replace(/([A-Z])/g, " $1").replace(/^./, (s) => s.toUpperCase()).trim(),
        value: strVal,
        confidence: confPct,
        status: pres.status,
        message: pres.message,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      });
    }
    if (fields.length > 0) {
      fields.sort((a, b) => a.label.localeCompare(b.label, "cs"));
      groups.push({
        id: "extractedFields",
        name: "Extrahovaná pole",
        iconName: "FileText",
        fields,
      });
    }
  }

  const parties = envelope.parties as Record<string, unknown> | undefined;
  if (parties && typeof parties === "object" && Object.keys(parties).length > 0) {
    const pFields: ExtractedField[] = [];
    for (const [pk, pv] of Object.entries(parties)) {
      if (pk.startsWith("_")) continue;
      const strVal = formatExtractedValue(pv);
      const confPct = fieldConfidence(pk, fieldConfidenceMap, globalConfidence01);
      const pres = advisorFieldPresentation(pv, "extracted", globalConfidence01, {
        inputMode: ctx.inputMode as InputMode | undefined,
        textCoverageEstimate: ctx.textCoverageEstimate,
        preprocessStatus: ctx.preprocessStatus,
      });
      pFields.push({
        id: `parties.${pk}`,
        groupId: "parties",
        label: FIELD_LABELS[pk] ?? pk.replace(/_/g, " "),
        value: strVal,
        confidence: confPct,
        status: strVal === "—" ? "error" : pres.status,
        message: strVal === "—" ? "Údaj nebyl nalezen nebo chybí v dokumentu." : pres.message,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      });
    }
    if (pFields.length > 0) {
      groups.push({
        id: "parties",
        name: SECTION_LABELS.parties,
        iconName: "User",
        fields: pFields,
      });
    }
  }

  const ft = envelope.financialTerms as Record<string, unknown> | undefined;
  if (ft && typeof ft === "object") {
    const ftFields: ExtractedField[] = [];
    for (const [k, v] of Object.entries(ft)) {
      if (k.startsWith("_")) continue;
      if (v != null && typeof v === "object" && !Array.isArray(v)) continue;
      const strVal = formatExtractedValue(v);
      if (strVal === "—") continue;
      const confPct = fieldConfidence(k, fieldConfidenceMap, globalConfidence01);
      ftFields.push({
        id: `financialTerms.${k}`,
        groupId: "financialTerms",
        label: FIELD_LABELS[k] ?? k.replace(/_/g, " "),
        value: strVal,
        confidence: confPct,
        status: fieldStatus(confPct, v),
        message:
          fieldStatus(confPct, v) === "warning"
            ? "Ověřte oproti dokumentu."
            : undefined,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      });
    }
    if (ftFields.length > 0) {
      groups.push({
        id: "financialTerms",
        name: "Finanční údaje (text)",
        iconName: "FileText",
        fields: ftFields,
      });
    }
  }

  return groups;
}

function flattenPayload(
  payload: Record<string, unknown>,
  fieldConfidenceMap: Record<string, number> | undefined,
  globalConfidence: number,
): ExtractedGroup[] {
  const groups: ExtractedGroup[] = [];

  for (const [sectionKey, sectionVal] of Object.entries(payload)) {
    if (
      sectionKey === "missingFields" ||
      sectionKey === "rawConfidence" ||
      sectionKey === "additionalNotes" ||
      sectionKey.startsWith("_")
    ) continue;

    if (typeof sectionVal === "object" && sectionVal !== null && !Array.isArray(sectionVal)) {
      const fields: ExtractedField[] = [];
      const section = sectionVal as Record<string, unknown>;

      for (const [fKey, fVal] of Object.entries(section)) {
        if (fKey.startsWith("_")) continue;
        const strVal = fVal == null ? "—" : String(fVal);
        const conf = fieldConfidence(fKey, fieldConfidenceMap, globalConfidence);
        const status = fieldStatus(conf, fVal);
        fields.push({
          id: `${sectionKey}.${fKey}`,
          groupId: sectionKey,
          label: FIELD_LABELS[fKey] ?? fKey,
          value: strVal,
          confidence: conf,
          status,
          message: status === "error"
            ? "Údaj nebyl nalezen nebo chybí v dokumentu."
            : status === "warning"
              ? "Nižší jistota čtení. Ověřte prosím oproti originálu dokumentu."
              : undefined,
          sourceType: "ai",
          isConfirmed: false,
          isEdited: false,
          originalAiValue: strVal,
        });
      }
      if (fields.length > 0) {
        groups.push({
          id: sectionKey,
          name: SECTION_LABELS[sectionKey] ?? sectionKey,
          iconName: SECTION_ICONS[sectionKey] ?? "FileText",
          fields,
        });
      }
    } else if (typeof sectionVal === "string" || typeof sectionVal === "number") {
      const ungrouped = groups.find((g) => g.id === "__ungrouped");
      const strVal = String(sectionVal);
      const conf = fieldConfidence(sectionKey, fieldConfidenceMap, globalConfidence);
      const status = fieldStatus(conf, sectionVal);
      const field: ExtractedField = {
        id: `root.${sectionKey}`,
        groupId: "__ungrouped",
        label: FIELD_LABELS[sectionKey] ?? sectionKey,
        value: strVal,
        confidence: conf,
        status,
        message: status === "error"
          ? "Údaj nebyl nalezen nebo chybí v dokumentu."
          : status === "warning"
            ? "Nižší jistota čtení. Ověřte prosím oproti originálu dokumentu."
            : undefined,
        sourceType: "ai",
        isConfirmed: false,
        isEdited: false,
        originalAiValue: strVal,
      };
      if (ungrouped) {
        ungrouped.fields.push(field);
      } else {
        groups.push({
          id: "__ungrouped",
          name: "Obecné údaje",
          iconName: "FileText",
          fields: [field],
        });
      }
    }
  }

  return groups;
}

function buildRecommendations(
  detail: ApiReviewDetail,
  groups: ExtractedGroup[]
): AIRecommendation[] {
  const recs: AIRecommendation[] = [];
  let idx = 0;

  const warnings = (detail.validationWarnings as Array<{ code?: string; message: string; field?: string }> | undefined) ?? [];
  for (const w of warnings) {
    recs.push({
      id: `vw-${idx++}`,
      type: "compliance",
      severity: "medium",
      title: w.field ? `Validace: ${w.field}` : "Validační upozornění",
      description: w.message,
      linkedFieldIds: w.field
        ? groups.flatMap((g) => g.fields).filter((f) => f.id.includes(w.field!)).map((f) => f.id)
        : [],
      actionState: "pending",
      dismissed: false,
      createdAt: new Date().toISOString(),
    });
  }

  const errorFields = groups.flatMap((g) => g.fields).filter((f) => f.status === "error");
  for (const f of errorFields) {
    recs.push({
      id: `missing-${f.id}`,
      type: "warning",
      severity: "high",
      title: `Chybí: ${f.label}`,
      description: `Údaj „${f.label}" nebyl nalezen v dokumentu. Ověřte prosím s klientem nebo v evidenci.`,
      linkedFieldIds: [f.id],
      actionState: "pending",
      dismissed: false,
      createdAt: new Date().toISOString(),
    });
  }

  return recs;
}

function buildDiagnostics(
  detail: ApiReviewDetail,
  groups: ExtractedGroup[]
): ExtractionDiagnostics {
  const allFields = groups.flatMap((g) => g.fields);
  const warningCount = allFields.filter(shouldCountFieldForAttentionBanner).length;
  const errorCount = allFields.filter((f) => f.status === "error").length;
  const extractedCount = allFields.filter((f) => f.status !== "error").length;
  const totalCount = allFields.length;

  const notes: string[] = [];
  const trace = detail.extractionTrace as { failedStep?: string; warnings?: string[] } | undefined;
  if (trace?.warnings) notes.push(...trace.warnings);
  if (detail.extractionMode) notes.push(`Režim extrakce: ${detail.extractionMode}`);
  if (detail.inputMode) notes.push(`Režim vstupu: ${detail.inputMode}`);
  if (errorCount > 0) notes.push(`${errorCount} údajů nenalezeno`);
  if (warningCount > 0) notes.push(`${warningCount} údajů s nižší jistotou`);

  return {
    ocrQuality: errorCount > 3 ? "poor" : warningCount > 2 ? "fair" : "good",
    extractionCoverage: totalCount > 0 ? Math.round((extractedCount / totalCount) * 100) : 0,
    totalFields: totalCount,
    extractedFields: extractedCount,
    unresolvedFieldCount: errorCount,
    warningCount,
    errorCount,
    conflictingValueCount: 0,
    pagesWithoutReadableText: [],
    notes,
  };
}

function pickClientNameFromPayload(extracted: Record<string, unknown>): string | undefined {
  if (looksLikeDocumentEnvelope(extracted)) {
    const ef = extracted.extractedFields as Record<string, { value?: unknown }> | undefined;
    if (!ef) return undefined;
    const p = (k: string) => {
      const v = ef[k]?.value;
      return v != null && String(v).trim() ? String(v).trim() : "";
    };
    const n = p("fullName") || p("clientFullName") || [p("firstName"), p("lastName")].filter(Boolean).join(" ");
    return n || undefined;
  }
  const client = (extracted.client ?? {}) as Record<string, unknown>;
  const flat = [client.fullName, client.firstName, client.lastName].filter(Boolean).join(" ");
  return flat || undefined;
}

function buildSummary(
  detail: ApiReviewDetail,
  groups: ExtractedGroup[],
  diagnostics: ExtractionDiagnostics
): string {
  const extracted = (detail.extractedPayload ?? {}) as Record<string, unknown>;
  const dc = extracted.documentClassification as Record<string, unknown> | undefined;
  const primaryType =
    (dc?.primaryType as PrimaryDocumentType) ??
    (detail.detectedDocumentType as PrimaryDocumentType) ??
    "generic_financial_document";
  const lifecycle =
    (dc?.lifecycleStatus as string) ?? (detail.lifecycleStatus as string) ?? "unknown";
  const inputMode = (detail.inputMode as InputMode) ?? "text_pdf";
  const confidence = (detail.confidence as number) ?? 0;
  const contentFlags = (extracted.contentFlags ?? {}) as Record<string, boolean>;
  const ef = extracted.extractedFields as Record<string, { value?: unknown }> | undefined;
  const productName =
    (extracted.productName as string | undefined) ?? (ef?.productName?.value != null ? String(ef.productName.value) : undefined);
  const institutionName =
    (extracted.institutionName as string | undefined) ??
    (ef?.institutionName?.value != null ? String(ef.institutionName.value) : undefined) ??
    (ef?.insurer?.value != null ? String(ef.insurer.value) : undefined);
  const contractNumber =
    (extracted.contractNumber as string | undefined) ??
    (ef?.contractNumber?.value != null ? String(ef.contractNumber.value) : undefined);

  const humanSummary = buildHumanSummary({
    primaryType,
    lifecycleStatus: lifecycle as Parameters<typeof buildHumanSummary>[0]["lifecycleStatus"],
    inputMode,
    confidence,
    productName,
    institutionName,
    contractNumber,
    clientName: pickClientNameFromPayload(extracted),
    containsPaymentInstructions: contentFlags.containsPaymentInstructions ?? false,
    reasonsForReview: detail.reasonsForReview as string[] | undefined,
  });

  const techDetail = `AI vytěžila ${diagnostics.extractedFields} z ${diagnostics.totalFields} polí.`;
  return `${humanSummary} ${techDetail}`;
}

/**
 * Apply inline review edits onto the API `extractedPayload` shape (section.key field ids from flattenPayload).
 */
export function mergeFieldEditsIntoExtractedPayload(
  payload: Record<string, unknown>,
  editedFields: Record<string, string>
): { merged: Record<string, unknown>; correctedFields: string[] } {
  const correctedFields: string[] = [];
  let merged: Record<string, unknown>;
  try {
    merged = structuredClone(payload) as Record<string, unknown>;
  } catch {
    merged = JSON.parse(JSON.stringify(payload)) as Record<string, unknown>;
  }
  for (const [fieldId, value] of Object.entries(editedFields)) {
    const parts = fieldId.split(".");
    if (parts[0] === "extractedFields" && parts.length === 2) {
      const key = parts[1];
      const rootEf = merged.extractedFields;
      if (rootEf && typeof rootEf === "object" && !Array.isArray(rootEf)) {
        const ef = rootEf as Record<string, Record<string, unknown>>;
        const cell = ef[key];
        if (cell && typeof cell === "object" && !Array.isArray(cell)) {
          cell.value = value;
        } else {
          ef[key] = { value, status: "extracted", confidence: 1 };
        }
        correctedFields.push(fieldId);
      }
      continue;
    }
    if (parts.length === 2 && parts[0] !== "root") {
      const [sec, key] = parts;
      const section = merged[sec];
      if (section && typeof section === "object" && section !== null && !Array.isArray(section)) {
        const slot = (section as Record<string, unknown>)[key];
        if (slot && typeof slot === "object" && !Array.isArray(slot) && "value" in (slot as object)) {
          (slot as Record<string, unknown>).value = value;
        } else {
          (section as Record<string, unknown>)[key] = value;
        }
        correctedFields.push(fieldId);
      }
    } else if (parts[0] === "root" && parts.length === 2) {
      merged[parts[1]] = value;
      correctedFields.push(fieldId);
    }
  }
  return { merged, correctedFields };
}

function dedupeDraftActions(actions: DraftAction[]): DraftAction[] {
  const seen = new Set<string>();
  const out: DraftAction[] = [];
  for (const a of actions) {
    const k = `${a.type}:${a.label}`;
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(a);
  }
  return out;
}

export function mapApiToExtractionDocument(
  detail: ApiReviewDetail,
  pdfUrl: string
): ExtractionDocument {
  const extracted = (detail.extractedPayload ?? {}) as Record<string, unknown>;
  const confidence = (detail.confidence as number | null) ?? 0;
  const fieldConfidenceMap = detail.fieldConfidenceMap as Record<string, number> | undefined;
  const processingStatus = (detail.processingStatus as string) ?? "uploaded";
  const reviewStatus = (detail.reviewStatus as string) ?? "pending";
  const processingStage = detail.processingStage as string | undefined;
  const processingStageLabel =
    processingStage && PROCESSING_STAGE_LABELS_CS[processingStage]
      ? PROCESSING_STAGE_LABELS_CS[processingStage]
      : undefined;

  const insights = detail.pipelineInsights as ExtractionDocument["pipelineInsights"] | undefined;
  const readCtx: ReadabilityCtx = {
    inputMode: detail.inputMode as string | undefined,
    textCoverageEstimate: insights?.textCoverageEstimate,
    preprocessStatus: insights?.preprocessStatus,
  };

  const groups =
    Object.keys(extracted).length > 0
      ? looksLikeDocumentEnvelope(extracted)
        ? flattenEnvelopeToGroups(extracted, fieldConfidenceMap, confidence, readCtx)
        : flattenPayload(extracted, fieldConfidenceMap, confidence)
      : [];

  const diagnostics = buildDiagnostics(detail, groups);
  const recommendations = buildRecommendations(detail, groups);
  const summary = buildSummary(detail, groups, diagnostics);

  const clientName = pickClientNameFromPayload(extracted) ?? "—";

  const norm = insights?.normalizedPipelineClassification;
  const baseType = (detail.detectedDocumentType as string) ?? "Neznámý typ";
  const trace = detail.extractionTrace as Record<string, unknown> | undefined;
  const aiRaw = trace?.aiClassifierJson as Record<string, string> | undefined;
  let documentTypeLabel = humanPrimaryTypeHeading(baseType);
  if (aiRaw && (aiRaw.documentType || aiRaw.productFamily)) {
    documentTypeLabel = formatAiClassifierForAdvisor(aiRaw);
  } else if (norm && norm !== baseType) {
    documentTypeLabel = `${humanPrimaryTypeHeading(baseType)} · ${norm}`;
  }

  const advisorReview = looksLikeDocumentEnvelope(extracted)
    ? buildAdvisorReviewViewModel({
        envelope: extracted as unknown as DocumentReviewEnvelope,
        aiClassifierJson: aiRaw,
        detectedDocumentTypeLabel: documentTypeLabel,
        reasonsForReview: detail.reasonsForReview as string[] | undefined,
        validationWarnings: detail.validationWarnings as
          | Array<{ code?: string; message: string }>
          | undefined,
        extractionTrace: trace,
      })
    : undefined;

  const apiDrafts = (detail.draftActions as DraftAction[] | undefined) ?? [];
  const mergedDrafts = dedupeDraftActions([
    ...apiDrafts,
    ...(advisorReview?.workActions ?? []),
  ]);

  return {
    id: detail.id as string,
    fileName: detail.fileName as string,
    documentType: documentTypeLabel,
    clientName,
    uploadTime: detail.createdAt
      ? new Date(detail.createdAt as string).toLocaleString("cs-CZ")
      : "—",
    pageCount: 1,
    globalConfidence: Math.round(confidence * 100),
    reviewStatus: reviewStatus as ReviewStatus,
    processingStatus: processingStatus as ProcessingStatus,
    processingStageLabel,
    extractionProvider: "internal",
    uploadSource: "upload",
    lastProcessedAt: detail.updatedAt
      ? new Date(detail.updatedAt as string).toLocaleString("cs-CZ")
      : "—",
    executiveSummary: summary,
    recommendations,
    diagnostics,
    groups,
    extraRecommendations: [],
    pdfUrl,
    errorMessage: detail.errorMessage
      ? buildHumanErrorMessage({
          errorMessage: detail.errorMessage as string,
          primaryType: detail.detectedDocumentType as PrimaryDocumentType | undefined,
          inputMode: detail.inputMode as InputMode | undefined,
        })
      : undefined,
    reasonsForReview: detail.reasonsForReview as string[] | undefined,
    clientMatchCandidates:
      (detail.clientMatchCandidates as ClientMatchCandidate[] | undefined) ?? [],
    draftActions: mergedDrafts,
    inputMode: detail.inputMode as string | undefined,
    advisorReview,
    matchedClientId: detail.matchedClientId as string | undefined,
    createNewClientConfirmed: detail.createNewClientConfirmed as string | undefined,
    isApplied: reviewStatus === "applied",
    applyResultPayload: detail.applyResultPayload as ExtractionDocument["applyResultPayload"],
    extractionTrace: detail.extractionTrace as ExtractionDocument["extractionTrace"],
    validationWarnings: detail.validationWarnings as ExtractionDocument["validationWarnings"],
    classificationReasons: detail.classificationReasons as string[] | undefined,
    fieldConfidenceMap,
    pipelineInsights: insights,
    applyGate: detail.applyGate as ExtractionDocument["applyGate"],
  };
}
