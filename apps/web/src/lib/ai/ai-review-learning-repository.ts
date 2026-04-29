import {
  aiReviewCorrectionEvents,
  aiReviewEvalCases,
  aiReviewLearningPatterns,
  contractUploadReviews,
  and,
  desc,
  eq,
  inArray,
  ne,
  sql,
} from "db";
import type {
  AiReviewCorrectionEventRow,
  AiReviewCorrectionType,
  AiReviewEvalCaseRow,
  AiReviewLearningPatternRow,
  AiReviewLearningScope,
  AiReviewPatternSeverity,
  AiReviewPatternType,
  AiReviewPiiLevel,
} from "db";
import { withServiceTenantContext } from "@/lib/db/service-db";
import { logAiReviewLearningEvent } from "./ai-review-learning-observability";

export type CreateCorrectionEventInput = {
  tenantId: string;
  reviewId: string;
  documentId?: string | null;
  documentHash?: string | null;
  extractionRunId?: string | null;
  institutionName?: string | null;
  productName?: string | null;
  documentType?: string | null;
  lifecycleStatus?: string | null;
  fieldPath: string;
  fieldLabel?: string | null;
  originalValueJson?: unknown | null;
  correctedValueJson: unknown;
  normalizedOriginalValue?: string | null;
  normalizedCorrectedValue?: string | null;
  correctionType: AiReviewCorrectionType;
  sourcePage?: number | null;
  evidenceSnippet?: string | null;
  promptVersion?: string | null;
  schemaVersion?: string | null;
  modelName?: string | null;
  pipelineVersion?: string | null;
  createdBy: string;
  piiLevel?: AiReviewPiiLevel;
  supersededBy?: string | null;
};

export type UpsertLearningPatternInput = {
  tenantId: string;
  scope: AiReviewLearningScope;
  institutionName?: string | null;
  productName?: string | null;
  documentType?: string | null;
  fieldPath?: string | null;
  patternType: AiReviewPatternType;
  ruleText: string;
  promptHint?: string | null;
  validatorHintJson?: Record<string, unknown> | null;
  supportCount?: number;
  confidence?: number;
  severity?: AiReviewPatternSeverity;
  enabled?: boolean;
  sourceCorrectionIds?: string[];
  lastSeenAt?: Date | null;
};

export type ListLearningPatternsFilters = {
  tenantId: string;
  enabled?: boolean;
  scope?: AiReviewLearningScope;
  institutionName?: string | null;
  productName?: string | null;
  documentType?: string | null;
  patternType?: AiReviewPatternType;
  limit?: number;
};

function nullableEq<TColumn>(column: TColumn, value: string | null | undefined) {
  return value == null ? sql`${column} IS NULL` : sql`${column} = ${value}`;
}

export async function createCorrectionEvent(
  input: CreateCorrectionEventInput,
): Promise<string> {
  return await withServiceTenantContext(
    { tenantId: input.tenantId, userId: input.createdBy },
    async (tx) => {
      const [row] = await tx
        .insert(aiReviewCorrectionEvents)
        .values({
          tenantId: input.tenantId,
          reviewId: input.reviewId,
          documentId: input.documentId ?? null,
          documentHash: input.documentHash ?? null,
          extractionRunId: input.extractionRunId ?? null,
          institutionName: input.institutionName ?? null,
          productName: input.productName ?? null,
          documentType: input.documentType ?? null,
          lifecycleStatus: input.lifecycleStatus ?? null,
          fieldPath: input.fieldPath,
          fieldLabel: input.fieldLabel ?? null,
          originalValueJson: input.originalValueJson ?? null,
          correctedValueJson: input.correctedValueJson,
          normalizedOriginalValue: input.normalizedOriginalValue ?? null,
          normalizedCorrectedValue: input.normalizedCorrectedValue ?? null,
          correctionType: input.correctionType,
          sourcePage: input.sourcePage ?? null,
          evidenceSnippet: input.evidenceSnippet ?? null,
          promptVersion: input.promptVersion ?? null,
          schemaVersion: input.schemaVersion ?? null,
          modelName: input.modelName ?? null,
          pipelineVersion: input.pipelineVersion ?? null,
          createdBy: input.createdBy,
          piiLevel: input.piiLevel ?? "contains_customer_data",
          supersededBy: input.supersededBy ?? null,
        })
        .returning({ id: aiReviewCorrectionEvents.id });
      if (!row?.id) throw new Error("Failed to create AI Review correction event");
      logAiReviewLearningEvent("correction_event_created", {
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        correctionEventId: row.id,
        fieldPath: input.fieldPath,
        correctionType: input.correctionType,
        piiLevel: input.piiLevel ?? "contains_customer_data",
      });
      return row.id;
    },
  );
}

