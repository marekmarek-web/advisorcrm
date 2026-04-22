"use server";

/**
 * Team Overview F4 \u2014 server actions pro extern\u00ed (manu\u00e1ln\u011b veden\u00e9) \u010dleny t\u00fdmu,
 * manual period snapshots a kari\u00e9rn\u00ed zm\u011bny.
 *
 * Opr\u00e1vn\u011bn\u00ed: v\u0161e vy\u017eaduje `team_members:write` (Director/Admin, p\u0159\u00edp. Manager).
 * RLS je tenant-scoped p\u0159es NULLIF pattern \u2014 tenant_id vkl\u00e1d\u00e1me explicitn\u011b.
 */

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { hasPermission, type RoleName } from "@/shared/rolePermissions";
import { logAuditAction } from "@/lib/audit";
import { db, eq, and, teamMembers, teamMemberManualPeriods, teamMemberCareerLog } from "db";
import { revalidatePath } from "next/cache";

export type CreateExternalMemberInput = {
  displayName: string;
  email?: string | null;
  phone?: string | null;
  parentMemberId?: string | null;
  careerProgram?: string | null;
  careerTrack?: string | null;
  careerPositionCode?: string | null;
  note?: string | null;
};

export type CreateExternalMemberResult =
  | { ok: true; teamMemberId: string }
  | { ok: false; error: string };

export async function createExternalTeamMember(
  input: CreateExternalMemberInput
): Promise<CreateExternalMemberResult> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_members:write")) {
    return { ok: false, error: "Nem\u00e1te opr\u00e1vn\u011bn\u00ed p\u0159id\u00e1vat \u010dleny t\u00fdmu." };
  }
  const name = input.displayName?.trim();
  if (!name) return { ok: false, error: "Jm\u00e9no je povinn\u00e9." };

  const id = await withTenantContextFromAuth(auth, async (tx) => {
    const [row] = await tx
      .insert(teamMembers)
      .values({
        tenantId: auth.tenantId,
        authUserId: null,
        displayName: name,
        email: input.email?.trim() || null,
        phone: input.phone?.trim() || null,
        parentMemberId: input.parentMemberId ?? null,
        status: "active",
        memberKind: "external_manual",
        careerProgram: input.careerProgram ?? null,
        careerTrack: input.careerTrack ?? null,
        careerPositionCode: input.careerPositionCode ?? null,
        createdBy: auth.userId,
        updatedBy: auth.userId,
      })
      .returning({ id: teamMembers.id });

    if (row && (input.careerProgram || input.careerTrack || input.careerPositionCode)) {
      await tx.insert(teamMemberCareerLog).values({
        tenantId: auth.tenantId,
        teamMemberId: row.id,
        careerProgram: input.careerProgram ?? null,
        careerTrack: input.careerTrack ?? null,
        careerPositionCode: input.careerPositionCode ?? null,
        changeKind: "manual_confirmed",
        sourceNote: input.note ?? "Initial external member career assignment",
        actorUserId: auth.userId,
      });
    }
    return row?.id;
  });

  if (!id) return { ok: false, error: "Vlo\u017een\u00ed selhalo." };

  logAuditAction({
    action: "team_member.create_external",
    tenantId: auth.tenantId,
    userId: auth.userId,
    entityType: "team_member",
    entityId: id,
    meta: { name, parentMemberId: input.parentMemberId ?? null },
  });
  revalidatePath("/portal/team-overview");
  return { ok: true, teamMemberId: id };
}

export type UpdateExternalMemberInput = Partial<{
  displayName: string;
  email: string | null;
  phone: string | null;
  parentMemberId: string | null;
  status: "active" | "paused" | "offboarded" | "planned";
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
}>;

export async function updateExternalTeamMember(
  teamMemberId: string,
  patch: UpdateExternalMemberInput
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_members:write")) {
    return { ok: false, error: "Nem\u00e1te opr\u00e1vn\u011bn\u00ed." };
  }
  await withTenantContextFromAuth(auth, async (tx) => {
    await tx
      .update(teamMembers)
      .set({
        ...(patch.displayName !== undefined ? { displayName: patch.displayName?.trim() || null } : {}),
        ...(patch.email !== undefined ? { email: patch.email?.trim() || null } : {}),
        ...(patch.phone !== undefined ? { phone: patch.phone?.trim() || null } : {}),
        ...(patch.parentMemberId !== undefined ? { parentMemberId: patch.parentMemberId } : {}),
        ...(patch.status !== undefined ? { status: patch.status } : {}),
        ...(patch.careerProgram !== undefined ? { careerProgram: patch.careerProgram } : {}),
        ...(patch.careerTrack !== undefined ? { careerTrack: patch.careerTrack } : {}),
        ...(patch.careerPositionCode !== undefined ? { careerPositionCode: patch.careerPositionCode } : {}),
        updatedAt: new Date(),
        updatedBy: auth.userId,
      })
      .where(and(eq(teamMembers.tenantId, auth.tenantId), eq(teamMembers.id, teamMemberId)));
  });
  logAuditAction({
    action: "team_member.update_external",
    tenantId: auth.tenantId,
    userId: auth.userId,
    entityType: "team_member",
    entityId: teamMemberId,
    meta: patch,
  });
  revalidatePath("/portal/team-overview");
  return { ok: true };
}

