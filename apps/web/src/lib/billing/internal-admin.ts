import "server-only";

/**
 * Internal full-access accounts (not a public pricing tier).
 * Configure via env until a DB/admin UI exists (Phase 2+).
 */

function parseList(raw: string | undefined): string[] {
  if (!raw?.trim()) return [];
  return raw
    .split(/[,;\s]+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Returns true when this auth user matches internal admin allowlists.
 * Env: `AIDV_INTERNAL_ADMIN_EMAILS` (comma-separated), `AIDV_INTERNAL_ADMIN_USER_IDS` (comma-separated).
 */
export function isInternalAdminUser(params: { userId: string; email: string | null | undefined }): boolean {
  const { userId, email } = params;
  const idList = parseList(process.env.AIDV_INTERNAL_ADMIN_USER_IDS);
  if (idList.includes(userId)) return true;
  const em = email ? normalizeEmail(email) : "";
  if (!em) return false;
  const emails = parseList(process.env.AIDV_INTERNAL_ADMIN_EMAILS).map(normalizeEmail);
  return emails.includes(em);
}