export async function createDraftCorrectionEvent(
  input: CreateCorrectionEventInput,
): Promise<string> {
  return await withServiceTenantContext(
    { tenantId: input.tenantId, userId: input.createdBy },
    async (tx) => {
      const [created] = await tx
        .insert(aiReviewCorrectionEvents)
        .values({
          tenantId: input.tenantId,
          reviewId: input.reviewId,
          documentId: input.documentId ?? null,
          documentHash: input.documentHash ?? null,
          extractionRunId: input.extractionRunId ?? null,
          institutionName: input.institutionName ?? null,
          productName: input.productName ?? null,
          documentType: input.documentType ?? null,
          lifecycleStatus: input.lifecycleStatus ?? null,
          fieldPath: input.fieldPath,
          fieldLabel: input.fieldLabel ?? null,
          originalValueJson: input.originalValueJson ?? null,
          correctedValueJson: input.correctedValueJson,
          normalizedOriginalValue: input.normalizedOriginalValue ?? null,
          normalizedCorrectedValue: input.normalizedCorrectedValue ?? null,
          correctionType: input.correctionType,
          sourcePage: input.sourcePage ?? null,
          evidenceSnippet: input.evidenceSnippet ?? null,
          promptVersion: input.promptVersion ?? null,
          schemaVersion: input.schemaVersion ?? null,
          modelName: input.modelName ?? null,
          pipelineVersion: input.pipelineVersion ?? null,
          createdBy: input.createdBy,
          piiLevel: input.piiLevel ?? "contains_customer_data",
          supersededBy: input.supersededBy ?? null,
        })
        .returning({ id: aiReviewCorrectionEvents.id });

      if (!created?.id) throw new Error("Failed to create draft AI Review correction event");

      await tx
        .update(aiReviewCorrectionEvents)
        .set({ supersededBy: created.id })
        .where(and(
          eq(aiReviewCorrectionEvents.tenantId, input.tenantId),
          eq(aiReviewCorrectionEvents.reviewId, input.reviewId),
          eq(aiReviewCorrectionEvents.fieldPath, input.fieldPath),
          eq(aiReviewCorrectionEvents.createdBy, input.createdBy),
          eq(aiReviewCorrectionEvents.acceptedOnApproval, false),
          eq(aiReviewCorrectionEvents.rejected, false),
          sql`${aiReviewCorrectionEvents.supersededBy} IS NULL`,
          ne(aiReviewCorrectionEvents.id, created.id),
        ));

      logAiReviewLearningEvent("correction_event_created", {
        tenantId: input.tenantId,
        reviewId: input.reviewId,
        correctionEventId: created.id,
        fieldPath: input.fieldPath,
        correctionType: input.correctionType,
        draft: true,
        piiLevel: input.piiLevel ?? "contains_customer_data",
      });
      return created.id;
    },
  );
}

export async function listCorrectionEventsForReview(params: {
  tenantId: string;
  reviewId: string;
  limit?: number;
}): Promise<AiReviewCorrectionEventRow[]> {
  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    return await tx
      .select()
      .from(aiReviewCorrectionEvents)
      .where(and(
        eq(aiReviewCorrectionEvents.tenantId, params.tenantId),
        eq(aiReviewCorrectionEvents.reviewId, params.reviewId),
      ))
      .orderBy(desc(aiReviewCorrectionEvents.createdAt))
      .limit(params.limit ?? 100);
  });
}

