import type { TeamMemberDetail } from "@/app/actions/team-overview";

/**
 * Sdílené odrážky „Shrnutí pro coaching“ — stejná logika jako na detailu člena (Team Overview / 1:1).
 */
export function buildTeamMemberCoachingSummaryBullets(detail: TeamMemberDetail): string[] {
  const bullets: string[] = [];
  const m = detail.metrics;
  const critical = detail.alerts.filter((a) => a.severity === "critical");
  const warning = detail.alerts.filter((a) => a.severity === "warning");
  if (critical.length > 0) {
    bullets.push(`Rizika: ${critical.map((a) => a.title).join("; ")}.`);
  }
  if (warning.length > 0 && critical.length === 0) {
    bullets.push(`Pozor: ${warning.map((a) => a.title).join("; ")}.`);
  }
  if (m) {
    if (m.daysWithoutActivity >= 7 && !detail.alerts.some((a) => a.type === "no_activity")) {
      bullets.push(`${m.daysWithoutActivity} dní bez aktivity – interní tip: zvažte pravidelný záznam v CRM.`);
    }
    if (m.meetingsThisPeriod === 0 && m.unitsThisPeriod === 0) {
      bullets.push(
        "Zatím žádné schůzky ani jednotky v tomto období – oblast k ověření vedením: naplánovat schůzky a follow-up."
      );
    }
    if (m.tasksOpen > 10) {
      bullets.push("Vysoký počet otevřených úkolů – interní upozornění: zvažte priorizaci a uzavření starých položek.");
    }
  }
  if (detail.adaptation) {
    if (detail.adaptation.adaptationStatus === "Rizikový") {
      bullets.push(
        `Nováček v riziku (${detail.adaptation.adaptationScore} % adaptace) – interní tip: zvažte intenzivnější podporu a check-in.`
      );
    } else if (detail.adaptation.adaptationStatus === "V adaptaci" && detail.adaptation.warnings.length > 0) {
      bullets.push(`Adaptace: ${detail.adaptation.warnings.join("; ")}.`);
    }
  }
  if (bullets.length === 0 && m) {
    bullets.push("Žádná zásadní rizika. Pokračovat v pravidelném vedení a zpětné vazbě.");
  }
  return bullets;
}
