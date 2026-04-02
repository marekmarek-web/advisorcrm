/**
 * Portal notifications for advisor_material_request historically stored JSON in `body`.
 * Prefer human-readable text for display; parse legacy payloads when needed.
 */
export function formatPortalNotificationBody(
  type: string | undefined,
  body: string | null | undefined
): string {
  if (body == null || body === "") return "";
  if (type !== "advisor_material_request") return body;

  const trimmed = body.trim();
  if (!trimmed.startsWith("{")) return body;

  try {
    const parsed = JSON.parse(trimmed) as {
      preview?: unknown;
      title?: unknown;
    };
    const preview =
      typeof parsed.preview === "string" && parsed.preview.trim() !== ""
        ? parsed.preview.trim()
        : "";
    if (preview) return preview;
    const title =
      typeof parsed.title === "string" && parsed.title.trim() !== ""
        ? parsed.title.trim()
        : "";
    if (title) return title;
  } catch {
    /* ignore */
  }
  return body;
}
