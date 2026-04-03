export type { CalculatorPdfRow, CalculatorPdfSection } from "./types";
export { buildCalculatorReportHTML } from "./buildCalculatorReportHTML";
export type { BuildCalculatorReportHTMLOptions } from "./buildCalculatorReportHTML";
export {
  buildCalculatorExportFilename,
  CALCULATOR_PDF_DISCLAIMER_LINES,
  formatCurrencyCs,
  formatPercentCs,
} from "./format";
export { buildMortgagePdfSections, type MortgageRatesMeta } from "./mortgagePdfSections";
export { buildInvestmentPdfSections } from "./investmentPdfSections";
export { buildLifePdfSections } from "./lifePdfSections";
export { buildPensionPdfSections } from "./pensionPdfSections";
export { buildClientHypoPdfSections, buildClientInvestPdfSections } from "./clientCalculatorsPdfSections";
