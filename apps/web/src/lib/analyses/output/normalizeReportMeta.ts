/**
 * Fill report metadata consistently for all report types.
 */

import type { ReportMeta, ExportMode, ReportType } from "./types";

export interface NormalizeReportMetaInput {
  type: ReportType;
  exportMode: ExportMode;
  generatedBy?: string;
  title?: string;
  contactId?: string | null;
  householdId?: string | null;
  companyId?: string | null;
  analysisId?: string | null;
  personalAnalysisId?: string | null;
  companyAnalysisId?: string | null;
}

export function normalizeReportMeta(input: NormalizeReportMetaInput): ReportMeta {
  const generatedAt = new Date().toISOString();
  return {
    type: input.type,
    exportMode: input.exportMode,
    generatedAt,
    generatedBy: input.generatedBy ?? undefined,
    title: input.title ?? undefined,
    contactId: input.contactId ?? null,
    householdId: input.householdId ?? null,
    companyId: input.companyId ?? null,
    analysisId: input.analysisId ?? null,
    personalAnalysisId: input.personalAnalysisId ?? null,
    companyAnalysisId: input.companyAnalysisId ?? null,
  };
}
