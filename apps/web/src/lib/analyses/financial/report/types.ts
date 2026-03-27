import type { FinancialAnalysisData } from '../types';

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
}

export interface BuildPremiumReportOptions {
  theme?: ReportTheme;
  branding?: ReportBranding;
  includeCompany?: boolean;
}

export interface SectionCtx {
  data: FinancialAnalysisData;
  theme: ReportTheme;
  branding: ReportBranding;
  sectionCounter: { n: number };
}
