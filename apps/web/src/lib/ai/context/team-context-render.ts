/**
 * Pure rendering of team AI prompt variables from raw context.
 * No server imports — safe to use from tests.
 */

const MAX_MEMBERS_IN_SUMMARY = 20;
const MAX_ALERTS = 15;

export type TeamAiContextRaw = {
  teamId: string;
  period: string;
  userId: string;
  tenantId: string;
  periodLabel: string;
  kpis: {
    memberCount: number;
    activeMemberCount: number;
    newcomersInAdaptation: number;
    riskyMemberCount: number;
    unitsThisPeriod: number;
    unitsTrend: number;
    productionThisPeriod: number;
    productionTrend: number;
    meetingsThisWeek: number;
    periodLabel: string;
    teamGoalTarget: number | null;
    teamGoalActual: number | null;
    teamGoalType: string | null;
    teamGoalProgressPercent: number | null;
  } | null;
  members: { userId: string; displayName?: string | null; roleName: string; email?: string | null }[];
  metrics: {
    userId: string;
    unitsThisPeriod: number;
    unitsTrend: number;
    productionThisPeriod: number;
    meetingsThisPeriod: number;
    activityCount: number;
    lastActivityAt: Date | null;
    daysWithoutActivity: number;
    riskLevel: "ok" | "warning" | "critical";
  }[];
  alerts: { memberId: string; title: string; description: string; severity: string }[];
  newcomers: {
    userId: string;
    joinedAt: Date;
    daysInTeam: number;
    adaptationScore: number;
    adaptationStatus: string;
    checklist: { key: string; label: string; completed: boolean; completedAt: Date | null }[];
    lastActivityAt: Date | null;
    warnings: string[];
  }[];
};

function formatNumber(n: number): string {
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `${(n / 1_000).toFixed(1)}k`;
  return n.toLocaleString("cs-CZ");
}

function selectRelevantMembers(
  members: TeamAiContextRaw["members"],
  metrics: TeamAiContextRaw["metrics"],
  newcomers: TeamAiContextRaw["newcomers"],
  maxCount: number
): TeamAiContextRaw["members"] {
  const metricsByUser = new Map(metrics.map((m) => [m.userId, m]));
  const newcomerIds = new Set(newcomers.map((n) => n.userId));
  const withMetrics = members.map((m) => ({
    member: m,
    metrics: metricsByUser.get(m.userId),
    isNewcomer: newcomerIds.has(m.userId),
  }));

  const byRelevance = [...withMetrics].sort((a, b) => {
    const risk = (r: "ok" | "warning" | "critical") => (r === "critical" ? 3 : r === "warning" ? 2 : 0);
    const rA = risk(a.metrics?.riskLevel ?? "ok");
    const rB = risk(b.metrics?.riskLevel ?? "ok");
    if (rB !== rA) return rB - rA;
    if (a.isNewcomer && !b.isNewcomer) return -1;
    if (!a.isNewcomer && b.isNewcomer) return 1;
    const uA = a.metrics?.unitsThisPeriod ?? 0;
    const uB = b.metrics?.unitsThisPeriod ?? 0;
    return uB - uA;
  });

  return byRelevance.slice(0, maxCount).map((x) => x.member);
}

