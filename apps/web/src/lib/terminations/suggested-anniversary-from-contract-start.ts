/**
 * Termínové utility pro wizard výpovědí.
 *
 * Exporty:
 *  - parseIsoYmd
 *  - suggestedAnniversaryFromContractStart  – nejbližší výroční den od dnešku
 *  - computeTwoMonthDeadline               – limit "do 2 měsíců od sjednání"
 *  - computeSuggestedRequestedDate         – navržené datum účinnosti dle modu
 */

function pad2(n: number): string {
  return n < 10 ? `0${n}` : String(n);
}

export function parseIsoYmd(iso: string): { y: number; m: number; d: number } | null {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso.trim());
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (!y || mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return { y, m: mo, d };
}

function toIsoLocal(d: Date): string {
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
}

/**
 * Vrátí YYYY-MM-DD prvního výročí (MD z počátku) splňujícího `candidate >= today` (local midnight).
 * 29. 2. na nepřestupní rok → 28. 2.
 */
export function suggestedAnniversaryFromContractStart(contractStartIso: string, now: Date = new Date()): string | null {
  const p = parseIsoYmd(contractStartIso);
  if (!p) return null;

  const today = new Date(now);
  today.setHours(0, 0, 0, 0);

  for (let add = 0; add <= 2; add++) {
    const year = today.getFullYear() + add;
    let cand = new Date(year, p.m - 1, p.d);
    if (cand.getMonth() !== p.m - 1 || cand.getDate() !== p.d) {
      if (p.m === 2 && p.d === 29) {
        cand = new Date(year, 1, 28);
      } else {
        continue;
      }
    }
    cand.setHours(0, 0, 0, 0);
    if (cand >= today) {
      return toIsoLocal(cand);
    }
  }
  return null;
}

/**
 * Limitní datum výpovědi „do 2 měsíců od sjednání" — vrátí ISO YYYY-MM-DD.
 * Datum je datum+2 měsíce (den v měsíci se zachová, pokud v daném měsíci existuje).
 */
export function computeTwoMonthDeadline(contractStartIso: string): string | null {
  const p = parseIsoYmd(contractStartIso);
  if (!p) return null;
  const start = new Date(p.y, p.m - 1, p.d);
  start.setHours(0, 0, 0, 0);
  const deadline = new Date(start);
  deadline.setMonth(deadline.getMonth() + 2);
  return toIsoLocal(deadline);
}

/**
 * True pokud je dnešní datum ≤ deadline (2 měsíce od počátku).
 */
export function isTwoMonthWindowOpen(contractStartIso: string, now: Date = new Date()): boolean {
  const deadline = computeTwoMonthDeadline(contractStartIso);
  if (!deadline) return false;
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  const d = new Date(deadline);
  d.setHours(0, 0, 0, 0);
  return today <= d;
}
