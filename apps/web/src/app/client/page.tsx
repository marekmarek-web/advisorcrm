import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts } from "db";
import { eq, and } from "db";
import { getContractsByContact } from "@/app/actions/contracts";
import { getDocumentsForClient } from "@/app/actions/documents";
import { getPaymentInstructionsForContact } from "@/app/actions/payment-pdf";
import { getClientRequests } from "@/app/actions/client-portal-requests";
import { ClientDashboardLayout } from "./ClientDashboardLayout";

export default async function ClientZonePage() {
  const auth = await requireAuth();
  if (auth.roleName !== "Client" || !auth.contactId) return null;

  const [contact] = await db
    .select({
      firstName: contacts.firstName,
      lastName: contacts.lastName,
      email: contacts.email,
      notificationUnsubscribedAt: contacts.notificationUnsubscribedAt,
    })
    .from(contacts)
    .where(and(eq(contacts.tenantId, auth.tenantId), eq(contacts.id, auth.contactId)))
    .limit(1);

  const isUnsubscribed = !!contact?.notificationUnsubscribedAt;

  const [contractsList, documentsList, paymentInstructions, requestsList] =
    await Promise.all([
      getContractsByContact(auth.contactId),
      getDocumentsForClient(auth.contactId),
      getPaymentInstructionsForContact(auth.contactId),
      getClientRequests(),
    ]);

  const openRequests = requestsList.filter((r) => r.statusKey !== "done");
  const hasAnyRequests = requestsList.length > 0;

  const banner = (
    <p className="rounded-xl border border-monday-blue/30 bg-monday-blue/5 px-4 py-3 text-sm text-monday-text">
      Zde uvidíte smlouvy, dokumenty, platební instrukce a požadavky. Vše na jednom místě. Máte-li dotaz, napište poradci nebo zadejte nový požadavek.
    </p>
  );

  return (
    <ClientDashboardLayout
      banner={banner}
      contact={contact ?? undefined}
      isUnsubscribed={isUnsubscribed}
      authContactId={auth.contactId}
      contractsList={contractsList}
      documentsList={documentsList}
      paymentInstructions={paymentInstructions}
      openRequests={openRequests}
      hasAnyRequests={hasAnyRequests}
    />
  );
}