export function renderTeamAiPromptVariables(raw: TeamAiContextRaw): Record<string, string> {
  const memberNames = new Map(raw.members.map((m) => [m.userId, m.displayName?.trim() || "Člen týmu"]));
  const metricsByUser = new Map(raw.metrics.map((m) => [m.userId, m]));
  const getName = (uid: string) => memberNames.get(uid) ?? "Člen týmu";

  let team_overview = "Tým: žádná data.";
  if (raw.kpis) {
    const parts: string[] = [
      `Počet členů: ${raw.kpis.memberCount}, aktivních v období: ${raw.kpis.activeMemberCount}.`,
      `Nováčci v adaptaci: ${raw.kpis.newcomersInAdaptation}. Rizikoví členové: ${raw.kpis.riskyMemberCount}.`,
    ];
    team_overview = parts.join(" ");
  } else if (raw.members.length > 0) {
    team_overview = `Tým: ${raw.members.length} členů. KPI za zvolené období nejsou k dispozici.`;
  }

  let team_kpis = "KPI nejsou k dispozici.";
  if (raw.kpis) {
    const parts: string[] = [
      `Jednotky (${raw.periodLabel}): ${raw.kpis.unitsThisPeriod} (trend ${raw.kpis.unitsTrend >= 0 ? "+" : ""}${raw.kpis.unitsTrend}).`,
      `Produkce: ${formatNumber(raw.kpis.productionThisPeriod)} (trend ${raw.kpis.productionTrend >= 0 ? "+" : ""}${Math.round(raw.kpis.productionTrend)}).`,
      `Schůzky tento týden: ${raw.kpis.meetingsThisWeek}.`,
    ];
    if (raw.kpis.teamGoalTarget != null && raw.kpis.teamGoalType) {
      parts.push(
        `Týmový cíl (${raw.kpis.teamGoalType}): ${raw.kpis.teamGoalActual ?? 0} / ${raw.kpis.teamGoalTarget}` +
          (raw.kpis.teamGoalProgressPercent != null ? `, ${raw.kpis.teamGoalProgressPercent} % splněno.` : ".")
      );
    } else {
      parts.push("Týmový cíl pro toto období není zadaný.");
    }
    team_kpis = parts.join(" ");
  }

  const selectedMembers = selectRelevantMembers(
    raw.members,
    raw.metrics,
    raw.newcomers,
    MAX_MEMBERS_IN_SUMMARY
  );
  const memberLines: string[] = [];
  for (const m of selectedMembers) {
    const met = metricsByUser.get(m.userId);
    const name = getName(m.userId);
    const newcomer = raw.newcomers.find((n) => n.userId === m.userId);
    const parts: string[] = [
      name,
      `role: ${m.roleName}`,
      `jednotky: ${met?.unitsThisPeriod ?? "—"}`,
      `produkce: ${met ? formatNumber(met.productionThisPeriod) : "—"}`,
      `schůzky: ${met?.meetingsThisPeriod ?? "—"}`,
      `aktivita: ${met?.activityCount ?? "—"}`,
    ];
    if (met?.lastActivityAt) {
      parts.push(`poslední aktivita: před ${met.daysWithoutActivity} dny`);
    } else {
      parts.push("poslední aktivita: žádná");
    }
    parts.push(`trend jednotek: ${(met?.unitsTrend ?? 0) >= 0 ? "+" : ""}${met?.unitsTrend ?? 0}`);
    parts.push(`riziko: ${met?.riskLevel ?? "—"}`);
    if (newcomer) parts.push("nováček");
    memberLines.push(`- ${parts.join(" | ")}`);
  }
  const team_members =
    memberLines.length > 0
      ? memberLines.join("\n") +
        (raw.members.length > MAX_MEMBERS_IN_SUMMARY ? `\n(Zobrazeno ${MAX_MEMBERS_IN_SUMMARY} z ${raw.members.length} členů.)` : "")
      : "Žádní členové týmu nebo chybí data.";

  const alertLines = raw.alerts.slice(0, MAX_ALERTS).map((a) => {
    const name = getName(a.memberId);
    return `[${a.severity}] ${name}: ${a.title}. ${a.description}`;
  });
  const team_alerts =
    alertLines.length > 0
      ? alertLines.join("\n") +
        (raw.alerts.length > MAX_ALERTS ? `\n(Celkem ${raw.alerts.length} upozornění.)` : "")
      : "Žádná aktivní upozornění.";

  const newcomerLines: string[] = [];
  for (const n of raw.newcomers) {
    const name = getName(n.userId);
    const done = n.checklist.filter((s) => s.completed).map((s) => s.label);
    const missing = n.checklist.filter((s) => !s.completed).map((s) => s.label);
    const parts: string[] = [
      `${name}: ${n.daysInTeam} dní v týmu`,
      `adaptace: ${n.adaptationScore} %, ${n.adaptationStatus}`,
      `splněno: ${done.length ? done.join(", ") : "zatím nic"}`,
      `chybí: ${missing.length ? missing.join(", ") : "vše splněno"}`,
    ];
    if (n.warnings.length) parts.push(`rizika: ${n.warnings.join("; ")}`);
    newcomerLines.push(parts.join(". "));
  }
  const newcomer_adaptation =
    newcomerLines.length > 0 ? newcomerLines.join("\n") : "Momentálně žádní nováčci v adaptačním období.";

  return {
    team_overview,
    team_kpis,
    team_members,
    team_alerts,
    newcomer_adaptation,
    period_label: raw.periodLabel,
  };
}
