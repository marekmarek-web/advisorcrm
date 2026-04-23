"use server";

import { withAuthContext, withTenantContextFromAuth } from "@/lib/auth/with-auth-context";
import { db } from "db";
import { clientInvitations, contracts, memberships, roles, userProfiles } from "db";
import { and, desc, eq, inArray, isNotNull, isNull } from "db";
import { aggregatePortfolioMetrics } from "@/lib/client-portfolio/read-model";
import {
  resolveSegmentForPaymentSetup,
  premiumFieldsFromAmountAndFrequency,
} from "@/lib/client-portfolio/payment-setup-portfolio-synth";
import { selectStandalonePaymentSetupsForClientContact } from "@/lib/client-portfolio/standalone-payment-setups-query";

/** Drizzle `db` nebo tx z `withTenantContext` — strukturálně kompatibilní `select` API. */
type ContractReader = Pick<typeof db, "select">;

type DashboardMetricSummary = {
  /**
   * Přibližná výše spravovaných investičních aktiv (INV/DIP/DPS) z publikovaného portfolia.
   *
   * Pravidla:
   * - Jednorázová investice (`paymentType === "one_time"`): použije se `premium_amount`
   *   jako jistina (NIKDY × 12 — to by jednorázovou částku 1 mil. Kč propsalo jako 12 mil. Kč).
   * - Pravidelná investice: prefer `portfolioAttributes.intendedInvestment` (celková plánovaná
   *   investice za celou dobu), jinak roční ekvivalent (monthly × 12) jako hrubý proxy.
   * - Ukončené smlouvy (`portfolio_status = 'ended'`) se nepočítají.
   */
  assetsUnderManagement: number;
  monthlyInvestments: number;
  /** Součet měsíčních pojistných z publikovaného portfolia */
  monthlyInsurancePremiums: number;
  activeContractCount: number;
};

