import Link from "next/link";
import { segmentLabel } from "@/app/lib/segment-labels";
import { ClientZoneExportButton } from "./ClientZoneExportButton";

export type ClientDashboardLayoutProps = {
  banner: React.ReactNode;
  contact: { firstName: string; lastName: string; email: string | null } | undefined;
  isUnsubscribed: boolean;
  authContactId: string;
  contractsList: { id: string; segment: string; partnerName: string | null; productName: string | null; premiumAmount: string | null; contractNumber: string | null; startDate: string | null; anniversaryDate: string | null }[];
  documentsList: { id: string; name: string; createdAt: Date; mimeType: string | null; tags: string[] | null }[];
  paymentInstructions: { segment: string; partnerName: string; productName: string | null; contractNumber: string | null; accountNumber: string; bank: string | null; note: string | null }[];
  openRequests: { id: string; title: string; statusLabel: string }[];
  hasAnyRequests: boolean;
};

export function ClientDashboardLayout(props: ClientDashboardLayoutProps) {
  const { banner, contact, isUnsubscribed, authContactId, contractsList, documentsList, paymentInstructions, openRequests, hasAnyRequests } = props;
  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {banner}
      <h1 className="text-xl font-semibold text-monday-text">
        Vítejte v klientském portálu
      </h1>
      {contact && (
        <p className="text-monday-text-muted">
          Přihlášen jako {contact.firstName} {contact.lastName}
          {contact.email ? ` (${contact.email})` : ""}.
        </p>
      )}

      <div className="flex flex-wrap gap-3">
        <Link
          href="/client/requests/new"
          className="inline-flex items-center justify-center rounded-[var(--wp-radius-sm)] bg-monday-blue px-4 py-2.5 text-sm font-medium text-white hover:opacity-90 transition-opacity min-h-[44px] min-w-[44px]"
        >
          Mám nový požadavek
        </Link>
        <Link
          href="/client/messages"
          className="inline-flex items-center justify-center rounded-[var(--wp-radius-sm)] border border-monday-border bg-monday-surface px-4 py-2.5 text-sm font-medium text-monday-text hover:bg-monday-row-hover transition-colors min-h-[44px] min-w-[44px]"
        >
          Napsat zprávu poradci
        </Link>
      </div>

      <section className="rounded-xl border border-monday-border bg-monday-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-monday-text">Moje smlouvy</h2>
          <Link href="/client/contracts" className="text-sm text-monday-blue font-medium hover:underline">
            Zobrazit vše →
          </Link>
        </div>
        {contractsList.length === 0 ? (
          <>
            <p className="text-monday-text-muted text-sm">
              Zatím nemáte evidované smlouvy. Vše doplní váš poradce.
            </p>
            <Link href="/client/messages" className="mt-2 inline-block text-sm text-monday-blue font-medium hover:underline">
              Napsat poradci →
            </Link>
          </>
        ) : (
          <p className="text-sm text-monday-text-muted">
            Celkem {contractsList.length} {contractsList.length === 1 ? "smlouva" : contractsList.length < 5 ? "smlouvy" : "smluv"}.
          </p>
        )}
      </section>

      <section className="rounded-xl border border-monday-border bg-monday-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-monday-text">Platební instrukce</h2>
          <Link href="/client/payments" className="text-sm text-monday-blue font-medium hover:underline">
            Zobrazit vše →
          </Link>
        </div>
        {paymentInstructions.length === 0 ? (
          <>
            <p className="text-monday-text-muted text-sm">
              Platební údaje připravujeme. Pro detail kontaktujte poradce.
            </p>
            <Link href="/client/messages" className="mt-2 inline-block text-sm text-monday-blue font-medium hover:underline">
              Napsat poradci →
            </Link>
          </>
        ) : (
          <ul className="space-y-2 text-sm">
            {paymentInstructions.slice(0, 3).map((i, idx) => (
              <li key={idx} className="border-l-2 border-monday-border pl-2">
                {segmentLabel(i.segment)} – {i.partnerName}
                <br />
                <span className="text-monday-text-muted">
                  Účet: {i.accountNumber}
                  {i.bank ? `, ${i.bank}` : ""}
                  {i.contractNumber && <> · č. smlouvy: {i.contractNumber}</>}
                </span>
              </li>
            ))}
            {paymentInstructions.length > 3 && (
              <li className="text-monday-text-muted text-sm">
                … a dalších {paymentInstructions.length - 3} položek
              </li>
            )}
          </ul>
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
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-monday-text">Moje požadavky</h2>
          <Link href="/client/requests" className="text-sm text-monday-blue font-medium hover:underline">
            Zobrazit vše →
          </Link>
        </div>
        {!hasAnyRequests ? (
          <>
            <p className="text-monday-text-muted text-sm">Nemáte žádné aktivní požadavky.</p>
            <Link href="/client/requests/new" className="mt-2 inline-block text-sm text-monday-blue font-medium hover:underline">
              Mám nový požadavek →
            </Link>
          </>
        ) : openRequests.length === 0 ? (
          <p className="text-sm text-monday-text-muted">Všechny vaše požadavky jsou dokončené.</p>
        ) : (
          <ul className="space-y-2 text-sm">
            {openRequests.slice(0, 3).map((r) => (
              <li key={r.id} className="flex justify-between gap-2">
                <span className="text-monday-text truncate">{r.title}</span>
                <span className="shrink-0 rounded bg-monday-blue/10 px-2 py-0.5 text-xs text-monday-blue">
                  {r.statusLabel}
                </span>
              </li>
            ))}
            {openRequests.length > 3 && (
              <li className="text-monday-text-muted text-sm">
                … a dalších {openRequests.length - 3} požadavků
              </li>
            )}
          </ul>
        )}
      </section>

      <section className="rounded-xl border border-monday-border bg-monday-surface p-4">
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold text-monday-text">Zprávy</h2>
          <Link href="/client/messages" className="text-sm text-monday-blue font-medium hover:underline">
            Otevřít →
          </Link>
        </div>
        <p className="text-sm text-monday-text-muted">
          Komunikujte se svým poradcem bezpečně. Napište zprávu nebo si přečtěte historii.
        </p>
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
            href={`/client/unsubscribe?contactId=${authContactId}`}
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
