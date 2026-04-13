import Link from "next/link";
import { notFound } from "next/navigation";
import { getContact } from "@/app/actions/contacts";
import { getDocumentsForContact } from "@/app/actions/documents";
import { getReferralSummaryForContact } from "@/app/actions/referral";
import { InviteToClientZoneButton } from "./InviteToClientZoneButton";
import { ContractsSection } from "./ContractsSection";
import { DocumentsSection } from "./DocumentsSection";
import { SendPaymentPdfButton } from "./SendPaymentPdfButton";
import { ContactActivityTimeline } from "./ContactActivityTimeline";
import { ContactEventsSection } from "./ContactEventsSection";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { computeAccessVerdict } from "@/lib/auth/access-verdict";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await requireAuthInAction();
  const [contact, docList, referralSummary] = await Promise.all([
    getContact(id),
    getDocumentsForContact(id),
    getReferralSummaryForContact(id),
  ]);
  if (!contact) notFound();

  const accessVerdictResult = contact.email
    ? await computeAccessVerdict(auth.tenantId, id).catch(() => null)
    : null;
  const accessVerdict = accessVerdictResult?.verdict ?? "NEVER_INVITED";

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
          {contact.firstName} {contact.lastName}
        </h1>
        <div className="flex gap-2">
          <Link href={`/dashboard/contacts/${id}/summary`} className="rounded-xl px-4 py-2 text-sm font-semibold border border-[var(--brand-border)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]">
            Klientská zpráva (PDF)
          </Link>
          <Link href={`/dashboard/contacts/${id}/edit`} className="rounded-xl px-4 py-2 text-sm font-semibold text-white" style={{ backgroundColor: "var(--brand-main)" }}>
            Upravit
          </Link>
        </div>
      </div>
      <div className="rounded-xl border border-[var(--brand-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm space-y-3">
        <p><span className="text-[color:var(--wp-text-muted)]">E-mail:</span> {contact.email ?? "—"}</p>
        <p><span className="text-[color:var(--wp-text-muted)]">Telefon:</span> {contact.phone ?? "—"}</p>
        {contact.title ? <p><span className="text-[color:var(--wp-text-muted)]">Titul:</span> {contact.title}</p> : null}
        {(contact.nextServiceDue || contact.serviceCycleMonths) && (
          <p>
            <span className="text-[color:var(--wp-text-muted)]">Servisní cyklus:</span> {contact.serviceCycleMonths ?? "—"} měsíců
            {contact.nextServiceDue && (
              <> · <span className="text-[color:var(--wp-text-muted)]">Příští servis:</span> {contact.nextServiceDue}</>
            )}
          </p>
        )}
        {contact.gdprConsentAt && (
          <p><span className="text-[color:var(--wp-text-muted)]">Souhlas GDPR:</span> {new Date(contact.gdprConsentAt).toLocaleString("cs-CZ")}</p>
        )}
        {(contact.referralSource || contact.referralContactName) && (
          <p>
            <span className="text-[color:var(--wp-text-muted)]">Doporučení:</span>{" "}
            {[contact.referralSource, contact.referralContactName].filter(Boolean).join(" – ")}
            {contact.referralContactId && (
              <Link href={`/dashboard/contacts/${contact.referralContactId}`} className="ml-2 text-sm" style={{ color: "var(--brand-main)" }}>
                → kontakt
              </Link>
            )}
          </p>
        )}
        {referralSummary && (referralSummary.givenCount > 0 || !(contact.referralSource || contact.referralContactName)) && (
          <p>
            <span className="text-[color:var(--wp-text-muted)]">Doporučení od tohoto klienta:</span>{" "}
            {referralSummary.givenCount === 0
              ? "zatím nikoho nedoporučil"
              : `${referralSummary.givenCount} ${referralSummary.givenCount === 1 ? "kontakt" : referralSummary.givenCount < 5 ? "kontakty" : "kontaktů"}`}
            {referralSummary.givenCount > 0 && (
              <Link href={`/dashboard/contacts/new?referralContactId=${id}`} className="ml-2 text-sm" style={{ color: "var(--brand-main)" }}>
                Přidat doporučeného
              </Link>
            )}
          </p>
        )}
        {contact.email && (
          <div className="pt-2">
            <InviteToClientZoneButton contactId={id} verdict={accessVerdict} />
          </div>
        )}
      </div>
      <ContractsSection contactId={id} />
      <div className="rounded-xl border border-[var(--brand-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm">
        <h2 className="font-semibold text-[color:var(--wp-text)] mb-2">Platební instrukce</h2>
        <SendPaymentPdfButton contactId={id} />
      </div>
      <DocumentsSection contactId={id} />
      <ContactEventsSection contactId={id} />
      <ContactActivityTimeline contactId={id} />
      <Link href="/dashboard/contacts" className="text-sm font-medium" style={{ color: "var(--brand-main)" }}>
        ← Zpět na kontakty
      </Link>
    </div>
  );
}
