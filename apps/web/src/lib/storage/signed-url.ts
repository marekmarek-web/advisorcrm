import { logAuditAction, type AuditMeta, type AuditRequestContext } from "@/lib/audit";

export type SignedUrlPurpose = "download" | "internal_processing" | "advisor_document_preview";

const EXPIRY_SECONDS: Record<SignedUrlPurpose, number> = {
  download: 90,
  internal_processing: 900,
  /** Dlouhá platnost pro iframe náhled v AI Review (poradce drží stránku otevřenou). */
  advisor_document_preview: 3600,
};

type SupabaseAdminLike = {
  storage: {
    from: (bucket: string) => {
      createSignedUrl: (
        path: string,
        expiresIn: number
      ) => Promise<{ data: { signedUrl?: string | null } | null; error: { message?: string } | null }>;
    };
  };
};

/**
 * Volitelný audit kontext pro generování signed URL.
 * Když je dodaný, zaloguje se řádek `audit_log` typu `signed_url.generated`.
 * Užitečné pro user-facing cesty (download dokumentu, příloha zprávy).
 * Interní processing calls (Adobe, AI orchestrator) nemusí logovat — mají
 * vlastní job tracking.
 */
export type SignedUrlAuditContext = {
  tenantId: string;
  userId: string;
  entityType?: string;
  entityId?: string;
  meta?: AuditMeta;
  request?: Request;
  requestContext?: AuditRequestContext;
};

export async function createSignedStorageUrl(params: {
  adminClient: SupabaseAdminLike;
  bucket: string;
  path: string;
  purpose: SignedUrlPurpose;
  audit?: SignedUrlAuditContext;
}) {
  const expiry = EXPIRY_SECONDS[params.purpose];
  const { data, error } = await params.adminClient.storage.from(params.bucket).createSignedUrl(params.path, expiry);

  if (params.audit && data?.signedUrl) {
    try {
      logAuditAction({
        tenantId: params.audit.tenantId,
        userId: params.audit.userId,
        action: "signed_url.generated",
        entityType: params.audit.entityType,
        entityId: params.audit.entityId,
        meta: {
          ...(params.audit.meta ?? {}),
          bucket: params.bucket,
          purpose: params.purpose,
          expiresIn: expiry,
          pathHash: hashPath(params.path),
        },
      });
    } catch {
      // audit selhání nesmí blokovat download flow
    }
  }

  return {
    signedUrl: data?.signedUrl ?? null,
    error,
    expiresIn: expiry,
  };
}

/**
 * Pro audit neposíláme plnou cestu (může obsahovat citlivé segmenty),
 * ale stabilní krátký hash — pro dohledatelnost mezi řádky, ne pro
 * rekonstrukci.
 */
function hashPath(path: string): string {
  let h = 0;
  for (let i = 0; i < path.length; i++) {
    h = (h * 31 + path.charCodeAt(i)) >>> 0;
  }
  return h.toString(16);
}