export async function acceptCorrectionEventsForReview(params: {
  tenantId: string;
  reviewId: string;
  acceptedAt?: Date;
}): Promise<string[]> {
  const acceptedAt = params.acceptedAt ?? new Date();
  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    const rows = await tx
      .update(aiReviewCorrectionEvents)
      .set({
        acceptedOnApproval: true,
        acceptedAt,
      })
      .where(and(
        eq(aiReviewCorrectionEvents.tenantId, params.tenantId),
        eq(aiReviewCorrectionEvents.reviewId, params.reviewId),
        eq(aiReviewCorrectionEvents.acceptedOnApproval, false),
        eq(aiReviewCorrectionEvents.rejected, false),
        sql`${aiReviewCorrectionEvents.supersededBy} IS NULL`,
      ))
      .returning({ id: aiReviewCorrectionEvents.id });
    const ids = rows.map((row) => row.id);
    logAiReviewLearningEvent("correction_events_accepted", {
      tenantId: params.tenantId,
      reviewId: params.reviewId,
      count: ids.length,
      correctionEventIds: ids,
    });
    return ids;
  });
}

export async function rejectCorrectionEvent(params: {
  tenantId: string;
  correctionEventId: string;
  rejectedReason?: string | null;
}): Promise<boolean> {
  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    const rows = await tx
      .update(aiReviewCorrectionEvents)
      .set({
        rejected: true,
        rejectedReason: params.rejectedReason ?? null,
        acceptedOnApproval: false,
        acceptedAt: null,
      })
      .where(and(
        eq(aiReviewCorrectionEvents.tenantId, params.tenantId),
        eq(aiReviewCorrectionEvents.id, params.correctionEventId),
      ))
      .returning({ id: aiReviewCorrectionEvents.id });
    return rows.length > 0;
  });
}

export async function upsertLearningPattern(
  input: UpsertLearningPatternInput,
): Promise<string> {
  return await withServiceTenantContext({ tenantId: input.tenantId }, async (tx) => {
    const now = new Date();
    const [existing] = await tx
      .select({ id: aiReviewLearningPatterns.id })
      .from(aiReviewLearningPatterns)
      .where(and(
        eq(aiReviewLearningPatterns.tenantId, input.tenantId),
        eq(aiReviewLearningPatterns.scope, input.scope),
        nullableEq(aiReviewLearningPatterns.institutionName, input.institutionName ?? null),
        nullableEq(aiReviewLearningPatterns.productName, input.productName ?? null),
        nullableEq(aiReviewLearningPatterns.documentType, input.documentType ?? null),
        nullableEq(aiReviewLearningPatterns.fieldPath, input.fieldPath ?? null),
        eq(aiReviewLearningPatterns.patternType, input.patternType),
      ))
      .limit(1);

    const values = {
      ruleText: input.ruleText,
      promptHint: input.promptHint ?? null,
      validatorHintJson: input.validatorHintJson ?? null,
      supportCount: input.supportCount ?? 1,
      confidence: String(input.confidence ?? 0.5),
      severity: input.severity ?? "medium",
      enabled: input.enabled ?? true,
      sourceCorrectionIds: input.sourceCorrectionIds ?? [],
      updatedAt: now,
      lastSeenAt: input.lastSeenAt ?? now,
    };

    if (existing?.id) {
      await tx
        .update(aiReviewLearningPatterns)
        .set(values)
        .where(and(
          eq(aiReviewLearningPatterns.tenantId, input.tenantId),
          eq(aiReviewLearningPatterns.id, existing.id),
        ));
      return existing.id;
    }

    const [created] = await tx
      .insert(aiReviewLearningPatterns)
      .values({
        tenantId: input.tenantId,
        scope: input.scope,
        institutionName: input.institutionName ?? null,
        productName: input.productName ?? null,
        documentType: input.documentType ?? null,
        fieldPath: input.fieldPath ?? null,
        patternType: input.patternType,
        createdAt: now,
        ...values,
      })
      .returning({ id: aiReviewLearningPatterns.id });
    if (!created?.id) throw new Error("Failed to upsert AI Review learning pattern");
    return created.id;
  });
}

