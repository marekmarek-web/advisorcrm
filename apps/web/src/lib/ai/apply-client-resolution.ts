import type { ContractReviewRow } from "./review-queue-repository";

/**
 * Resolve which CRM contact apply should bind to **before** create-new fallback.
 *
 * Rules (product, not PDF-specific):
 * - Prefer human overrides and explicit `matchedClientId`.
 * - `matchVerdict` is read from the persisted DB column first, then `extractionTrace` (legacy paths).
 * - When verdict is `existing_match` or `near_match`, use `autoResolvedClientId` from the pipeline trace,
 *   then the top scored candidate — even if the UI still has `createNewClientConfirmed` set (prevents ghost dupe clients).
 */
export function resolveApplyClientContactId(row: ContractReviewRow): {
  contactId: string | null;
  matchVerdict: string | null;
} {
  const trace = row.extractionTrace as Record<string, unknown> | null | undefined;

  const matchVerdict =
    (typeof row.matchVerdict === "string" && row.matchVerdict.trim() !== ""
      ? row.matchVerdict.trim()
      : null) ??
    (typeof trace?.matchVerdict === "string" ? String(trace.matchVerdict).trim() : null) ??
    null;

  let effectiveContactId: string | null = row.linkedClientOverride ?? row.matchedClientId ?? null;

  const autoResolvedFromTrace =
    typeof trace?.autoResolvedClientId === "string" && trace.autoResolvedClientId.trim() !== ""
      ? trace.autoResolvedClientId.trim()
      : null;

  const rawCandidates = row.clientMatchCandidates as Array<{ clientId?: string }> | null | undefined;
  const topCandidateId =
    Array.isArray(rawCandidates) && rawCandidates.length > 0 ? rawCandidates[0]?.clientId ?? null : null;

  if (!effectiveContactId && (matchVerdict === "existing_match" || matchVerdict === "near_match")) {
    effectiveContactId = autoResolvedFromTrace || topCandidateId;
  }

  return { contactId: effectiveContactId, matchVerdict };
}
