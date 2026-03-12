/**
 * Normalized output/report layer for personal, company, and combined FA reports.
 */

export * from "./types";
export { normalizeReportMeta } from "./normalizeReportMeta";
export { buildPersonalReportPayload } from "./buildPersonalReportPayload";
export { buildBusinessReportPayload } from "./buildBusinessReportPayload";
export { buildCombinedReportPayload } from "./buildCombinedReportPayload";
export { resolveOutputMode } from "./resolveOutputMode";
export { renderReportToHTML } from "./renderReportToHTML";
export { composeAnalysisOutput } from "./composeAnalysisOutput";
export { buildCompanyReportHTML } from "./buildCompanyReportHTML";
