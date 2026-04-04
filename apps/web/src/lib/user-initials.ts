/**
 * Iniciály pro avatar v portálu: preferuje křestní jméno + příjmení, jinak e-mail (lokální část).
 */

export function displayNameFromUserMetadata(meta: Record<string, unknown> | null | undefined): string | null {
  if (!meta || typeof meta !== "object") return null;
  const full = meta.full_name ?? meta.name;
  if (typeof full === "string" && full.trim()) return full.trim();
  const first = meta.first_name;
  const last = meta.last_name;
  const a = typeof first === "string" ? first.trim() : "";
  const b = typeof last === "string" ? last.trim() : "";
  const joined = [a, b].filter(Boolean).join(" ");
  return joined || null;
}

function initialsFromEmail(email: string | undefined): string {
  if (!email) return "?";
  const part = email.split("@")[0] ?? "";
  const segments = part.split(/[._-]/);
  if (segments.length >= 2 && segments[0]?.[0] && segments[1]?.[0]) {
    return (segments[0][0] + segments[1][0]).toUpperCase().slice(0, 2);
  }
  const two = part.slice(0, 2).toUpperCase();
  return two || "?";
}

function initialsFromFullName(fullName: string | undefined | null): string | null {
  const t = fullName?.trim();
  if (!t) return null;
  const parts = t.split(/\s+/).filter(Boolean);
  if (parts.length >= 2) {
    const first = parts[0]?.[0];
    const last = parts[parts.length - 1]?.[0];
    if (first && last) return (first + last).toUpperCase();
  }
  if (parts.length === 1) {
    const w = parts[0];
    if (w.length >= 2) return w.slice(0, 2).toUpperCase();
    if (w.length === 1) return w.toUpperCase();
  }
  return null;
}

export function getUserMenuInitials(opts: { displayName?: string | null; email?: string | null }): string {
  const fromName = initialsFromFullName(opts.displayName ?? undefined);
  if (fromName) return fromName;
  return initialsFromEmail(opts.email ?? undefined);
}
