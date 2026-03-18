/**
 * Compose analysis output: single entry point for building normalized report payload.
 */

import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";
import type { CompanyFaPayload } from "@/lib/analyses/company-fa/types";
import type { NormalizedReportPayload, ExportMode } from "./types";
import type { PdfReportBranding } from "./buildPersonalReportPayload";
import { resolveOutputMode } from "./resolveOutputMode";
import { buildPersonalReportPayload } from "./buildPersonalReportPayload";
import { buildBusinessReportPayload } from "./buildBusinessReportPayload";
import { buildCombinedReportPayload } from "./buildCombinedReportPayload";

export type ReportProvenance = Record<string, "linked" | "overridden">;

export interface ComposeAnalysisOutputOptions {
  mode?: ExportMode;
  requestCombined?: boolean;
  contactId?: string | null;
  householdId?: string | null;
  companyId?: string | null;
  personalAnalysisId?: string | null;
  companyAnalysisId?: string | null;
  generatedBy?: string;
  title?: string;
  linksDescription?: string;
  provenance?: ReportProvenance;
  linkedCompanyName?: string | null;
  branding?: PdfReportBranding;
  theme?: 'elegant' | 'modern';
}

/**
 * Build normalized report payload from personal and/or company data.
 * Mode can be explicit or resolved from what data is provided.
 */
export function composeAnalysisOutput(
  personalData: FinancialAnalysisData | null,
  companyData: CompanyFaPayload | null,
  options?: ComposeAnalysisOutputOptions
): NormalizedReportPayload {
  const mode =
    options?.mode ??
    resolveOutputMode({
      hasPersonalData: personalData != null,
      hasCompanyData: companyData != null,
      requestCombined: options?.requestCombined,
    });

  if (mode === "personal_only" && personalData) {
    return buildPersonalReportPayload(personalData, {
      contactId: options?.contactId,
      householdId: options?.householdId,
      analysisId: options?.personalAnalysisId ?? undefined,
      generatedBy: options?.generatedBy,
      title: options?.title,
      provenance: options?.provenance,
      linkedCompanyName: options?.linkedCompanyName,
      branding: options?.branding,
      theme: options?.theme,
    });
  }

  if (mode === "business_only" && companyData) {
    return buildBusinessReportPayload(companyData, {
      companyId: options?.companyId,
      analysisId: options?.companyAnalysisId ?? undefined,
      generatedBy: options?.generatedBy,
      title: options?.title,
    });
  }

  if (mode === "combined") {
    return buildCombinedReportPayload(personalData ?? null, companyData ?? null, {
      contactId: options?.contactId,
      householdId: options?.householdId,
      companyId: options?.companyId,
      personalAnalysisId: options?.personalAnalysisId,
      companyAnalysisId: options?.companyAnalysisId,
      generatedBy: options?.generatedBy,
      title: options?.title,
      linksDescription: options?.linksDescription,
      provenance: options?.provenance,
      linkedCompanyName: options?.linkedCompanyName,
      branding: options?.branding,
      theme: options?.theme,
    });
  }

  return buildPersonalReportPayload(personalData ?? ({} as FinancialAnalysisData), { ...options, branding: options?.branding, theme: options?.theme });
}
