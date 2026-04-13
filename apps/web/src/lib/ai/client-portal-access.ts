import { computeAccessVerdict, type AccessVerdict } from "@/lib/auth/access-verdict";

export type ContactPortalAccessSnapshot = {
  /** Klient se umí přihlásit do klientské zóny (mapování user → kontakt). */
  hasLinkedUserAccount: boolean;
  /** Existuje přijatá pozvánka do klientské zóny. */
  hasAcceptedInvitation: boolean;
  /** Souhrn: propojený účet nebo přijatá pozvánka. */
  hasActiveClientPortal: boolean;
  /** Deterministický stav přístupu pro rozhodování v AI a advisor UI. */
  accessVerdict: AccessVerdict;
};

/**
 * Maps a deterministic AccessVerdict to the legacy snapshot flags.
 * Single rule set — verdict is source of truth; flags are derived.
 */
export function buildPortalAccessSnapshotFromVerdict(
  verdict: AccessVerdict
): ContactPortalAccessSnapshot {
  switch (verdict) {
    case "ACTIVE":
      return {
        hasLinkedUserAccount: true,
        hasAcceptedInvitation: true,
        hasActiveClientPortal: true,
        accessVerdict: verdict,
      };
    case "PASSWORD_PENDING":
      return {
        hasLinkedUserAccount: true,
        hasAcceptedInvitation: true,
        hasActiveClientPortal: true,
        accessVerdict: verdict,
      };
    case "INCONSISTENT":
      return {
        hasLinkedUserAccount: false,
        hasAcceptedInvitation: true,
        hasActiveClientPortal: false,
        accessVerdict: verdict,
      };
    case "PENDING":
      return {
        hasLinkedUserAccount: false,
        hasAcceptedInvitation: false,
        hasActiveClientPortal: false,
        accessVerdict: verdict,
      };
    case "NEVER_INVITED":
      return {
        hasLinkedUserAccount: false,
        hasAcceptedInvitation: false,
        hasActiveClientPortal: false,
        accessVerdict: verdict,
      };
  }
}

/**
 * Legacy compat shim — kept for callers that pass raw boolean state.
 * Prefer buildPortalAccessSnapshotFromVerdict for new code.
 */
export function buildPortalAccessSnapshotFromFlags(state: {
  hasClientContactRow: boolean;
  hasAcceptedInvitation: boolean;
}): ContactPortalAccessSnapshot {
  if (state.hasClientContactRow) {
    return buildPortalAccessSnapshotFromVerdict("ACTIVE");
  }
  if (state.hasAcceptedInvitation) {
    return buildPortalAccessSnapshotFromVerdict("INCONSISTENT");
  }
  return buildPortalAccessSnapshotFromVerdict("NEVER_INVITED");
}

/**
 * Načte stav přístupu klienta k portálu z `client_contacts`, `client_invitations` a `memberships`.
 * Používá computeAccessVerdict — deterministický verdict model.
 * Obecné pravidlo — žádná logika závislá na konkrétním dokumentu.
 */
export async function loadContactPortalAccessSnapshot(
  tenantId: string,
  contactId: string
): Promise<ContactPortalAccessSnapshot> {
  const { verdict } = await computeAccessVerdict(tenantId, contactId);
  return buildPortalAccessSnapshotFromVerdict(verdict);
}
