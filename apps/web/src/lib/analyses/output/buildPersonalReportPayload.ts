/**
 * Build normalized report payload for personal FA.
 */

import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";
import { buildReportHTML } from "@/lib/analyses/financial/report";
import type { NormalizedReportPayload, SubjectContext } from "./types";
import { normalizeReportMeta } from "./normalizeReportMeta";

export type ReportProvenance = Record<string, "linked" | "overridden">;

/** Branding for PDF report header, footer and cover logo (from advisor profile). */
export type PdfReportBranding = {
  authorName: string;
  footerLine: string;
  logoUrl?: string | null;
};

export interface BuildPersonalReportPayloadOptions {
  contactId?: string | null;
  householdId?: string | null;
  analysisId?: string | null;
  generatedBy?: string;
  title?: string;
  provenance?: ReportProvenance;
  linkedCompanyName?: string | null;
  branding?: PdfReportBranding;
  theme?: 'elegant' | 'modern';
}

export function buildPersonalReportPayload(
  data: FinancialAnalysisData,
  options?: BuildPersonalReportPayloadOptions
): NormalizedReportPayload {
  const subjectLabel = data.client?.name || "Klient";
  const subjectContext: SubjectContext = {
    subjectLabel,
    subjectId: data.clientId ?? undefined,
    secondaryLabel: data.householdId ? "Domácnost" : undefined,
  };

  const html = buildReportHTML(data, {
    provenance: options?.provenance,
    linkedCompanyName: options?.linkedCompanyName,
    branding: options?.branding,
    theme: options?.theme,
  });

  const meta = normalizeReportMeta({
    type: "personal",
    exportMode: "personal_only",
    generatedBy: options?.generatedBy,
    title: options?.title ?? `Finanční plán – ${subjectLabel}`,
    contactId: options?.contactId ?? data.clientId ?? null,
    householdId: options?.householdId ?? data.householdId ?? null,
    analysisId: options?.analysisId ?? null,
  });

  return {
    meta,
    subjectContext,
    personalSections: {
      rawBlocks: [html],
    },
  };
}
