/**
 * Doporučená cadence vedení — ne firemní povinnost, jen lehká nápověda z dat v produktu.
 */

import type { CareerEvaluationViewModel } from "@/lib/career/career-evaluation-vm";
import type {
  CareerRecommendedActionKind,
  CoachingAdaptationSlice,
  CoachingMetricsSlice,
} from "@/lib/career/career-coaching";
import { deriveRecommendedCareerAction } from "@/lib/career/career-coaching";

export type CadenceKind =
  | "one_on_one_due"
  | "adaptation_checkin_due"
  | "followup_due"
  | "data_completion_followup"
  | "monitor_only";

export type TeamCadenceRow = {
  userId: string;
  displayName: string | null;
  email: string | null;
  cadenceKind: CadenceKind;
  reasonCs: string;
  careerRecommendedKind: CareerRecommendedActionKind;
  suggestEventTitle: string;
  suggestTaskTitle: string;
  /** Má v posledních dnech evidovaný osobní dotek (1:1 / adaptace / follow-up podle názvu)? */
  hasRecentPersonalTouch: boolean;
  /** Dny od posledního takového doteku, nebo null */
  daysSincePersonalTouch: number | null;
};

const ADAPTATION_TOUCH_DAYS = 10;
const ONE_ON_ONE_TOUCH_DAYS = 21;

function inActiveAdaptation(a: CoachingAdaptationSlice | null): boolean {
  if (!a) return false;
  return (
    a.adaptationStatus === "V adaptaci" ||
    a.adaptationStatus === "Rizikový" ||
    a.adaptationStatus === "Začíná"
  );
}

function daysBetween(from: Date, to: Date): number {
  return Math.floor((to.getTime() - from.getTime()) / (86400 * 1000));
}

export function buildTeamCadenceRows(
  rows: Array<{
    userId: string;
    displayName: string | null;
    email: string | null;
    careerEvaluation: CareerEvaluationViewModel;
    metrics: CoachingMetricsSlice | null;
    adaptation: CoachingAdaptationSlice | null;
    lastPersonalTouchAt: Date | null;
  }>,
  now: Date = new Date()
): TeamCadenceRow[] {
  const out: TeamCadenceRow[] = [];

  for (const r of rows) {
    const { kind: careerRecommendedKind } = deriveRecommendedCareerAction({
      vm: r.careerEvaluation,
      metrics: r.metrics,
      adaptation: r.adaptation,
    });

    const hasRecentPersonalTouch =
      r.lastPersonalTouchAt != null && daysBetween(r.lastPersonalTouchAt, now) <= ONE_ON_ONE_TOUCH_DAYS;
    const daysSincePersonalTouch =
      r.lastPersonalTouchAt != null ? daysBetween(r.lastPersonalTouchAt, now) : null;

    let cadenceKind: CadenceKind;
    let reasonCs: string;
    let suggestEventTitle: string;
    let suggestTaskTitle: string;

    if (careerRecommendedKind === "monitor_only" && hasRecentPersonalTouch) {
      cadenceKind = "monitor_only";
      reasonCs = "Doporučeno pokračovat v pravidelném kontaktu — nedávný osobní dotek v týmovém kalendáři.";
      suggestEventTitle = "1:1 — pravidelný kontakt";
      suggestTaskTitle = "Follow-up po kontaktu";
    } else if (
      inActiveAdaptation(r.adaptation) &&
      (r.lastPersonalTouchAt == null || daysBetween(r.lastPersonalTouchAt, now) > ADAPTATION_TOUCH_DAYS)
    ) {
      cadenceKind = "adaptation_checkin_due";
      reasonCs =
        r.lastPersonalTouchAt == null
          ? "Nováček v adaptaci — vhodné naplánovat krátký adaptační check-in (doporučení, ne povinnost)."
          : `Poslední osobní dotek před ${daysSincePersonalTouch} dny — u adaptace je vhodné navázat.`;
      suggestEventTitle = "Adaptační check-in";
      suggestTaskTitle = "Follow-up po adaptačním check-inu";
    } else if (careerRecommendedKind === "data_completion") {
      cadenceKind = "data_completion_followup";
      reasonCs = "Chybí nebo je nejasné kariérní zařazení — vhodné domluvit doplnění údajů (Nastavení → Tým).";
      suggestEventTitle = "1:1 — doplnění kariérního zařazení";
      suggestTaskTitle = "Follow-up – doplnění kariérních údajů";
    } else if (
      (careerRecommendedKind === "one_on_one" ||
        careerRecommendedKind === "performance_coaching" ||
        careerRecommendedKind === "team_meeting_followup") &&
      !hasRecentPersonalTouch
    ) {
      cadenceKind = "one_on_one_due";
      reasonCs =
        r.lastPersonalTouchAt == null
          ? "Doporučený osobní kontakt podle kariérního stavu — v kalendáři zatím neevidujeme nedávný 1:1 / check-in (heuristika z názvů)."
          : `Poslední zaznamenaný osobní dotek před ${daysSincePersonalTouch} dny — zvažte 1:1.`;
      suggestEventTitle = "1:1 — kariérní progres";
      suggestTaskTitle = "Follow-up k 1:1";
    } else if (careerRecommendedKind === "adaptation_checkin" && !hasRecentPersonalTouch) {
      cadenceKind = "adaptation_checkin_due";
      reasonCs = "Doporučený adaptační check-in podle stavu — vhodné naplánovat.";
      suggestEventTitle = "Adaptační check-in";
      suggestTaskTitle = "Follow-up po adaptačním check-inu";
    } else if (!hasRecentPersonalTouch && careerRecommendedKind !== "monitor_only") {
      cadenceKind = "followup_due";
      reasonCs = "Stav kariéry / CRM naznačuje, že by pomohl krátký navazující kontakt nebo úkol.";
      suggestEventTitle = "1:1 — navázání na coaching";
      suggestTaskTitle = "Follow-up z týmového přehledu";
    } else {
      cadenceKind = "monitor_only";
      reasonCs = "Z dostupných signálů stačí průběžně sledovat a podporovat.";
      suggestEventTitle = "1:1 — pravidelný kontakt";
      suggestTaskTitle = "Lehký follow-up";
    }

    out.push({
      userId: r.userId,
      displayName: r.displayName,
      email: r.email,
      cadenceKind,
      reasonCs,
      careerRecommendedKind,
      suggestEventTitle,
      suggestTaskTitle,
      hasRecentPersonalTouch,
      daysSincePersonalTouch,
    });
  }

  return out;
}

/** Položky k zobrazení v panelu cadence — vyloučíme čisté „sledovat“, aby panel nepřetékal. */
export function cadenceNeedsAttention(row: TeamCadenceRow): boolean {
  return row.cadenceKind !== "monitor_only";
}