export async function listLearningPatterns(
  filters: ListLearningPatternsFilters,
): Promise<AiReviewLearningPatternRow[]> {
  const conditions = [
    eq(aiReviewLearningPatterns.tenantId, filters.tenantId),
    filters.enabled == null ? undefined : eq(aiReviewLearningPatterns.enabled, filters.enabled),
    filters.scope == null ? undefined : eq(aiReviewLearningPatterns.scope, filters.scope),
    filters.institutionName === undefined ? undefined : nullableEq(aiReviewLearningPatterns.institutionName, filters.institutionName),
    filters.productName === undefined ? undefined : nullableEq(aiReviewLearningPatterns.productName, filters.productName),
    filters.documentType === undefined ? undefined : nullableEq(aiReviewLearningPatterns.documentType, filters.documentType),
    filters.patternType == null ? undefined : eq(aiReviewLearningPatterns.patternType, filters.patternType),
  ].filter(Boolean);

  return await withServiceTenantContext({ tenantId: filters.tenantId }, async (tx) => {
    return await tx
      .select()
      .from(aiReviewLearningPatterns)
      .where(and(...conditions))
      .orderBy(desc(aiReviewLearningPatterns.supportCount), desc(aiReviewLearningPatterns.updatedAt))
      .limit(filters.limit ?? 100);
  });
}

export async function createEvalCaseFromCorrections(params: {
  tenantId: string;
  reviewId?: string | null;
  sourceReviewId?: string | null;
  correctionIds: string[];
  expectedOutputJson?: unknown;
  criticalFields?: string[];
  anonymizedInputRef?: string | null;
  piiScrubbed?: boolean;
}): Promise<string | null> {
  if (!params.correctionIds.length) {
    throw new Error("Cannot create AI Review eval case without correction ids");
  }

  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    const reviewId = params.reviewId ?? params.sourceReviewId ?? null;
    const correctionConditions = [
      eq(aiReviewCorrectionEvents.tenantId, params.tenantId),
      inArray(aiReviewCorrectionEvents.id, params.correctionIds),
      eq(aiReviewCorrectionEvents.acceptedOnApproval, true),
      eq(aiReviewCorrectionEvents.rejected, false),
      reviewId == null ? undefined : eq(aiReviewCorrectionEvents.reviewId, reviewId),
    ].filter(Boolean);
    const corrections = await tx
      .select({
        id: aiReviewCorrectionEvents.id,
        reviewId: aiReviewCorrectionEvents.reviewId,
        documentHash: aiReviewCorrectionEvents.documentHash,
        institutionName: aiReviewCorrectionEvents.institutionName,
        productName: aiReviewCorrectionEvents.productName,
        documentType: aiReviewCorrectionEvents.documentType,
        fieldPath: aiReviewCorrectionEvents.fieldPath,
      })
      .from(aiReviewCorrectionEvents)
      .where(and(...correctionConditions));

    if (!corrections.length) {
      throw new Error("No tenant-scoped AI Review correction events found for eval case");
    }

    const first = corrections[0];
    const resolvedReviewId = reviewId ?? first.reviewId;
    let expectedOutputJson = params.expectedOutputJson;
    if (expectedOutputJson === undefined) {
      const [review] = await tx
        .select({
          extractedPayload: contractUploadReviews.extractedPayload,
          correctedPayload: contractUploadReviews.correctedPayload,
        })
        .from(contractUploadReviews)
        .where(and(
          eq(contractUploadReviews.tenantId, params.tenantId),
          eq(contractUploadReviews.id, resolvedReviewId),
        ))
        .limit(1);
      if (!review) throw new Error("Cannot create AI Review eval case without approved review output");
      expectedOutputJson = review.correctedPayload ?? review.extractedPayload ?? {};
    }

    const criticalFields = params.criticalFields ?? deriveEvalCriticalFields({
      correctionFieldPaths: corrections.map((correction) => correction.fieldPath),
      expectedOutput: expectedOutputJson,
    });
    if (!criticalFields.length) return null;

    const [created] = await tx
      .insert(aiReviewEvalCases)
      .values({
        tenantId: params.tenantId,
        sourceReviewId: resolvedReviewId,
        sourceCorrectionIds: corrections.map((correction) => correction.id),
        documentHash: first.documentHash,
        anonymizedInputRef: params.anonymizedInputRef ?? null,
        institutionName: first.institutionName,
        productName: first.productName,
        documentType: first.documentType,
        expectedOutputJson,
        criticalFields,
        piiScrubbed: params.piiScrubbed ?? false,
        active: true,
      })
      .returning({ id: aiReviewEvalCases.id });
    if (!created?.id) throw new Error("Failed to create AI Review eval case");
    logAiReviewLearningEvent("eval_case_created", {
      tenantId: params.tenantId,
      reviewId: resolvedReviewId,
      evalCaseId: created.id,
      correctionCount: corrections.length,
      criticalFields,
      piiScrubbed: params.piiScrubbed ?? false,
    });
    return created.id;
  });
}

