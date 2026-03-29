import type { ZodIssue } from "zod";

/**
 * Maps Zod issues to short Czech sentences for advisor-facing UI (no raw Zod paths in user copy).
 */
export function zodIssuesToAdvisorBriefMessages(issues: ZodIssue[], max = 8): string[] {
  const out: string[] = [];
  for (const issue of issues.slice(0, max)) {
    const path = issue.path
      .map((p) => (typeof p === "number" ? `[${p}]` : String(p)))
      .filter(Boolean)
      .join(".");
    let msg = (issue.message || "").trim();
    if (/invalid enum value/i.test(msg)) {
      msg = "Hodnota neodpovídá očekávanému výčtu — zkontrolujte pole vůči šabloně typu dokumentu.";
    } else if (/required/i.test(msg) && path) {
      msg = `Chybí povinná část struktury (${path}).`;
    } else if (/expected/i.test(msg) && path) {
      msg = `Neplatný formát údaje u „${path}“.`;
    } else if (path) {
      msg = `Problém u „${path}“: ${msg || "ověřte údaje ručně."}`;
    } else if (!msg) {
      msg = "Struktura odpovědi neodpovídá očekávání — ověřte extrakci ručně.";
    }
    out.push(msg);
  }
  if (issues.length > max) {
    out.push(`Další nesrovnalosti: ${issues.length - max} (kompletní log pro technickou podporu).`);
  }
  return out;
}
