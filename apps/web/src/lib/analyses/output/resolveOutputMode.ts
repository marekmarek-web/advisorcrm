/**
 * Determine export mode from context (what analyses are available, user choice).
 */

import type { ExportMode } from "./types";

export interface ResolveOutputModeContext {
  hasPersonalData: boolean;
  hasCompanyData: boolean;
  /** User requested combined output when both are available */
  requestCombined?: boolean;
}

/**
 * Returns personal_only if only personal, business_only if only company,
 * combined if both and requestCombined (or default when both available).
 */
export function resolveOutputMode(context: ResolveOutputModeContext): ExportMode {
  const { hasPersonalData, hasCompanyData, requestCombined } = context;
  if (hasPersonalData && !hasCompanyData) return "personal_only";
  if (hasCompanyData && !hasPersonalData) return "business_only";
  if (hasPersonalData && hasCompanyData) {
    return requestCombined !== false ? "combined" : "personal_only";
  }
  return "personal_only";
}
