/**
 * Jednoduchý HTML náhled dopisu (escaping + zachování odstavců).
 */

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/** Převede prostý text na HTML s odstavci podle prázdných řádků. */
export function plainTextToLetterHtml(plain: string): string {
  const blocks = plain.split(/\n{2,}/).map((b) => b.trim()).filter(Boolean);
  const inner = blocks.map((b) => `<p>${escapeHtml(b).replace(/\n/g, "<br/>")}</p>`).join("\n");
  return `<div class="termination-letter-html">${inner}</div>`;
}
