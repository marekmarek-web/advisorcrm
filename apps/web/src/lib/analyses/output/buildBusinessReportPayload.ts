/**
 * Build normalized report payload for company (business) FA.
 */

import type { CompanyFaPayload } from "@/lib/analyses/company-fa/types";
import { buildCompanyReportHTML } from "./buildCompanyReportHTML";
import type { NormalizedReportPayload, SubjectContext } from "./types";
import { normalizeReportMeta } from "./normalizeReportMeta";

export interface BuildBusinessReportPayloadOptions {
  companyId?: string | null;
  analysisId?: string | null;
  generatedBy?: string;
  title?: string;
}

export function buildBusinessReportPayload(
  data: CompanyFaPayload,
  options?: BuildBusinessReportPayloadOptions
): NormalizedReportPayload {
  const companyName = data.company?.name || "Společnost";
  const directorName =
    data.directors?.length > 0 && data.directors[0]?.name
      ? data.directors[0].name
      : "—";

  const subjectContext: SubjectContext = {
    subjectLabel: companyName,
    subjectId: options?.companyId ?? undefined,
    secondaryLabel: `Jednatel: ${directorName}`,
  };

  const html = buildCompanyReportHTML(data);

  const meta = normalizeReportMeta({
    type: "company",
    exportMode: "business_only",
    generatedBy: options?.generatedBy,
    title: options?.title ?? `Firemní analýza – ${companyName}`,
    companyId: options?.companyId ?? null,
    analysisId: options?.analysisId ?? null,
  });

  return {
    meta,
    subjectContext,
    businessSections: {
      rawBlocks: [html],
    },
  };
}
