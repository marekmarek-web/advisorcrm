/**
 * Pure helpers: safe to import from client and server.
 * Musí odpovídat logice v /api/drive/files/[id]/preview.
 */

export type DrivePreviewKind = "media" | "export_pdf" | "unsupported";

export function getDrivePreviewStrategy(mimeType: string): {
  kind: DrivePreviewKind;
  exportMime?: string;
} {
  if (mimeType === "application/vnd.google-apps.folder") return { kind: "unsupported" };
  if (mimeType === "application/vnd.google-apps.document") {
    return { kind: "export_pdf", exportMime: "application/pdf" };
  }
  if (mimeType === "application/vnd.google-apps.spreadsheet") {
    return { kind: "export_pdf", exportMime: "application/pdf" };
  }
  if (mimeType === "application/vnd.google-apps.presentation") {
    return { kind: "export_pdf", exportMime: "application/pdf" };
  }
  if (mimeType === "application/pdf") return { kind: "media" };
  if (mimeType.startsWith("image/")) return { kind: "media" };
  if (mimeType === "text/plain") return { kind: "media" };
  return { kind: "unsupported" };
}

export function isDrivePreviewSupportedInApp(mimeType: string): boolean {
  return getDrivePreviewStrategy(mimeType).kind !== "unsupported";
}
