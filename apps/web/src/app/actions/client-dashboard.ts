"use server";

import { requireAuthInAction } from "@/lib/auth/require-auth";
import { db } from "db";
import { clientInvitations, contracts, memberships, roles, userProfiles } from "db";
import { and, desc, eq, inArray, isNotNull, isNull } from "db";
import { aggregatePortfolioMetrics } from "@/lib/client-portfolio/read-model";

type DashboardMetricSummary = {
  /** Roční ekvivalent investic (INV/DIP/DPS) z publikovaného portfolia */
  assetsUnderManagement: number;
  monthlyInvestments: number;
  /** Součet měsíčních pojistných z publikovaného portfolia */
  monthlyInsurancePremiums: number;
  activeContractCount: number;
};

export type ClientAdvisorInfo = {
  userId: string;
  fullName: string;
  email: string | null;
  initials: string;
};

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
      portfolioAttributes: contracts.portfolioAttributes,
      portfolioStatus: contracts.portfolioStatus,
    })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, auth.tenantId),
        eq(contracts.contactId, contactId),
        eq(contracts.visibleToClient, true),
        inArray(contracts.portfolioStatus, ["active", "ended"]),
        isNull(contracts.archivedAt)
      )
    );

  const agg = aggregatePortfolioMetrics(
    contractRows.map((r) => ({
      segment: r.segment,
      premiumAmount: r.premiumAmount != null ? String(r.premiumAmount) : null,
      premiumAnnual: r.premiumAnnual != null ? String(r.premiumAnnual) : null,
      portfolioAttributes: (r.portfolioAttributes ?? {}) as Record<string, unknown>,
      portfolioStatus: r.portfolioStatus,
    }))
  );

  const investmentSegments = new Set(["INV", "DIP", "DPS"]);
  let assetsUnderManagement = 0;
  for (const contract of contractRows) {
    if (contract.portfolioStatus === "ended") continue;
    if (!investmentSegments.has(contract.segment)) continue;
    const monthly = Number(contract.premiumAmount ?? 0);
    const annual = Number(contract.premiumAnnual ?? 0);
    const normalizedAnnual = annual > 0 ? annual : monthly * 12;
    if (Number.isFinite(normalizedAnnual)) assetsUnderManagement += normalizedAnnual;
  }

  return {
    assetsUnderManagement: Math.round(assetsUnderManagement),
    monthlyInvestments: agg.monthlyInvestments,
    monthlyInsurancePremiums: agg.monthlyInsurancePremiums,
    activeContractCount: agg.activeContractCount,
  };
}

/**
 * Určí userId poradce pro kontakt (stejná priorita jako getAssignedAdvisorForClient), bez role Client — pro serverové notifikace.
 */
export async function getTargetAdvisorUserIdForContact(
  tenantId: string,
  contactId: string
): Promise<string | null> {
  const [latestAcceptedInvite] = await db
    .select({ invitedByUserId: clientInvitations.invitedByUserId })
    .from(clientInvitations)
    .where(
      and(
        eq(clientInvitations.tenantId, tenantId),
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
    if (inviterName && inviterProfile) {
      return inviterProfile.userId;
    }
  }

  const [latestContractAdvisor] = await db
    .select({ advisorId: contracts.advisorId })
    .from(contracts)
    .where(
      and(
        eq(contracts.tenantId, tenantId),
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
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, latestContractAdvisor.advisorId))
      .limit(1);

    if (profile?.fullName?.trim()) {
      return profile.userId;
    }
  }

  const [fallbackAdvisor] = await db
    .select({
      userId: memberships.userId,
      fullName: userProfiles.fullName,
    })
    .from(memberships)
    .innerJoin(roles, eq(memberships.roleId, roles.id))
    .leftJoin(userProfiles, eq(userProfiles.userId, memberships.userId))
    .where(
      and(
        eq(memberships.tenantId, tenantId),
        eq(roles.tenantId, tenantId),
        eq(roles.name, "Advisor")
      )
    )
    .limit(1);

  return fallbackAdvisor?.userId ?? null;
}

export async function getAssignedAdvisorForClient(
  contactId: string
): Promise<ClientAdvisorInfo | null> {
  const auth = await requireAuthInAction();
  if (auth.roleName !== "Client" || auth.contactId !== contactId) {
    throw new Error("Forbidden");
  }

  const userId = await getTargetAdvisorUserIdForContact(auth.tenantId, contactId);
  if (!userId) return null;

  const [profile] = await db
    .select({
      userId: userProfiles.userId,
      fullName: userProfiles.fullName,
      email: userProfiles.email,
    })
    .from(userProfiles)
    .where(eq(userProfiles.userId, userId))
    .limit(1);

  if (!profile?.fullName?.trim()) return null;
  const name = profile.fullName.trim();
  return {
    userId: profile.userId,
    fullName: name,
    email: profile.email,
    initials: toInitials(name),
  };
}
