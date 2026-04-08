/**
 * Volitelná pole uložená v `termination_requests.document_builder_extras` (JSON).
 */

/** Zástupný text v DB u rozepsaného konceptu bez názvu pojišťovny (dokončení ho odmítne). */
export const TERMINATION_PARTIAL_INSURER_PLACEHOLDER = "— (koncept, doplňte pojišťovnu)";

export type TerminationPolicyholderKind = "person" | "company";

export type TerminationDocumentBuilderExtras = {
  policyholderKind?: TerminationPolicyholderKind;
  companyName?: string;
  authorizedPersonName?: string;
  authorizedPersonRole?: string;
  advisorNoteForReview?: string;
  /** ISO datum – pojistná událost / oznámení (šablona 3.5). */
  claimEventDate?: string;
  /** Přepíše výchozí „místo" v záhlaví dopisu. */
  placeOverride?: string;
  /** Uloženo u rozepsaného konceptu (wizard). */
  uncertainInsurer?: boolean;
  /** Volný text příloh zadaný poradcem ve wizardu (doplní odstavec v dopise). */
  attachmentsDeclared?: string;
  /**
   * Uložený text hlavního dopisu z wizardu (úpravy poradce). Když je neprázdný, tělo od „Věc:" dál bere z draftu;
   * hlavička (místo/datum, pojistník, pojišťovna) se znovu skládá z aktuálních dat (kromě režimu oficiálního formuláře).
   */
  letterPlainTextDraft?: string;
  /** ISO yyyy-mm-dd – datum v řádku „Místo, dne …"; prázdné = dnešní datum při generování. */
  letterHeaderDateIso?: string;
  /**
   * Přepíše ulici + číslo pojistníka v adresním bloku dopisu, pokud kontakt v CRM chybí nebo má jinou adresu.
   * Typicky předvyplněno z AI extrakce, poradce může upravit.
   */
  policyholderAddressLine1Override?: string;
  /** Přepíše druhý řádek adresy pojistníka (PSČ + město). Prázdné = z kontaktu. */
  policyholderAddressLine2Override?: string;
  /** Navržený segment pojišťovacího produktu z AI extrakce (poradce potvrdí nebo přepíše). */
  extractedSegmentCandidate?: string;
  /** Jméno pojistníka z dokumentu (záloha pro dopis bez CRM kontaktu). */
  extractedPolicyholderName?: string;
  /** Typ produktu z dokumentu (volný text před klasifikací). */
  extractedProductTypeRaw?: string;
  /** ISO datetime – kdy poradce potvrdil správnost výstupu před exportem (přidáno za GDPR / audit). */
  advisorConfirmedAt?: string;
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
  if (o.uncertainInsurer === true) out.uncertainInsurer = true;
  if (typeof o.attachmentsDeclared === "string") out.attachmentsDeclared = o.attachmentsDeclared;
  if (typeof o.letterPlainTextDraft === "string") out.letterPlainTextDraft = o.letterPlainTextDraft;
  if (typeof o.letterHeaderDateIso === "string") out.letterHeaderDateIso = o.letterHeaderDateIso;
  if (typeof o.policyholderAddressLine1Override === "string") out.policyholderAddressLine1Override = o.policyholderAddressLine1Override;
  if (typeof o.policyholderAddressLine2Override === "string") out.policyholderAddressLine2Override = o.policyholderAddressLine2Override;
  if (typeof o.extractedSegmentCandidate === "string") out.extractedSegmentCandidate = o.extractedSegmentCandidate;
  if (typeof o.extractedPolicyholderName === "string") out.extractedPolicyholderName = o.extractedPolicyholderName;
  if (typeof o.extractedProductTypeRaw === "string") out.extractedProductTypeRaw = o.extractedProductTypeRaw;
  if (typeof o.advisorConfirmedAt === "string") out.advisorConfirmedAt = o.advisorConfirmedAt;
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
  if (e.uncertainInsurer) out.uncertainInsurer = true;
  if (e.attachmentsDeclared?.trim()) out.attachmentsDeclared = e.attachmentsDeclared.trim();
  if (e.letterPlainTextDraft?.trim()) out.letterPlainTextDraft = e.letterPlainTextDraft.trim();
  if (e.letterHeaderDateIso?.trim()) out.letterHeaderDateIso = e.letterHeaderDateIso.trim();
  if (e.policyholderAddressLine1Override?.trim()) out.policyholderAddressLine1Override = e.policyholderAddressLine1Override.trim();
  if (e.policyholderAddressLine2Override?.trim()) out.policyholderAddressLine2Override = e.policyholderAddressLine2Override.trim();
  if (e.extractedSegmentCandidate?.trim()) out.extractedSegmentCandidate = e.extractedSegmentCandidate.trim();
  if (e.extractedPolicyholderName?.trim()) out.extractedPolicyholderName = e.extractedPolicyholderName.trim();
  if (e.extractedProductTypeRaw?.trim()) out.extractedProductTypeRaw = e.extractedProductTypeRaw.trim();
  if (e.advisorConfirmedAt?.trim()) out.advisorConfirmedAt = e.advisorConfirmedAt.trim();
  return out;
}
