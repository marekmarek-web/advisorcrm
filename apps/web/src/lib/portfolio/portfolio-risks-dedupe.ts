/**
 * Jednotná deduplikace řádků pojistných rizik pro portfolio (ŽP).
 * Stejné krytí se často objeví ve více zdrojích extrakce (insuredRisks / riders / coverages)
 * nebo s drobnými rozdíly v personRef — v přehledech pro klienta i poradce má být řádek jen jednou.
 */

import type { PortfolioRiskEntry } from "db";

const UNICODE_SPACE_RE = /[\u00A0\u1680\u2000-\u200A\u202F\u205F\u3000]/g;

/**
 * Sjednocení textu rizika pro porovnání — stejné krytí často přichází 2× z extrakce
 * s odlišnou typografií (mezery v číslech, NBSP, NFC vs NFD, čárka jako desetinný oddělovač v textu).
 */
function collapseSpacesBetweenDigits(s: string): string {
  let out = s;
  let prev: string;
  do {
    prev = out;
    out = out.replace(/(\d)\s+(?=\d)/g, "$1");
  } while (out !== prev);
  return out;
}

export function normalizeRiskLabel(label: string): string {
  let s = label.normalize("NFC");
  s = s.replace(UNICODE_SPACE_RE, " ");
  s = s.replace(/(\d),(\d)(?!\d)/g, "$1.$2");
  s = collapseSpacesBetweenDigits(s);
  s = s.replace(/\s+/g, " ").trim().toLowerCase();
  return s;
}

export function normalizeRiskAmount(amount: string | number | undefined | null): string {
  if (amount == null || amount === "") return "";
  if (typeof amount === "number" && Number.isFinite(amount)) {
    return String(Math.round(amount));
  }
  let s = String(amount).normalize("NFC").trim();
  s = s.replace(UNICODE_SPACE_RE, "");
  s = collapseSpacesBetweenDigits(s);
  const n = parseFloat(s.replace(/[^\d.-]/g, ""));
  return Number.isFinite(n) ? String(Math.round(n)) : s.toLowerCase();
}

/** Klíč pro sloučení duplicit stejného krytí (bez personRef — ten nesmí rozbíjet merge). */
export function portfolioRiskDedupKey(r: Pick<PortfolioRiskEntry, "label" | "amount">): string {
  return `${normalizeRiskLabel(r.label ?? "")}|${normalizeRiskAmount(r.amount)}`;
}

export function dedupePortfolioRisks(entries: PortfolioRiskEntry[]): PortfolioRiskEntry[] {
  const seen = new Set<string>();
  const out: PortfolioRiskEntry[] = [];
  for (const r of entries) {
    if (!r || typeof r.label !== "string" || !r.label.trim()) continue;
    const k = portfolioRiskDedupKey(r);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(r);
  }
  return out;
}
