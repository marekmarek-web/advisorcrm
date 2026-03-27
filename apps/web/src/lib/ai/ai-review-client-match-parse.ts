export type AiReviewClientMatchKind = "exact_match" | "likely_match" | "ambiguous" | "no_match";

/**
 * Best-effort parse of client-match LLM JSON (no strict schema; used only for guardrails).
 */
export function parseAiReviewClientMatchKind(raw: string | null | undefined): AiReviewClientMatchKind | null {
  if (!raw?.trim()) return null;
  const t = raw.trim();
  const tryParse = (s: string): unknown => {
    try {
      const m = s.match(/\{[\s\S]*\}/);
      return JSON.parse(m ? m[0] : s) as unknown;
    } catch {
      return null;
    }
  };
  const obj = tryParse(t) as Record<string, unknown> | null;
  if (!obj || typeof obj !== "object") {
    const low = t.toLowerCase();
    if (low.includes("ambiguous")) return "ambiguous";
    if (low.includes("no_match") || low.includes("no match")) return "no_match";
    if (low.includes("exact_match") || low.includes("exact match")) return "exact_match";
    if (low.includes("likely_match") || low.includes("likely match")) return "likely_match";
    return null;
  }
  const k =
    (typeof obj.matchKind === "string" && obj.matchKind) ||
    (typeof obj.match_kind === "string" && obj.match_kind) ||
    (typeof obj.kind === "string" && obj.kind) ||
    (typeof obj.clientMatch === "string" && obj.clientMatch) ||
    "";
  const n = k.trim().toLowerCase().replace(/\s+/g, "_");
  if (n === "exact_match" || n === "exact") return "exact_match";
  if (n === "likely_match" || n === "likely") return "likely_match";
  if (n === "ambiguous" || n === "uncertain") return "ambiguous";
  if (n === "no_match" || n === "none" || n === "nomatch") return "no_match";
  return null;
}
