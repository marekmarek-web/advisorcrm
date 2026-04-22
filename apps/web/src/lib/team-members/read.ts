/**
 * Team Overview F2 \u2014 canonical read helpers nad team_members a relacemi.
 *
 * listTenantHierarchyMembers z lib/team-hierarchy.ts u\u017e vrac\u00ed kanonicky
 * joinovan\u00e9 \u0159\u00e1dky v\u010detn\u011b external_manual \u010dlen\u016f. Tyto helpery
 * p\u0159id\u00e1vaj\u00ed targetovan\u00fd p\u0159\u00edstup k manual periods a career log
 * pot\u0159ebn\u00fd pro F3 (sources/confidence) a F4 (manual data UI).
 */

import "server-only";

import { and, asc, desc, db, eq, inArray, teamMemberCareerLog, teamMemberManualPeriods, teamMembers } from "db";

export type ManualPeriodRow = {
  id: string;
  teamMemberId: string;
  period: "week" | "month" | "quarter";
  year: number;
  periodIndex: number;
  unitsCount: number | null;
  productionAmount: string | null;
  contractsCount: number | null;
  meetingsCount: number | null;
  activitiesCount: number | null;
  poolUnits: unknown;
  confidence: "manual_confirmed" | "manual_estimated";
  sourceNote: string | null;
  enteredBy: string | null;
  enteredAt: Date;
  updatedAt: Date;
};

export type CareerLogRow = {
  id: string;
  teamMemberId: string;
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
  changeKind: "auto" | "manual_confirmed" | "manual_override";
  effectiveFrom: Date;
  sourceNote: string | null;
  actorUserId: string | null;
};

export async function listManualPeriodsForMembers(
  tenantId: string,
  teamMemberIds: string[]
): Promise<ManualPeriodRow[]> {
  if (teamMemberIds.length === 0) return [];
  const rows = await db
    .select({
      id: teamMemberManualPeriods.id,
      teamMemberId: teamMemberManualPeriods.teamMemberId,
      period: teamMemberManualPeriods.period,
      year: teamMemberManualPeriods.year,
      periodIndex: teamMemberManualPeriods.periodIndex,
      unitsCount: teamMemberManualPeriods.unitsCount,
      productionAmount: teamMemberManualPeriods.productionAmount,
      contractsCount: teamMemberManualPeriods.contractsCount,
      meetingsCount: teamMemberManualPeriods.meetingsCount,
      activitiesCount: teamMemberManualPeriods.activitiesCount,
      poolUnits: teamMemberManualPeriods.poolUnits,
      confidence: teamMemberManualPeriods.confidence,
      sourceNote: teamMemberManualPeriods.sourceNote,
      enteredBy: teamMemberManualPeriods.enteredBy,
      enteredAt: teamMemberManualPeriods.enteredAt,
      updatedAt: teamMemberManualPeriods.updatedAt,
    })
    .from(teamMemberManualPeriods)
    .where(
      and(
        eq(teamMemberManualPeriods.tenantId, tenantId),
        inArray(teamMemberManualPeriods.teamMemberId, teamMemberIds)
      )
    )
    .orderBy(desc(teamMemberManualPeriods.year), desc(teamMemberManualPeriods.periodIndex));

  return rows.map((r) => ({
    id: r.id,
    teamMemberId: r.teamMemberId,
    period: r.period as ManualPeriodRow["period"],
    year: r.year,
    periodIndex: r.periodIndex,
    unitsCount: r.unitsCount,
    productionAmount: r.productionAmount,
    contractsCount: r.contractsCount,
    meetingsCount: r.meetingsCount,
    activitiesCount: r.activitiesCount,
    poolUnits: r.poolUnits,
    confidence: r.confidence as ManualPeriodRow["confidence"],
    sourceNote: r.sourceNote,
    enteredBy: r.enteredBy,
    enteredAt: r.enteredAt,
    updatedAt: r.updatedAt,
  }));
}

export async function listCareerLogForMember(
  tenantId: string,
  teamMemberId: string
): Promise<CareerLogRow[]> {
  const rows = await db
    .select({
      id: teamMemberCareerLog.id,
      teamMemberId: teamMemberCareerLog.teamMemberId,
      careerProgram: teamMemberCareerLog.careerProgram,
      careerTrack: teamMemberCareerLog.careerTrack,
      careerPositionCode: teamMemberCareerLog.careerPositionCode,
      changeKind: teamMemberCareerLog.changeKind,
      effectiveFrom: teamMemberCareerLog.effectiveFrom,
      sourceNote: teamMemberCareerLog.sourceNote,
      actorUserId: teamMemberCareerLog.actorUserId,
    })
    .from(teamMemberCareerLog)
    .where(
      and(
        eq(teamMemberCareerLog.tenantId, tenantId),
        eq(teamMemberCareerLog.teamMemberId, teamMemberId)
      )
    )
    .orderBy(desc(teamMemberCareerLog.effectiveFrom));

  return rows.map((r) => ({
    ...r,
    changeKind: r.changeKind as CareerLogRow["changeKind"],
  }));
}

export async function getTeamMemberByUserId(
  tenantId: string,
  authUserId: string
): Promise<{ id: string; parentMemberId: string | null } | null> {
  const rows = await db
    .select({ id: teamMembers.id, parentMemberId: teamMembers.parentMemberId })
    .from(teamMembers)
    .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.authUserId, authUserId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function getTeamMemberById(
  tenantId: string,
  teamMemberId: string
): Promise<{ id: string; authUserId: string | null; parentMemberId: string | null; memberKind: string; status: string } | null> {
  const rows = await db
    .select({
      id: teamMembers.id,
      authUserId: teamMembers.authUserId,
      parentMemberId: teamMembers.parentMemberId,
      memberKind: teamMembers.memberKind,
      status: teamMembers.status,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.tenantId, tenantId), eq(teamMembers.id, teamMemberId)))
    .limit(1);
  return rows[0] ?? null;
}

export async function listTeamMembersByIds(
  tenantId: string,
  ids: string[]
): Promise<Array<{ id: string; authUserId: string | null; displayName: string | null; memberKind: string; status: string }>> {
  if (ids.length === 0) return [];
  const rows = await db
    .select({
      id: teamMembers.id,
      authUserId: teamMembers.authUserId,
      displayName: teamMembers.displayName,
      memberKind: teamMembers.memberKind,
      status: teamMembers.status,
    })
    .from(teamMembers)
    .where(and(eq(teamMembers.tenantId, tenantId), inArray(teamMembers.id, ids)))
    .orderBy(asc(teamMembers.displayName));
  return rows;
}
