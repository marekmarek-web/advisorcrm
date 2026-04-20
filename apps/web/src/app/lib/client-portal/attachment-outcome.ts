import type { ClientPortalAttachmentOutcome } from "@/app/actions/client-portal-requests";

/**
 * Převede výsledky příloh z {@link persistClientPortalRequestFiles} na uživatelskou zprávu.
 *
 * Historicky se neúspěchy (limit 10 MB, špatný formát, selhání uploadu) tiše zahazovaly
 * a klient měl pocit, že je požadavek i s přílohami zaevidovaný. Vracíme explicitní zprávu,
 * aby UI mohlo uživatele upozornit, že musí přílohu poslat znovu jinou cestou.
 */
export function summarizeAttachmentOutcomes(
  outcomes?: ClientPortalAttachmentOutcome[],
): { warning: string | null } {
  if (!outcomes || outcomes.length === 0) return { warning: null };
  const failed = outcomes.filter((o) => o.status !== "uploaded");
  if (failed.length === 0) return { warning: null };
  const reasons = failed.map((f) => {
    const prefix = f.fileName || "Soubor";
    switch (f.status) {
      case "too_large":
        return `${prefix}: příliš velký (max 10 MB)`;
      case "bad_type":
        return `${prefix}: nepodporovaný formát (PDF, JPEG, PNG, WebP)`;
      case "upload_failed":
        return `${prefix}: nahrání do úložiště selhalo`;
      case "db_failed":
        return `${prefix}: zápis do databáze selhal`;
      default:
        return `${prefix}: neznámá chyba`;
    }
  });
  return {
    warning: `Požadavek byl vytvořen, ale ${failed.length === outcomes.length ? "všechny přílohy" : `${failed.length} z ${outcomes.length} příloh`} se nepodařilo uložit:\n- ${reasons.join("\n- ")}`,
  };
}
