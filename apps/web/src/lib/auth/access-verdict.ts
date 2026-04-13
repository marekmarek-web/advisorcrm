import { db } from "db";
import { clientContacts, clientInvitations, memberships, roles } from "db";
import { eq, and, isNull, isNotNull } from "db";

/**
 * Deterministic access verdict for a contact's client zone state.
 * Single source of truth used by advisor UI, AI context, and apply orchestration.
 */
export type AccessVerdict =
  | "ACTIVE"           // client_contacts row + Client membership both exist
  | "INCONSISTENT"     // acceptedAt is set but client_contacts row is missing (broken state — needs repair)
  | "PASSWORD_PENDING" // acceptedAt set, client_contacts row exists, but passwordChangedAt is NULL
  | "PENDING"          // invite row exists, not expired, not revoked, acceptedAt is NULL
  | "NEVER_INVITED";   // no invite row at all for this contact

export type ComputedAccessVerdict = {
  verdict: AccessVerdict;
  /** Token of the first pending invite, if applicable. */
  pendingInviteToken?: string;
  /** Email from the invite row, if available. */
  inviteEmail?: string;
};

/**
 * Pure verdict computation from raw state — suitable for unit testing without DB.
 *
 * Rules (evaluated in priority order):
 * 1. client_contacts row + Client membership → ACTIVE
 * 2. acceptedAt set but client_contacts missing → INCONSISTENT
 * 3. acceptedAt set, client_contacts exists, passwordChangedAt NULL → PASSWORD_PENDING
 * 4. Pending invite (not expired, not revoked, acceptedAt NULL) → PENDING
 * 5. Otherwise → NEVER_INVITED
 *
 * Generic rule — does not depend on any document type, vendor, or filename.
 */
export function computeAccessVerdictFromState(state: {
  hasClientContactRow: boolean;
  hasClientMembership: boolean;
  invitations: Array<{
    acceptedAt: Date | null;
    revokedAt: Date | null;
    expiresAt: Date;
    passwordChangedAt: Date | null;
    token: string;
    email: string;
  }>;
  now?: Date;
}): ComputedAccessVerdict {
  const now = state.now ?? new Date();

  const acceptedInvite = state.invitations.find((inv) => inv.acceptedAt != null);

  // Evaluate accepted-invite branch before simple ACTIVE check,
  // because PASSWORD_PENDING is a sub-state that must surface even when membership exists.
  if (acceptedInvite) {
    if (!state.hasClientContactRow) {
      return { verdict: "INCONSISTENT" };
    }
    const acceptedWithoutPasswordChange = state.invitations.find(
      (inv) => inv.acceptedAt != null && inv.passwordChangedAt == null
    );
    if (acceptedWithoutPasswordChange) {
      return {
        verdict: "PASSWORD_PENDING",
        inviteEmail: acceptedWithoutPasswordChange.email,
      };
    }
    // acceptedAt set, client_contacts exists, passwordChangedAt set → ACTIVE
    return { verdict: "ACTIVE" };
  }

  if (state.hasClientContactRow && state.hasClientMembership) {
    return { verdict: "ACTIVE" };
  }

  const pendingInvite = state.invitations.find(
    (inv) =>
      inv.acceptedAt == null &&
      inv.revokedAt == null &&
      inv.expiresAt > now
  );
  if (pendingInvite) {
    return {
      verdict: "PENDING",
      pendingInviteToken: pendingInvite.token,
      inviteEmail: pendingInvite.email,
    };
  }

  return { verdict: "NEVER_INVITED" };
}

/**
 * Loads all relevant DB state for a contact and returns a deterministic access verdict.
 * Used by advisor UI, AI snapshot, and apply orchestration.
 */
export async function computeAccessVerdict(
  tenantId: string,
  contactId: string
): Promise<ComputedAccessVerdict> {
  const [ccRows, invitationRows] = await Promise.all([
    db
      .select({ id: clientContacts.id, userId: clientContacts.userId })
      .from(clientContacts)
      .where(and(eq(clientContacts.tenantId, tenantId), eq(clientContacts.contactId, contactId)))
      .limit(1),
    db
      .select({
        acceptedAt: clientInvitations.acceptedAt,
        revokedAt: clientInvitations.revokedAt,
        expiresAt: clientInvitations.expiresAt,
        passwordChangedAt: clientInvitations.passwordChangedAt,
        token: clientInvitations.token,
        email: clientInvitations.email,
      })
      .from(clientInvitations)
      .where(and(eq(clientInvitations.tenantId, tenantId), eq(clientInvitations.contactId, contactId))),
  ]);

  const cc = ccRows[0] ?? null;
  let hasClientMembership = false;

  if (cc?.userId) {
    const membershipRows = await db
      .select({ roleName: roles.name })
      .from(memberships)
      .innerJoin(roles, eq(memberships.roleId, roles.id))
      .where(and(eq(memberships.userId, cc.userId), eq(memberships.tenantId, tenantId)))
      .limit(1);
    hasClientMembership = membershipRows[0]?.roleName === "Client";
  }

  return computeAccessVerdictFromState({
    hasClientContactRow: cc != null,
    hasClientMembership,
    invitations: invitationRows.map((r) => ({
      acceptedAt: r.acceptedAt,
      revokedAt: r.revokedAt,
      expiresAt: r.expiresAt,
      passwordChangedAt: r.passwordChangedAt,
      token: r.token,
      email: r.email,
    })),
  });
}
