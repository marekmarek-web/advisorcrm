/**
 * Build normalized report payload for combined (personal + company) output.
 */

import type { FinancialAnalysisData } from "@/lib/analyses/financial/types";
import type { CompanyFaPayload } from "@/lib/analyses/company-fa/types";
import { buildPersonalReportPayload } from "./buildPersonalReportPayload";
import { buildBusinessReportPayload } from "./buildBusinessReportPayload";
import type { NormalizedReportPayload, SubjectContext } from "./types";
import { normalizeReportMeta } from "./normalizeReportMeta";

export type ReportProvenance = Record<string, "linked" | "overridden">;

export interface BuildCombinedReportPayloadOptions {
  contactId?: string | null;
  householdId?: string | null;
  companyId?: string | null;
  personalAnalysisId?: string | null;
  companyAnalysisId?: string | null;
  generatedBy?: string;
  title?: string;
  /** Optional description of link (e.g. "Klient X, jednatel ve firmě Y") */
  linksDescription?: string;
  /** Phase 7: which personal paths are linked/overridden (for report labels). */
  provenance?: ReportProvenance;
  /** Phase 7: name of linked company (for "Příjem z firmy X (sdílený údaj)"). */
  linkedCompanyName?: string | null;
}

export function buildCombinedReportPayload(
  personalData: FinancialAnalysisData | null,
  companyData: CompanyFaPayload | null,
  options?: BuildCombinedReportPayloadOptions
): NormalizedReportPayload {
  const personalPayload = personalData
    ? buildPersonalReportPayload(personalData, {
        contactId: options?.contactId,
        householdId: options?.householdId,
        analysisId: options?.personalAnalysisId ?? undefined,
        generatedBy: options?.generatedBy,
        provenance: options?.provenance,
        linkedCompanyName: options?.linkedCompanyName,
      })
    : null;
  const businessPayload = companyData
    ? buildBusinessReportPayload(companyData, {
        companyId: options?.companyId,
        analysisId: options?.companyAnalysisId ?? undefined,
        generatedBy: options?.generatedBy,
      })
    : null;

  const subjectContext: SubjectContext = {
    subjectLabel: personalPayload?.subjectContext.subjectLabel ?? businessPayload?.subjectContext.subjectLabel ?? "Kombinovaný výstup",
    subjectId: options?.contactId ?? options?.companyId ?? undefined,
    secondaryLabel:
      [personalPayload?.subjectContext.subjectLabel, businessPayload?.subjectContext.subjectLabel]
        .filter(Boolean)
        .join(" · ") || undefined,
    linksDescription: options?.linksDescription,
  };

  const meta = normalizeReportMeta({
    type: "combined",
    exportMode: "combined",
    generatedBy: options?.generatedBy,
    title: options?.title ?? "Kombinovaný finanční plán",
    contactId: options?.contactId ?? null,
    householdId: options?.householdId ?? null,
    companyId: options?.companyId ?? null,
    personalAnalysisId: options?.personalAnalysisId ?? null,
    companyAnalysisId: options?.companyAnalysisId ?? null,
  });

  const personalSections = personalPayload?.personalSections;
  const businessSections = businessPayload?.businessSections;

  const linksSummary =
    options?.linksDescription ||
    (options?.provenance && Object.keys(options.provenance).length > 0 && options?.linkedCompanyName
      ? `Příjmy a závazky z propojené firmy ${options.linkedCompanyName} (sdílené údaje).`
      : options?.provenance && Object.keys(options.provenance).length > 0
        ? "Příjmy a závazky z propojené firmy (sdílené údaje)."
        : undefined);

  return {
    meta,
    subjectContext,
    personalSections: personalSections ?? undefined,
    businessSections: businessSections ?? undefined,
    sharedSections: linksSummary
      ? { links: { summary: linksSummary } }
      : undefined,
  };
}
