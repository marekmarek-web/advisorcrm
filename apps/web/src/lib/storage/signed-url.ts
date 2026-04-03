type SignedUrlPurpose = "download" | "internal_processing" | "advisor_document_preview";

const EXPIRY_SECONDS: Record<SignedUrlPurpose, number> = {
  download: 90,
  internal_processing: 900,
  /** Dlouhá platnost pro iframe náhled v AI Review (poradce drží stránku otevřenou). */
  advisor_document_preview: 3600,
};

export async function createSignedStorageUrl(params: {
  adminClient: {
    storage: {
      from: (bucket: string) => {
        createSignedUrl: (
          path: string,
          expiresIn: number
        ) => Promise<{ data: { signedUrl?: string | null } | null; error: { message?: string } | null }>;
      };
    };
  };
  bucket: string;
  path: string;
  purpose: SignedUrlPurpose;
}) {
  const expiry = EXPIRY_SECONDS[params.purpose];
  const { data, error } = await params.adminClient.storage.from(params.bucket).createSignedUrl(params.path, expiry);
  return {
    signedUrl: data?.signedUrl ?? null,
    error,
    expiresIn: expiry,
  };
}
