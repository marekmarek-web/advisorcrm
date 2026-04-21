/**
 * Deduplikace dokumentů podle `document_fingerprint` (SHA-256 obsahu).
 *
 * Scope: `(tenantId, contactId, fingerprint)`. Pokud `contactId` chybí,
 * porovnává se s řádky, které také nemají `contactId` (tenant-wide šuplík
 * „misc“). Tím zabráníme falešným kolizím napříč klienty.
 *
 * Záměrně pracujeme s živými dokumenty (`archivedAt IS NULL`) — archivovaný
 * sken lze znovu nahrát bez blokace.
 */

import { documents, and, eq, isNull } from "db";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { computeDocumentFingerprint } from "@/lib/documents/processing/fingerprint";

export type DedupMatch = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
  processingStatus: string | null;
  storagePath: string;
};

type FindArgs = {
  tenantId: string;
  userId: string;
  contactId: string | null;
  fingerprint: string;
};

export async function findExistingDocumentByFingerprint({
  tenantId,
  userId,
  contactId,
  fingerprint,
}: FindArgs): Promise<DedupMatch | null> {
  return withTenantContextFromAuth({ tenantId, userId }, async (tx) => {
    const contactFilter = contactId
      ? eq(documents.contactId, contactId)
      : isNull(documents.contactId);

    const rows = await tx
      .select({
        id: documents.id,
        name: documents.name,
        mimeType: documents.mimeType,
        sizeBytes: documents.sizeBytes,
        processingStatus: documents.processingStatus,
        storagePath: documents.storagePath,
      })
      .from(documents)
      .where(
        and(
          eq(documents.tenantId, tenantId),
          eq(documents.documentFingerprint, fingerprint),
          contactFilter,
          isNull(documents.archivedAt),
        ),
      )
      .limit(1);

    return rows[0] ?? null;
  });
}

/** Convenience: spočítá fingerprint a rovnou zavolá find. */
export async function findDuplicateForBytes(args: {
  tenantId: string;
  userId: string;
  contactId: string | null;
  bytes: Uint8Array;
}): Promise<{ fingerprint: string | null; match: DedupMatch | null }> {
  let fingerprint: string | null = null;
  try {
    fingerprint = await computeDocumentFingerprint(args.bytes);
  } catch {
    return { fingerprint: null, match: null };
  }
  const match = await findExistingDocumentByFingerprint({
    tenantId: args.tenantId,
    userId: args.userId,
    contactId: args.contactId,
    fingerprint,
  }).catch(() => null);
  return { fingerprint, match };
}
