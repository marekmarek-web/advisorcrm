/**
 * Detect whether uploaded/pasted JSON is business (company) FA or personal FA.
 * Used to route import to the correct shell and persistence.
 */

export type AnalysisJsonType = "company" | "personal" | null;

/**
 * Returns "company" if payload looks like corporate FA (company + directors),
 * "personal" if it looks like personal FA (data with client/cashflow or top-level client),
 * null otherwise.
 */
export function detectAnalysisJsonType(raw: unknown): AnalysisJsonType {
  if (raw == null || typeof raw !== "object") return null;
  const obj = raw as Record<string, unknown>;

  // Business FA: has company (object) and directors (array) or legacy director
  if (obj.company && typeof obj.company === "object") {
    if (Array.isArray(obj.directors) || (obj.director != null && typeof obj.director === "object")) {
      return "company";
    }
  }

  // Personal FA: has data (object) with client/cashflow, or top-level client
  if (obj.data && typeof obj.data === "object") {
    const data = obj.data as Record<string, unknown>;
    if (data.client != null || data.cashflow != null || data.assets != null) return "personal";
  }
  if (obj.client && typeof obj.client === "object") return "personal";

  return null;
}
