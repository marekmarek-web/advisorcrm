import Link from "next/link";
import { requireAuth } from "@/lib/auth/require-auth";
import { db } from "db";
import { contacts } from "db";
import { eq, and } from "db";
import { getContractsByContact } from "@/app/actions/contracts";
import { getDocumentsForClient } from "@/app/actions/documents";
import { getPaymentInstructionsForContact } from "@/app/actions/payment-pdf";
import { segmentLabel } from "@/app/lib/segment-labels";
import { ClientZoneExportButton } from "./ClientZoneExportButton";

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

  const [contractsList, documentsList, paymentInstructions] = await Promise.all([
    getContractsByContact(auth.contactId),
    getDocumentsForClient(auth.contactId),
    getPaymentInstructionsForContact(auth.contactId),
  ]);

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      <h1 className="text-xl font-semibold text-monday-text">
        Vítejte v Client Zone
      </h1>
      {contact && (
        <p className="text-monday-text-muted">
          Přihlášen jako {contact.firstName} {contact.lastName}
          {contact.email ? ` (${contact.email})` : ""}.
        </p>
      )}

      <section className="rounded-xl border border-monday-border bg-monday-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-monday-text">Moje smlouvy</h2>
          <Link href="/client/contracts" className="text-sm text-monday-blue font-medium hover:underline">
            Zobrazit vše →
          </Link>
        </div>
        {contractsList.length === 0 ? (
          <p className="text-monday-text-muted text-sm">Žádné smlouvy.</p>
        ) : (
          <p className="text-sm text-monday-text-muted">
            Celkem {contractsList.length} {contractsList.length === 1 ? "smlouva" : contractsList.length < 5 ? "smlouvy" : "smluv"}.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-monday-border bg-monday-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-monday-text">Dokumenty</h2>
          <Link href="/client/documents" className="text-sm text-monday-blue font-medium hover:underline">
            Zobrazit vše →
          </Link>
        </div>
        {documentsList.length === 0 ? (
          <p className="text-monday-text-muted text-sm">Žádné dokumenty ke stažení.</p>
        ) : (
          <p className="text-sm text-monday-text-muted">
            {documentsList.length} {documentsList.length === 1 ? "dokument" : documentsList.length < 5 ? "dokumenty" : "dokumentů"} ke stažení.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-monday-border bg-monday-surface p-4">
        <h2 className="font-semibold text-monday-text mb-2">Platební instrukce</h2>
        {paymentInstructions.length === 0 ? (
          <p className="text-monday-text-muted text-sm">Žádné platební údaje.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {paymentInstructions.map((i, idx) => (
              <li key={idx} className="border-l-2 border-monday-border pl-2">
                {segmentLabel(i.segment)} – {i.partnerName}
                <br />
                Účet: {i.accountNumber}{i.bank ? `, ${i.bank}` : ""}
                {i.contractNumber && <> · č. smlouvy: {i.contractNumber}</>}
              </li>
            ))}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-monday-border bg-monday-surface p-4">
        <h2 className="font-semibold text-monday-text mb-2">E-mailová oznámení</h2>
        <p className="text-sm text-monday-text-muted mb-2">
          {isUnsubscribed
            ? "Odeslali jste žádost o odhlášení z e-mailových notifikací. Nebudete dostávat žádná upozornění."
            : "Dostáváte e-mailová upozornění o servisních připomínkách, nových dokumentech a platebních instrukcích."}
        </p>
        {!isUnsubscribed && (
          <Link
            href={`/client/unsubscribe?contactId=${auth.contactId}`}
            className="text-sm text-red-600 font-medium hover:underline"
          >
            Odhlásit se z notifikací
          </Link>
        )}
        {isUnsubscribed && (
          <p className="text-xs text-monday-text-muted">
            Pro obnovení notifikací kontaktujte svého poradce.
          </p>
        )}
      </section>

      <div className="flex flex-wrap gap-4">
        <ClientZoneExportButton />
        <Link href="/gdpr" className="text-sm text-monday-blue font-medium">
          Ochrana osobních údajů (GDPR)
        </Link>
      </div>
    </div>
  );
}
