export function escapeHtmlText(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Plain text s odstavci oddělenými \\n\\n → <p>…</p> */
export function plainTextToParagraphHtml(text: string): string {
  const parts = text
    .replace(/\r\n/g, "\n")
    .split(/\n\n+/)
    .map((p) => p.trim())
    .filter(Boolean);
  return parts.map((p) => `<p style="margin:0 0 14px;line-height:1.55;font-size:15px;color:#1e293b;">${escapeHtmlText(p).replace(/\n/g, "<br/>")}</p>`).join("");
}

export function truncatePreheader(text: string, max = 140): string {
  const t = text.replace(/\s+/g, " ").trim();
  if (t.length <= max) return t;
  return `${t.slice(0, max - 1)}…`;
}