export type UpsertManualPeriodInput = {
  teamMemberId: string;
  period: "week" | "month" | "quarter";
  year: number;
  periodIndex: number;
  unitsCount?: number | null;
  productionAmount?: number | null;
  contractsCount?: number | null;
  meetingsCount?: number | null;
  activitiesCount?: number | null;
  poolUnits?: Record<string, unknown> | null;
  confidence?: "manual_confirmed" | "manual_estimated";
  sourceNote?: string | null;
};

export async function upsertManualPeriod(
  input: UpsertManualPeriodInput
): Promise<{ ok: boolean; error?: string; id?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_members:write")) {
    return { ok: false, error: "Nem\u00e1te opr\u00e1vn\u011bn\u00ed zapisovat manu\u00e1ln\u00ed data." };
  }

  const id = await withTenantContextFromAuth(auth, async (tx) => {
    const [existing] = await tx
      .select({ id: teamMemberManualPeriods.id })
      .from(teamMemberManualPeriods)
      .where(
        and(
          eq(teamMemberManualPeriods.tenantId, auth.tenantId),
          eq(teamMemberManualPeriods.teamMemberId, input.teamMemberId),
          eq(teamMemberManualPeriods.period, input.period),
          eq(teamMemberManualPeriods.year, input.year),
          eq(teamMemberManualPeriods.periodIndex, input.periodIndex)
        )
      )
      .limit(1);

    const payload = {
      tenantId: auth.tenantId,
      teamMemberId: input.teamMemberId,
      period: input.period,
      year: input.year,
      periodIndex: input.periodIndex,
      unitsCount: input.unitsCount ?? null,
      productionAmount: input.productionAmount != null ? String(input.productionAmount) : null,
      contractsCount: input.contractsCount ?? null,
      meetingsCount: input.meetingsCount ?? null,
      activitiesCount: input.activitiesCount ?? null,
      poolUnits: input.poolUnits ?? null,
      confidence: input.confidence ?? "manual_confirmed",
      sourceNote: input.sourceNote ?? null,
      enteredBy: auth.userId,
      updatedAt: new Date(),
    };

    if (existing) {
      await tx.update(teamMemberManualPeriods).set(payload).where(eq(teamMemberManualPeriods.id, existing.id));
      return existing.id;
    }
    const [inserted] = await tx
      .insert(teamMemberManualPeriods)
      .values(payload)
      .returning({ id: teamMemberManualPeriods.id });
    return inserted?.id;
  });

  if (!id) return { ok: false, error: "Z\u00e1pis selhal." };

  logAuditAction({
    action: "team_member.manual_period_upsert",
    tenantId: auth.tenantId,
    userId: auth.userId,
    entityType: "team_member_manual_period",
    entityId: id,
    meta: { teamMemberId: input.teamMemberId, period: input.period, year: input.year, periodIndex: input.periodIndex },
  });
  revalidatePath("/portal/team-overview");
  return { ok: true, id };
}

export async function deleteManualPeriod(id: string): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_members:write")) {
    return { ok: false, error: "Nem\u00e1te opr\u00e1vn\u011bn\u00ed." };
  }
  await withTenantContextFromAuth(auth, async (tx) => {
    await tx
      .delete(teamMemberManualPeriods)
      .where(and(eq(teamMemberManualPeriods.tenantId, auth.tenantId), eq(teamMemberManualPeriods.id, id)));
  });
  revalidatePath("/portal/team-overview");
  return { ok: true };
}

export type ConfirmCareerInput = {
  teamMemberId: string;
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
  changeKind?: "manual_confirmed" | "manual_override";
  note?: string | null;
};

export async function confirmCareerManually(
  input: ConfirmCareerInput
): Promise<{ ok: boolean; error?: string }> {
  const auth = await requireAuthInAction();
  if (!hasPermission(auth.roleName as RoleName, "team_members:write")) {
    return { ok: false, error: "Nem\u00e1te opr\u00e1vn\u011bn\u00ed." };
  }

  await withTenantContextFromAuth(auth, async (tx) => {
    await tx
      .update(teamMembers)
      .set({
        careerProgram: input.careerProgram,
        careerTrack: input.careerTrack,
        careerPositionCode: input.careerPositionCode,
        updatedAt: new Date(),
        updatedBy: auth.userId,
      })
      .where(and(eq(teamMembers.tenantId, auth.tenantId), eq(teamMembers.id, input.teamMemberId)));

    await tx.insert(teamMemberCareerLog).values({
      tenantId: auth.tenantId,
      teamMemberId: input.teamMemberId,
      careerProgram: input.careerProgram,
      careerTrack: input.careerTrack,
      careerPositionCode: input.careerPositionCode,
      changeKind: input.changeKind ?? "manual_confirmed",
      sourceNote: input.note ?? null,
      actorUserId: auth.userId,
    });
  });

  logAuditAction({
    action: "team_member.career_confirm_manual",
    tenantId: auth.tenantId,
    userId: auth.userId,
    entityType: "team_member",
    entityId: input.teamMemberId,
    meta: {
      careerProgram: input.careerProgram,
      careerTrack: input.careerTrack,
      careerPositionCode: input.careerPositionCode,
      changeKind: input.changeKind ?? "manual_confirmed",
    },
  });
  revalidatePath("/portal/team-overview");
  return { ok: true };
}
