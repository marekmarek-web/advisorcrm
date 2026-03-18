/**
 * Team AI eval fixtures for scenarios: healthy, risky member, newcomer struggling,
 * performance drop, sparse data. Used to assert deterministic context rendering
 * and anti-hallucination expectations (data-gap wording, no speculation).
 * Shape matches TeamAiContextRaw from context/team-context.
 */

type EvalMember = { userId: string; displayName: string | null; roleName: string; email: string | null };
type EvalMetric = { userId: string; unitsThisPeriod: number; unitsTrend: number; productionThisPeriod: number; meetingsThisPeriod: number; activityCount: number; lastActivityAt: Date | null; daysWithoutActivity: number; riskLevel: "ok" | "warning" | "critical" };
type EvalAlert = { memberId: string; title: string; description: string; severity: string };
type EvalNewcomer = { userId: string; joinedAt: Date; daysInTeam: number; adaptationScore: number; adaptationStatus: string; checklist: { key: string; label: string; completed: boolean; completedAt: Date | null }[]; lastActivityAt: Date | null; warnings: string[] };
type EvalKpis = { memberCount: number; activeMemberCount: number; newcomersInAdaptation: number; riskyMemberCount: number; unitsThisPeriod: number; unitsTrend: number; productionThisPeriod: number; productionTrend: number; meetingsThisWeek: number; periodLabel: string; teamGoalTarget: number | null; teamGoalActual: number | null; teamGoalType: string | null; teamGoalProgressPercent: number | null };

type TeamEvalRaw = {
  teamId: string;
  period: string;
  userId: string;
  tenantId: string;
  periodLabel: string;
  kpis: EvalKpis | null;
  members: EvalMember[];
  metrics: EvalMetric[];
  alerts: EvalAlert[];
  newcomers: EvalNewcomer[];
};

const base: TeamEvalRaw = {
  teamId: "tenant-1",
  period: "month",
  userId: "user-1",
  tenantId: "tenant-1",
  periodLabel: "tento měsíc",
  members: [],
  metrics: [],
  alerts: [],
  newcomers: [],
  kpis: null,
};

/** Healthy team: full KPI, several members, no alerts, no newcomers. */
export const healthyTeam: TeamEvalRaw = {
  ...base,
  kpis: {
    memberCount: 5,
    activeMemberCount: 5,
    newcomersInAdaptation: 0,
    riskyMemberCount: 0,
    unitsThisPeriod: 120,
    unitsTrend: 10,
    productionThisPeriod: 2_500_000,
    productionTrend: 5,
    meetingsThisWeek: 12,
    periodLabel: "tento měsíc",
    teamGoalTarget: 100,
    teamGoalActual: 95,
    teamGoalType: "units",
    teamGoalProgressPercent: 95,
  },
  members: [
    { userId: "u1", displayName: "Anna", roleName: "Advisor", email: "a@t.cz" },
    { userId: "u2", displayName: "Bruno", roleName: "Advisor", email: "b@t.cz" },
  ],
  metrics: [
    { userId: "u1", unitsThisPeriod: 60, unitsTrend: 5, productionThisPeriod: 1_200_000, meetingsThisPeriod: 6, activityCount: 20, lastActivityAt: new Date(), daysWithoutActivity: 0, riskLevel: "ok" },
    { userId: "u2", unitsThisPeriod: 60, unitsTrend: 5, productionThisPeriod: 1_300_000, meetingsThisPeriod: 6, activityCount: 18, lastActivityAt: new Date(), daysWithoutActivity: 1, riskLevel: "ok" },
  ],
  alerts: [],
  newcomers: [],
};

/** Mixed team with one risky member. */
export const mixedTeamOneRisky: TeamEvalRaw = {
  ...base,
  kpis: {
    memberCount: 4,
    activeMemberCount: 3,
    newcomersInAdaptation: 0,
    riskyMemberCount: 1,
    unitsThisPeriod: 80,
    unitsTrend: -5,
    productionThisPeriod: 1_500_000,
    productionTrend: -2,
    meetingsThisWeek: 6,
    periodLabel: "tento měsíc",
    teamGoalTarget: null,
    teamGoalActual: null,
    teamGoalType: null,
    teamGoalProgressPercent: null,
  },
  members: [
    { userId: "u1", displayName: "Anna", roleName: "Advisor", email: "a@t.cz" },
    { userId: "u2", displayName: "Rizikový Radek", roleName: "Advisor", email: "r@t.cz" },
  ],
  metrics: [
    { userId: "u1", unitsThisPeriod: 40, unitsTrend: 2, productionThisPeriod: 800_000, meetingsThisPeriod: 4, activityCount: 15, lastActivityAt: new Date(), daysWithoutActivity: 0, riskLevel: "ok" },
    { userId: "u2", unitsThisPeriod: 5, unitsTrend: -15, productionThisPeriod: 100_000, meetingsThisPeriod: 0, activityCount: 2, lastActivityAt: new Date(Date.now() - 12 * 24 * 60 * 60 * 1000), daysWithoutActivity: 12, riskLevel: "critical" },
  ],
  alerts: [
    { memberId: "u2", title: "Žádná aktivita 12+ dní", description: "Dlouhodobě bez aktivity.", severity: "critical" },
  ],
  newcomers: [],
};

