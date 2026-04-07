/**
 * Volitelná pole uložená v `termination_requests.document_builder_extras` (JSON).
 */

export type TerminationPolicyholderKind = "person" | "company";

export type TerminationDocumentBuilderExtras = {
  policyholderKind?: TerminationPolicyholderKind;
  companyName?: string;
  authorizedPersonName?: string;
  authorizedPersonRole?: string;
  advisorNoteForReview?: string;
  /** ISO datum – pojistná událost / oznámení (šablona 3.5). */
  claimEventDate?: string;
  /** Přepíše výchozí „místo“ v záhlaví dopisu. */
  placeOverride?: string;
};

export function parseDocumentBuilderExtras(raw: unknown): TerminationDocumentBuilderExtras {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) {
    return {};
  }
  const o = raw as Record<string, unknown>;
  const out: TerminationDocumentBuilderExtras = {};
  if (o.policyholderKind === "company") out.policyholderKind = "company";
  else if (o.policyholderKind === "person") out.policyholderKind = "person";
  if (typeof o.companyName === "string") out.companyName = o.companyName;
  if (typeof o.authorizedPersonName === "string") out.authorizedPersonName = o.authorizedPersonName;
  if (typeof o.authorizedPersonRole === "string") out.authorizedPersonRole = o.authorizedPersonRole;
  if (typeof o.advisorNoteForReview === "string") out.advisorNoteForReview = o.advisorNoteForReview;
  if (typeof o.claimEventDate === "string") out.claimEventDate = o.claimEventDate;
  if (typeof o.placeOverride === "string") out.placeOverride = o.placeOverride;
  return out;
}

export function serializeDocumentBuilderExtras(e: TerminationDocumentBuilderExtras): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  if (e.policyholderKind) out.policyholderKind = e.policyholderKind;
  if (e.companyName?.trim()) out.companyName = e.companyName.trim();
  if (e.authorizedPersonName?.trim()) out.authorizedPersonName = e.authorizedPersonName.trim();
  if (e.authorizedPersonRole?.trim()) out.authorizedPersonRole = e.authorizedPersonRole.trim();
  if (e.advisorNoteForReview?.trim()) out.advisorNoteForReview = e.advisorNoteForReview.trim();
  if (e.claimEventDate?.trim()) out.claimEventDate = e.claimEventDate.trim();
  if (e.placeOverride?.trim()) out.placeOverride = e.placeOverride.trim();
  return out;
}
