/**
 * Local date formatting for calendar (avoids UTC shift).
 * Use everywhere we compare "today" or build date keys (YYYY-MM-DD).
 */
export function formatDateLocal(d: Date): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}
