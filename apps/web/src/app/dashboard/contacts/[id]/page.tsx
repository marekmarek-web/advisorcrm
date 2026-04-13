import Link from "next/link";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { getContact, getContactAiProvenance } from "@/app/actions/contacts";
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
import { resolveContactIdentityFieldProvenance } from "@/lib/portal/contact-identity-field-provenance";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { resolveIdentityCompleteness, buildIncompleteMessage } from "@/app/portal/contacts/[id]/contact-identity-completeness-logic";

const DynamicContactOpportunityBoard = dynamic(
  () =>
    import("@/app/components/pipeline/ContactOpportunityBoard").then((m) => m.ContactOpportunityBoard),
  {
    loading: () => (
      <div className="min-h-[280px] animate-pulse rounded-xl border border-[var(--brand-border)] bg-[color:var(--wp-surface-muted)]/50" />
    ),
  },
);

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const auth = await requireAuthInAction();
  const [contact, docList, referralSummary, provenance] = await Promise.all([
    getContact(id),
    getDocumentsForContact(id),
    getReferralSummaryForContact(id),
    getContactAiProvenance(id),
  ]);
  if (!contact) notFound();

  const accessVerdictResult = contact.email
    ? await computeAccessVerdict(auth.tenantId, id).catch(() => null)
    : null;
  const accessVerdict = accessVerdictResult?.verdict ?? "NEVER_INVITED";

  const canReadOpportunities = hasPermission(auth.roleName as RoleName, "opportunities:read");
  const canWriteOpportunities = hasPermission(auth.roleName as RoleName, "opportunities:write");

  const provForDeals = provenance
    ? {
        reviewId: provenance.reviewId,
        confirmedFields: provenance.confirmedFields,
        autoAppliedFields: provenance.autoAppliedFields,
        pendingFields: provenance.pendingFields,
      }
    : null;
  const identityRowsDeals = resolveIdentityCompleteness(
    {
      birthDate: contact.birthDate,
      personalId: contact.personalId,
      idCardNumber: contact.idCardNumber,
      street: contact.street,
      city: contact.city,
      zip: contact.zip,
      email: contact.email,
      phone: contact.phone,
    },
    provForDeals,
  );
  const identityAdvisoryNoteDeals = identityRowsDeals.some((r) => r.status !== "ok")
    ? buildIncompleteMessage(identityRowsDeals)
    : null;

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
      {/* Identity summary card */}
      <div className="rounded-xl border border-[var(--brand-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm space-y-3">
        <div className="flex items-center justify-between mb-1">
          <h2 className="font-semibold text-[color:var(--wp-text)]">Identifikační údaje</h2>
          <Link href={`/dashboard/contacts/${id}/edit`} className="text-xs font-medium" style={{ color: "var(--brand-main)" }}>
            Upravit
          </Link>
        </div>
        {[
          { key: "birthDate", label: "Datum narození", value: contact.birthDate },
          { key: "personalId", label: "Rodné číslo", value: contact.personalId },
          { key: "idCardNumber", label: "Číslo dokladu (OP/pas)", value: contact.idCardNumber },
        ].map(({ key, label, value }) => {
          const prov = resolveContactIdentityFieldProvenance(key, provenance);
          const displayValue = value?.trim() || null;
          return (
            <p key={key}>
              <span className="text-[color:var(--wp-text-muted)]">{label}:</span>{" "}
              {displayValue ? (
                <>
                  {displayValue}
                  {prov && (
                    <span className="ml-2 text-xs text-[color:var(--wp-text-muted)]">
                      {prov.kind === "confirmed" && "· ověřeno"}
                      {prov.kind === "auto_applied" && "· z AI Review"}
                      {prov.kind === "pending_review" && "· čeká na potvrzení"}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[color:var(--wp-text-muted)] italic">
                  {prov?.kind === "pending_review" ? "čeká na potvrzení z AI Review" : "nevyplněno"}
                  {" · "}
                  <Link href={`/dashboard/contacts/${id}/edit`} className="text-xs underline" style={{ color: "var(--brand-main)" }}>
                    Doplnit
                  </Link>
                </span>
              )}
            </p>
          );
        })}
        {/* Adresa */}
        {(() => {
          const parts = [contact.street, contact.city, contact.zip].filter(Boolean);
          const addressProv = resolveContactIdentityFieldProvenance("street", provenance);
          return (
            <p>
              <span className="text-[color:var(--wp-text-muted)]">Adresa:</span>{" "}
              {parts.length > 0 ? (
                <>
                  {parts.join(", ")}
                  {addressProv && (
                    <span className="ml-2 text-xs text-[color:var(--wp-text-muted)]">
                      {addressProv.kind === "confirmed" && "· ověřeno"}
                      {addressProv.kind === "auto_applied" && "· z AI Review"}
                      {addressProv.kind === "pending_review" && "· čeká na potvrzení"}
                    </span>
                  )}
                </>
              ) : (
                <span className="text-[color:var(--wp-text-muted)] italic">
                  nevyplněno{" · "}
                  <Link href={`/dashboard/contacts/${id}/edit`} className="text-xs underline" style={{ color: "var(--brand-main)" }}>
                    Doplnit
                  </Link>
                </span>
              )}
            </p>
          );
        })()}
      </div>

      <div className="rounded-xl border border-[var(--brand-border)] bg-[color:var(--wp-surface)] shadow-sm overflow-hidden">
        <div className="px-6 py-4 border-b border-[var(--brand-border)]">
          <h2 className="font-semibold text-[color:var(--wp-text)]">Obchody</h2>
          <p className="text-xs text-[color:var(--wp-text-muted)] mt-0.5">Obchodní případy navázané na klienta — stejná nástěnka jako v detailu v portálu.</p>
        </div>
        <div className="min-h-[240px]">
          {canReadOpportunities ? (
            <DynamicContactOpportunityBoard
              contactId={id}
              contactFirstName={contact.firstName}
              contactLastName={contact.lastName}
              pipelineSettingsHref="/dashboard/pipeline"
              identityAdvisoryNote={identityAdvisoryNoteDeals}
              canWriteOpportunities={canWriteOpportunities}
            />
          ) : (
            <div className="p-6 text-sm text-[color:var(--wp-text-muted)]">
              <p>
                Nemáte oprávnění zobrazit obchody tohoto klienta. Požádejte správce o oprávnění „Obchody — čtení“.
              </p>
            </div>
          )}
        </div>
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