const EVAL_CRITICAL_FIELD_ALIASES: Record<string, string> = {
  "extractedFields.contractNumber": "contractNumber",
  "extractedFields.institutionName": "institutionName",
  "extractedFields.insurer": "institutionName",
  "extractedFields.productName": "productName",
  "publishHints.contractPublishable": "publishIntent.shouldPublishToCrm",
};

function unique(values: string[]): string[] {
  return [...new Set(values.filter(Boolean))];
}

function deriveEvalCriticalFields(params: {
  correctionFieldPaths: string[];
  expectedOutput: unknown;
}): string[] {
  const fields: string[] = [];
  const expected = params.expectedOutput as Record<string, unknown> | null;
  for (const rawPath of params.correctionFieldPaths) {
    const path = EVAL_CRITICAL_FIELD_ALIASES[rawPath] ?? rawPath;
    const lower = path.toLowerCase();
    if (/participants|insuredpersons/.test(lower)) {
      const participants = Array.isArray(expected?.participants)
        ? expected.participants
        : Array.isArray(expected?.insuredPersons)
          ? expected.insuredPersons
          : [];
      fields.push("participants.length");
      participants.forEach((_participant, index) => {
        fields.push(`participants[${index}].fullName`, `participants[${index}].role`);
      });
    } else if (lower.includes("premium")) {
      fields.push("premium.totalMonthlyPremium", "premium.frequency");
      const premium = expected?.premium as Record<string, unknown> | undefined;
      const perInsured = Array.isArray(premium?.perInsured) ? premium.perInsured : [];
      perInsured.forEach((_row, index) => fields.push(`premium.perInsured[${index}].monthlyPremium`));
    } else if (lower.includes("publish")) {
      fields.push("publishIntent.shouldPublishToCrm");
    } else if (lower.includes("documentclassification") || lower.includes("lifecyclestatus")) {
      fields.push("documentClassification.primaryType", "documentClassification.lifecycleStatus");
    } else if (/contractnumber|institutionname|productname/.test(lower)) {
      fields.push(path);
    }
  }
  return unique(fields);
}

export async function listActiveEvalCases(params: {
  tenantId: string;
  limit?: number;
}): Promise<AiReviewEvalCaseRow[]> {
  return await withServiceTenantContext({ tenantId: params.tenantId }, async (tx) => {
    return await tx
      .select()
      .from(aiReviewEvalCases)
      .where(and(
        eq(aiReviewEvalCases.tenantId, params.tenantId),
        eq(aiReviewEvalCases.active, true),
      ))
      .orderBy(desc(aiReviewEvalCases.createdAt))
      .limit(params.limit ?? 500);
  });
}
