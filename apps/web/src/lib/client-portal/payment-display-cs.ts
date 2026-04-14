/**
 * České zobrazení platebních metadat v klientském portálu (obecná pravidla, ne závislost na konkrétním PDF).
 */

export function formatPaymentFrequencyCs(freq: string | null | undefined): string | null {
  if (!freq?.trim()) return null;
  const raw = freq.trim();
  const f = raw.toLowerCase().replace(/\s+/g, " ");

  if (f === "monthly" || f.includes("měsíč") || f.includes("mesic")) return "Měsíčně";
  if (f === "yearly" || f === "annual" || f.includes("ročn") || f.includes("rocn")) return "Ročně";
  if (f === "quarterly" || f.includes("čtvrt") || f.includes("ctvrt")) return "Čtvrtletně";
  if (f === "weekly" || f.includes("týdn") || f.includes("tydn")) return "Týdně";
  if (f === "single" || f.includes("jednoráz") || f.includes("jednoraz")) return "Jednorázově";

  return raw;
}