/** Bezpečný parser — toleruje české formáty typu "980 392 Kč" i lokalizované desetinné čárky. */
function parseAmountLoose(raw: unknown): number {
  if (raw == null) return 0;
  if (typeof raw === "number") return Number.isFinite(raw) ? raw : 0;
  const s = String(raw).replace(/\s|Kč|CZK|EUR|USD/gi, "").replace(/,/g, ".").trim();
  if (!s) return 0;
  const n = Number(s);
  return Number.isFinite(n) ? n : 0;
}

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
  return withAuthContext(async (auth, tx) => {
    if (auth.roleName !== "Client" || auth.contactId !== contactId) {
      throw new Error("Forbidden");
    }
    const contractRows = await tx
      .select({
        segment: contracts.segment,
        premiumAmount: contracts.premiumAmount,
        premiumAnnual: contracts.premiumAnnual,
        portfolioAttributes: contracts.portfolioAttributes,
        portfolioStatus: contracts.portfolioStatus,
        contractNumber: contracts.contractNumber,
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

    const numSet = new Set(
      contractRows.map((c) => c.contractNumber?.trim()).filter((n): n is string => !!n)
    );
    const standalonePayments = await selectStandalonePaymentSetupsForClientContact(tx, {
      tenantId: auth.tenantId,
      contactIds: [contactId],
      contractNumbersWithPublishedRows: numSet,
    });

    const contractMetrics = contractRows.map((r) => ({
      segment: r.segment,
      premiumAmount: r.premiumAmount != null ? String(r.premiumAmount) : null,
      premiumAnnual: r.premiumAnnual != null ? String(r.premiumAnnual) : null,
      portfolioAttributes: (r.portfolioAttributes ?? {}) as Record<string, unknown>,
      portfolioStatus: r.portfolioStatus,
    }));

    const paymentMetrics = standalonePayments.map((ps) => {
      const seg = resolveSegmentForPaymentSetup(ps);
      const { premiumAmount, premiumAnnual, portfolioAttributes } = premiumFieldsFromAmountAndFrequency(
        ps.amount != null ? String(ps.amount) : null,
        ps.frequency,
        ps.paymentType
      );
      return {
        segment: seg,
        premiumAmount,
        premiumAnnual,
        portfolioAttributes: portfolioAttributes as Record<string, unknown>,
        portfolioStatus: "active" as const,
      };
    });

    const agg = aggregatePortfolioMetrics([...contractMetrics, ...paymentMetrics]);

    const investmentSegments = new Set(["INV", "DIP", "DPS"]);
    let assetsUnderManagement = 0;
    for (const contract of contractRows) {
      if (contract.portfolioStatus === "ended") continue;
      if (!investmentSegments.has(contract.segment)) continue;

      const attrs = (contract.portfolioAttributes ?? {}) as Record<string, unknown>;
      const paymentType = typeof attrs.paymentType === "string" ? attrs.paymentType : null;

      if (paymentType === "one_time") {
        const lump = Number(contract.premiumAmount ?? 0);
        if (Number.isFinite(lump) && lump > 0) assetsUnderManagement += lump;
        continue;
      }

      const intended =
        parseAmountLoose(attrs.intendedInvestment) ||
        parseAmountLoose(attrs.investmentAmount) ||
        parseAmountLoose(attrs.targetAmount);
      if (intended > 0) {
        assetsUnderManagement += intended;
        continue;
      }

      const monthly = Number(contract.premiumAmount ?? 0);
      const annual = Number(contract.premiumAnnual ?? 0);
      const normalizedAnnual = annual > 0 ? annual : monthly * 12;
      if (Number.isFinite(normalizedAnnual) && normalizedAnnual > 0) {
        assetsUnderManagement += normalizedAnnual;
      }
    }

    for (const ps of standalonePayments) {
      const seg = resolveSegmentForPaymentSetup(ps);
      if (!investmentSegments.has(seg)) continue;
      const { premiumAmount, premiumAnnual, portfolioAttributes } = premiumFieldsFromAmountAndFrequency(
        ps.amount != null ? String(ps.amount) : null,
        ps.frequency,
        ps.paymentType
      );
      const attrs = portfolioAttributes as Record<string, unknown>;
      const paymentType = typeof attrs.paymentType === "string" ? attrs.paymentType : null;
      if (paymentType === "one_time") {
        const lump = Number(premiumAmount ?? 0);
        if (Number.isFinite(lump) && lump > 0) assetsUnderManagement += lump;
        continue;
      }
      const intended =
        parseAmountLoose(attrs.intendedInvestment) ||
        parseAmountLoose(attrs.investmentAmount) ||
        parseAmountLoose(attrs.targetAmount);
      if (intended > 0) {
        assetsUnderManagement += intended;
        continue;
      }
      const monthly = Number(premiumAmount ?? 0);
      const annual = Number(premiumAnnual ?? 0);
      const normalizedAnnual = annual > 0 ? annual : monthly * 12;
      if (Number.isFinite(normalizedAnnual) && normalizedAnnual > 0) {
        assetsUnderManagement += normalizedAnnual;
      }
    }

    return {
      assetsUnderManagement: Math.round(assetsUnderManagement),
      monthlyInvestments: agg.monthlyInvestments,
      monthlyInsurancePremiums: agg.monthlyInsurancePremiums,
      activeContractCount: agg.activeContractCount,
    };
  });
}

/**
 * Vnitřní varianta pro volání uvnitř existující tenant transakce (čistý `tx` reader).
 * Nepoužívá `withTenantContext` sama, protože caller už GUCs nastavil.
 */
async function loadTargetAdvisorUserIdForContact(
  reader: ContractReader,
  tenantId: string,
  contactId: string,
): Promise<string | null> {
  const [latestAcceptedInvite] = await reader
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
    const [inviterProfile] = await reader
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

  const [latestContractAdvisor] = await reader
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
    const [profile] = await reader
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

  const [fallbackAdvisor] = await reader
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

/**
 * Určí userId poradce pro kontakt (stejná priorita jako getAssignedAdvisorForClient), bez role Client — pro serverové notifikace.
 *
 * Tato funkce pracuje s externě předaným `tenantId` a používá se i v kontextech,
 * kde uživatel ještě nemá vyřešený session (cron / interní notifikace).
 * Pro swap readiness spouštíme query v tx s GUC `app.tenant_id` nastaveným.
 */
export async function getTargetAdvisorUserIdForContact(
  tenantId: string,
  contactId: string
): Promise<string | null> {
  return withTenantContextFromAuth({ tenantId }, (tx) =>
    loadTargetAdvisorUserIdForContact(tx, tenantId, contactId)
  );
}

export async function getAssignedAdvisorForClient(
  contactId: string
): Promise<ClientAdvisorInfo | null> {
  const profile = await withAuthContext(async (auth, tx) => {
    if (auth.roleName !== "Client" || auth.contactId !== contactId) {
      throw new Error("Forbidden");
    }

    const userId = await loadTargetAdvisorUserIdForContact(tx, auth.tenantId, contactId);
    if (!userId) return null;

    const [row] = await tx
      .select({
        userId: userProfiles.userId,
        fullName: userProfiles.fullName,
        email: userProfiles.email,
      })
      .from(userProfiles)
      .where(eq(userProfiles.userId, userId))
      .limit(1);
    return row ?? null;
  });

  if (!profile?.fullName?.trim()) return null;
  const name = profile.fullName.trim();
  return {
    userId: profile.userId,
    fullName: name,
    email: profile.email,
    initials: toInitials(name),
  };
}
