/**
 * Maps server action / DB errors to user-visible Czech messages in the advisor portal.
 */
export function humanizeAdvisorActionError(error: unknown, fallback: string): string {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  const m = raw.trim();
  if (!m) return fallback;
  if (m === "Forbidden" || /^forbidden$/i.test(m) || m.includes("403")) {
    return "Nemáte oprávnění k této akci. Požádejte správce o přístup.";
  }
  if (/42703|column .* does not exist|undefined_column/i.test(m)) {
    return "Databáze není v souladu s aplikací. Spusťte migrace nebo kontaktujte správce.";
  }
  if (/relation .* does not exist|42P01/i.test(m)) {
    return "V databázi chybí potřebná tabulka. Spusťte migrace nebo kontaktujte správce.";
  }
  return m;
}
