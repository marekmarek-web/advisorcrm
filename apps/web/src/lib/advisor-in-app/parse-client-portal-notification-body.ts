/** Payload uložený v advisor_notifications.body pro typ client_portal_request. */
export function parseClientPortalNotificationBody(body: string | null): {
  caseType: string;
  caseTypeLabel: string;
  preview: string;
} {
  if (!body?.trim()) {
    return { caseType: "jiné", caseTypeLabel: "", preview: "" };
  }
  try {
    const j = JSON.parse(body) as { caseType?: string; caseTypeLabel?: string; preview?: string };
    if (typeof j.caseType === "string" && typeof j.caseTypeLabel === "string") {
      return {
        caseType: j.caseType,
        caseTypeLabel: j.caseTypeLabel,
        preview: typeof j.preview === "string" ? j.preview : "",
      };
    }
  } catch {
    /* plain text fallback */
  }
  return { caseType: "jiné", caseTypeLabel: "", preview: body };
}
