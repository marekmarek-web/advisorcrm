import type { FinancialAnalysisData } from '../types';
import type { FaCanonicalInvestmentOverviewRow } from '../fa-canonical-investment-overview';

export type ReportTheme = 'elegant' | 'modern';

export interface ReportBranding {
  advisorName?: string;
  advisorRole?: string;
  companyName?: string;
  logoUrl?: string;
  /** Tel. z profilu poradce — tisk/PDF (sidebar se při tisku skrývá). */
  advisorPhone?: string;
  /** Web z profilu poradce — tisk/PDF. */
  advisorWebsite?: string;
  /** Volitelný kontaktní e-mail v zápatí tisku/PDF. */
  advisorEmail?: string;
}

export interface BuildPremiumReportOptions {
  theme?: ReportTheme;
  branding?: ReportBranding;
  includeCompany?: boolean;
  /** Přehled investic z CRM — stejný kanonický model a FV jako portál. */
  canonicalInvestmentOverview?: FaCanonicalInvestmentOverviewRow[];
}

export interface SectionCtx {
  data: FinancialAnalysisData;
  theme: ReportTheme;
  branding: ReportBranding;
  sectionCounter: { n: number };
  canonicalInvestmentOverview?: FaCanonicalInvestmentOverviewRow[];
}
