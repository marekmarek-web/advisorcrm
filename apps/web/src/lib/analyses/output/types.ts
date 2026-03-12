/**
 * Normalized output/report model for analysis reports.
 * Shared by personal FA, company FA, and combined outputs.
 */

export type ExportMode = "personal_only" | "business_only" | "combined";

export type ReportType = "personal" | "company" | "combined";

export interface ReportMeta {
  id?: string;
  type: ReportType;
  exportMode: ExportMode;
  generatedAt: string;
  generatedBy?: string;
  title?: string;
  contactId?: string | null;
  householdId?: string | null;
  companyId?: string | null;
  analysisId?: string | null;
  /** For combined: personal and company analysis ids */
  personalAnalysisId?: string | null;
  companyAnalysisId?: string | null;
}

export interface SubjectContext {
  /** Display label for the main subject (e.g. client name, company name) */
  subjectLabel: string;
  /** For personal: client/contact id; for company: company id */
  subjectId?: string | null;
  /** Secondary context (e.g. "Jednatel: Jan Novák", "Domácnost XY") */
  secondaryLabel?: string;
  /** Links between subjects (e.g. "Klient X, jednatel ve firmě Y") */
  linksDescription?: string;
}

/** Personal report sections – structure for personal FA content. */
export interface PersonalSections {
  overview?: { html?: string; summary?: string };
  cashflow?: { html?: string; summary?: string };
  assets?: { html?: string; summary?: string };
  liabilities?: { html?: string; summary?: string };
  goals?: { html?: string; summary?: string };
  strategy?: { html?: string; summary?: string };
  insurance?: { html?: string; summary?: string };
  /** Raw HTML blocks if not yet split into structured sections */
  rawBlocks?: string[];
}

/** Business report sections – structure for company FA content. */
export interface BusinessSections {
  company?: { html?: string; summary?: string };
  directors?: { html?: string; summary?: string };
  finance?: { html?: string; summary?: string };
  benefits?: { html?: string; summary?: string };
  risks?: { html?: string; summary?: string };
  directorInsurance?: { html?: string; summary?: string };
  investments?: { html?: string; summary?: string };
  recommendations?: { html?: string; summary?: string };
  rawBlocks?: string[];
}

/** Shared sections (e.g. client–company links, combined recommendations). */
export interface SharedSections {
  links?: { html?: string; summary?: string };
  combinedRecommendations?: { html?: string; summary?: string };
  rawBlocks?: string[];
}

export interface RecommendationItem {
  text: string;
  priority?: number;
  type?: string;
}

export interface ExportOptions {
  format?: "html" | "pdf";
  language?: string;
}

export interface NormalizedReportPayload {
  meta: ReportMeta;
  subjectContext: SubjectContext;
  personalSections?: PersonalSections;
  businessSections?: BusinessSections;
  sharedSections?: SharedSections;
  recommendations?: RecommendationItem[];
  exportOptions?: ExportOptions;
}
