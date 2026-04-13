import { db } from "db";
import { clientContacts, clientInvitations } from "db";
import { eq, and } from "db";

export type ContactPortalAccessSnapshot = {
  /** Klient se umí přihlásit do klientské zóny (mapování user → kontakt). */
  hasLinkedUserAccount: boolean;
  /** Existuje přijatá pozvánka do klientské zóny. */
  hasAcceptedInvitation: boolean;
  /** Souhrn: propojený účet nebo přijatá pozvánka. */
  hasActiveClientPortal: boolean;
};

/** Čistá pravidla — vhodné pro unit testy (bez DB). */
export function buildPortalAccessSnapshotFromFlags(state: {
  hasClientContactRow: boolean;
  hasAcceptedInvitation: boolean;
}): ContactPortalAccessSnapshot {
  if (state.hasClientContactRow) {
    return {
      hasLinkedUserAccount: true,
      hasAcceptedInvitation: true,
      hasActiveClientPortal: true,
    };
  }
  return {
    hasLinkedUserAccount: false,
    hasAcceptedInvitation: state.hasAcceptedInvitation,
    hasActiveClientPortal: state.hasAcceptedInvitation,
  };
}

/**
 * Načte stav přístupu klienta k portálu z `client_contacts` a `client_invitations`.
 * Obecné pravidlo — žádná logika závislá na konkrétním dokumentu.
 */
export async function loadContactPortalAccessSnapshot(
  tenantId: string,
  contactId: string
): Promise<ContactPortalAccessSnapshot> {
  const [cc] = await db
    .select({ id: clientContacts.id })
    .from(clientContacts)
    .where(and(eq(clientContacts.tenantId, tenantId), eq(clientContacts.contactId, contactId)))
    .limit(1);

  if (cc) {
    return buildPortalAccessSnapshotFromFlags({ hasClientContactRow: true, hasAcceptedInvitation: true });
  }

  const invRows = await db
    .select({ acceptedAt: clientInvitations.acceptedAt })
    .from(clientInvitations)
    .where(and(eq(clientInvitations.tenantId, tenantId), eq(clientInvitations.contactId, contactId)));

  const hasAcceptedInvitation = invRows.some((r) => r.acceptedAt != null);
  return buildPortalAccessSnapshotFromFlags({ hasClientContactRow: false, hasAcceptedInvitation });
}