/** Newcomer struggling: one in adaptation with low score. */
export const newcomerStruggling: TeamEvalRaw = {
  ...base,
  kpis: {
    memberCount: 3,
    activeMemberCount: 2,
    newcomersInAdaptation: 1,
    riskyMemberCount: 1,
    unitsThisPeriod: 45,
    unitsTrend: 0,
    productionThisPeriod: 900_000,
    productionTrend: 0,
    meetingsThisWeek: 3,
    periodLabel: "tento měsíc",
    teamGoalTarget: null,
    teamGoalActual: null,
    teamGoalType: null,
    teamGoalProgressPercent: null,
  },
  members: [
    { userId: "n1", displayName: "Nový Honza", roleName: "Advisor", email: "n@t.cz" },
  ],
  metrics: [
    { userId: "n1", unitsThisPeriod: 0, unitsTrend: 0, productionThisPeriod: 0, meetingsThisPeriod: 0, activityCount: 1, lastActivityAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000), daysWithoutActivity: 10, riskLevel: "warning" },
  ],
  alerts: [
    { memberId: "n1", title: "Nováček bez schůzky", description: "Zatím žádná schůzka.", severity: "warning" },
  ],
  newcomers: [
    {
      userId: "n1",
      joinedAt: new Date(Date.now() - 25 * 24 * 60 * 60 * 1000),
      daysInTeam: 25,
      adaptationScore: 25,
      adaptationStatus: "Začíná",
      checklist: [
        { key: "profile_created", label: "Profil vytvořen", completed: true, completedAt: new Date() },
        { key: "first_activity", label: "První aktivita", completed: true, completedAt: new Date() },
        { key: "first_meeting", label: "První schůzka", completed: false, completedAt: null },
      ],
      lastActivityAt: new Date(Date.now() - 10 * 24 * 60 * 60 * 1000),
      warnings: ["Žádná schůzka po 25 dnech"],
    },
  ],
};

/** Performance drop: negative trends, lower activity. */
export const performanceDrop: TeamAiContextRaw = {
  ...base,
  kpis: {
    memberCount: 4,
    activeMemberCount: 4,
    newcomersInAdaptation: 0,
    riskyMemberCount: 2,
    unitsThisPeriod: 50,
    unitsTrend: -25,
    productionThisPeriod: 1_000_000,
    productionTrend: -15,
    meetingsThisWeek: 4,
    periodLabel: "tento měsíc",
    teamGoalTarget: 120,
    teamGoalActual: 50,
    teamGoalType: "units",
    teamGoalProgressPercent: 42,
  },
  members: [
    { userId: "u1", displayName: "A", roleName: "Advisor", email: "a@t.cz" },
    { userId: "u2", displayName: "B", roleName: "Advisor", email: "b@t.cz" },
  ],
  metrics: [
    { userId: "u1", unitsThisPeriod: 25, unitsTrend: -10, productionThisPeriod: 500_000, meetingsThisPeriod: 2, activityCount: 8, lastActivityAt: new Date(), daysWithoutActivity: 2, riskLevel: "warning" },
    { userId: "u2", unitsThisPeriod: 25, unitsTrend: -15, productionThisPeriod: 500_000, meetingsThisPeriod: 2, activityCount: 6, lastActivityAt: new Date(), daysWithoutActivity: 5, riskLevel: "warning" },
  ],
  alerts: [
    { memberId: "u1", title: "Pokles jednotek", description: "Trend -10 oproti předchozímu období.", severity: "warning" },
    { memberId: "u2", title: "Pokles jednotek", description: "Trend -15.", severity: "warning" },
  ],
  newcomers: [],
};

/** Sparse data: no KPI, no or minimal members. */
export const sparseDataTeam: TeamEvalRaw = {
  ...base,
  kpis: null,
  members: [],
  metrics: [],
  alerts: [],
  newcomers: [],
};

export const teamEvalFixtures = {
  healthyTeam,
  mixedTeamOneRisky,
  newcomerStruggling,
  performanceDrop,
  sparseDataTeam,
};
