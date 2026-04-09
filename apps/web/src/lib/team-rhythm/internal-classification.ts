/**
 * Heuristická kategorizace týmových událostí/úkolů podle názvu.
 * Nejsou first-class typy v DB — v dokumentaci uvedeno jako orientační.
 */

export type InternalRhythmCategory =
  | "one_on_one_hint"
  | "adaptation_checkin_hint"
  | "team_meeting_hint"
  | "follow_up_hint"
  | "internal_generic";

/** Událost se počítá jako „osobní kontakt“ pro cadence (ne náhrada týmové porady). */
export function isCadencePersonalTouchCategory(c: InternalRhythmCategory): boolean {
  return c === "one_on_one_hint" || c === "adaptation_checkin_hint" || c === "follow_up_hint";
}

export function classifyInternalTeamTitle(title: string): InternalRhythmCategory {
  const t = title.toLowerCase();
  if (t.includes("adaptač") || t.includes("adaptac") || t.includes("check-in") || t.includes("check in")) {
    return "adaptation_checkin_hint";
  }
  if (
    t.includes("1:1") ||
    t.includes("1 : 1") ||
    t.includes("jedna ku jedné") ||
    t.includes("kariér") ||
    t.includes("coaching") ||
    t.includes("rozhovor")
  ) {
    return "one_on_one_hint";
  }
  if (t.includes("porada") || t.includes("briefing") || t.includes("týmov") || t.includes("tymov") || t.includes("all-hands")) {
    return "team_meeting_hint";
  }
  if (t.includes("follow") || t.includes("navázání") || t.includes("navazani")) {
    return "follow_up_hint";
  }
  return "internal_generic";
}
