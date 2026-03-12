/**
 * Build import preview for company FA JSON import.
 * Pure formatting; DB lookups (company by ICO, contacts by name) are done in server action.
 */

import type { CompanyFaPayload, CompanyFaImportPreview, DirectorPreviewItem } from "./types";
import type { CompanyPersonRoleType } from "./types";

export interface CompanyFaImportPreviewOptions {
  suggestedCompanyId?: string | null;
  /** For each director index, optional suggested contact id from name match */
  directorContactSuggestions?: { index: number; contactId: string }[];
  existingAnalysisId?: string | null;
  analysisChoice?: "new" | "version";
}

/**
 * Build preview structure for UI. Does not perform DB lookups; caller supplies
 * suggestedCompanyId (from getCompanyByIco) and directorContactSuggestions (from contact search).
 */
export function buildCompanyFaImportPreview(
  normalizedPayload: CompanyFaPayload,
  options: CompanyFaImportPreviewOptions = {}
): CompanyFaImportPreview {
  const { company, directors } = normalizedPayload;
  const suggestionMap = new Map(
    (options.directorContactSuggestions ?? []).map((s) => [s.index, s.contactId])
  );

  const directorsPreview: DirectorPreviewItem[] = directors.map((d, index) => ({
    index,
    name: d.name || `Jednatel ${index + 1}`,
    suggestedContactId: suggestionMap.get(index) ?? null,
    roleType: "director" as CompanyPersonRoleType,
  }));

  const displayName = company.name?.trim() || company.ico?.trim() || "Nová firma";
  const ico = company.ico?.trim() || null;

  return {
    company: {
      name: company.name?.trim() ?? "",
      ico: ico ?? null,
      displayName,
    },
    directorsPreview,
    suggestedCompanyId: options.suggestedCompanyId ?? null,
    createNewCompany: !options.suggestedCompanyId,
    analysisChoice: options.analysisChoice ?? "new",
    existingAnalysisId: options.existingAnalysisId ?? null,
  };
}
