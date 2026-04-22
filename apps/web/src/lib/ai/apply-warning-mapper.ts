/**
 * apply-warning-mapper — pure mapping layer between the server-side
 * `documentLinkWarning` payload field emitted by `apply-contract-review.ts`
 * and the UI-facing warning toast shape `{code, message}` returned from
 * the `applyContractReviewDrafts` server action.
 *
 * Kept pure and file-local so it can be unit-tested without mocking
 * "use server" boundaries, and so future warning codes have ONE
 * canonical place to update Czech copy.
 */

export type ApplyWarning = {
  code: string;
  message: string;
};

/**
 * Known document-link warning codes. Must stay in sync with apply-contract-review.ts
 * and write-through-contract.ts emitters. New codes should be added here with an
 * explicit Czech advisor-facing message.
 */
export const DOCUMENT_LINK_WARNING_CODES = [
  "attach_only_missing_contact",
  "attach_only_missing_storage_path",
  "attach_only_link_not_persisted",
  "document_link_failed",
  "document_link_exception",
] as const;

export type DocumentLinkWarningCode = (typeof DOCUMENT_LINK_WARNING_CODES)[number];

/**
 * Maps a `documentLinkWarning` code persisted in the apply payload to a
 * user-facing toast warning. Returns null when no warning is present.
 *
 * Unknown codes fall through to the generic document-link message so the
 * advisor still sees a visible warning instead of a silent success.
 */
export function mapDocumentLinkWarningToApplyWarning(
  warningCode: string | null | undefined
): ApplyWarning | null {
  if (!warningCode) return null;

  if (warningCode === "attach_only_missing_contact") {
    return {
      code: warningCode,
      message:
        "Apply proběhl, ale dokument nebyl navázán na žádného klienta. Přiřaďte klienta a spusťte napojení znovu.",
    };
  }
  if (warningCode === "attach_only_missing_storage_path") {
    return {
      code: warningCode,
      message:
        "Apply proběhl, ale dokument nemá uložený zdrojový soubor. Nahrajte dokument znovu.",
    };
  }
  if (warningCode === "attach_only_link_not_persisted") {
    return {
      code: warningCode,
      message:
        "Apply proběhl, ale napojení dokumentu ke klientovi selhalo. Zkuste akci opakovat, případně kontaktujte support.",
    };
  }

  // Pre-existing pathway (document_link_failed / document_link_exception) — keep
  // showing toast so the warning isn't hidden in the amber badge only.
  return {
    code: warningCode,
    message:
      "Apply proběhl, ale napojení dokumentu se nepodařilo dokončit. Zkontrolujte detail klienta.",
  };
}
