"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { clientInvitations, contracts, memberships, roles, userProfiles } from "db";
import { and, desc, eq, isNotNull } from "db";
import { getClientFinancialSummaryForContact } from "./client-financial-summary";

type DashboardMetricSummary = {
  assetsUnderManagement: number;
  monthlyInvestments: number;
  riskCoveragePercent: number;
};

export type ClientAdvisorInfo = {
  userId: string;
  fullName: string;
  email: string | null;
  initials: string;
};

function toNumber(value: string | null | undefined): number {
  if (!value) return 0;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function toInitials(name: string): string {
  const trimmed = name.trim();
  if (!trimmed) return "P";
  const parts = trimmed.split(/\s+/).slice(0, 2);
  return parts.map((part) => part[0]?.toUpperCase() ?? "").join("") || "P";
}

export async function getClientDashboardMetrics(
  contactId: string
): Promise<DashboardMetricSummary> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || auth.contactId !== contactId) {
    throw new Error("Forbidden");
  }

  const contractRows = await db
    .select({
      segment: contracts.segment,
      premiumAmount: contracts.premiumAmount,
      premiumAnnual: contracts.premiumAnnual,
    })
    .from(contracts)
    .where(and(eq(contracts.tenantId, auth.tenantId), eq(contracts.contactId, contactId)));

  const investmentSegments = new Set(["INV", "DIP", "DPS"]);
  let assetsUnderManagement = 0;
  let monthlyInvestments = 0;

  for (const contract of contractRows) {
    const monthly = toNumber(contract.premiumAmount);
    const annual = toNumber(contract.premiumAnnual);
    const normalizedAnnual = annual > 0 ? annual : monthly * 12;

    if (investmentSegments.has(contract.segment)) {
      assetsUnderManagement += normalizedAnnual;
      monthlyInvestments += monthly;
    }
  }

  const summary = await getClientFinancialSummaryForContact(contactId);
  const riskCoveragePercent = summary.reserveOk
    ? 100
    : Math.max(10, Math.min(95, Math.round((summary.assets / Math.max(summary.liabilities, 1)) * 40)));

  return {
    assetsUnderManagement: Math.round(assetsUnderManagement),
    monthlyInvestments: Math.round(monthlyInvestments),
    riskCoveragePercent,
  };
}

export async function getAssignedAdvisorForClient(
  contactId: string
): Promise<ClientAdvisorInfo | null> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || auth.contactId !== contactId) {
    throw new Error("Forbidden");
  }

  const [latestAcceptedInvite] = await db
    .select({ invitedByUserId: clientInvitations.invitedByUserId })
    .from(clientInvitations)
    .where(
      and(
        eq(clientInvitations.tenantId, auth.tenantId),
        eq(clientInvitations.contactId, contactId),
        isNotNull(clientInvitations.acceptedAt),
        isNotNull(clientInvitations.invitedByUserId)
      )
    )
    .orderBy(desc(clientInvitations.acceptedAt))
    .limit(1);

  if (latestAcceptedInvite?.invitedByUserId) {
    const [inviterProfile] = await db
      .select({
        userId: userProfiles.userId,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, latestAcceptedInvite.invitedByUserId))
      .limit(1);
    const inviterName = inviterProfile?.fullName?.trim();
    if (inviterName) {
      return {
        userId: inviterProfile.userId,
        fullName: inviterName,
        email: inviterProfile.email,
        initials: toInitials(inviterName),
      };
    }
  }

  const [latestContractAdvisor] = await db
    .select({ advisorId: contracts.advisorId })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, auth.tenantId),
        eq(contracts.contactId, contactId)
      )
    )
    .orderBy(desc(contracts.updatedAt))
    .limit(1);

  if (latestContractAdvisor?.advisorId) {
    const [profile] = await db
      .select({
        userId: userProfiles.userId,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, latestContractAdvisor.advisorId))
      .limit(1);

    if (profile?.fullName) {
      return {
        userId: profile.userId,
        fullName: profile.fullName,
        email: profile.email,
        initials: toInitials(profile.fullName),
      };
    }
  }

  const [fallbackAdvisor] = await db
    .select({
      userId: memberships.userId,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, memberships.userId))
    .where(
      and(
        eq(memberships.tenantId, auth.tenantId),
        eq(roles.tenantId, auth.tenantId),
        eq(roles.name, "Advisor")
      )
    )
    .limit(1);

  if (!fallbackAdvisor) return null;
  const name = fallbackAdvisor.fullName?.trim() || "Váš poradce";
  return {
    userId: fallbackAdvisor.userId,
    fullName: name,
    email: fallbackAdvisor.email,
    initials: toInitials(name),
  };
}
