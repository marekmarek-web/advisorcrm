import Link from "next/link";
import { notFound } from "next/navigation";
import { getContact } from "@/app/actions/contacts";
import { ContractsSection } from "@/app/dashboard/contacts/[id]/ContractsSection";
import { DocumentsSection } from "@/app/dashboard/contacts/[id]/DocumentsSection";
import { InviteToClientZoneButton } from "@/app/dashboard/contacts/[id]/InviteToClientZoneButton";
import { SendPaymentPdfButton } from "@/app/dashboard/contacts/[id]/SendPaymentPdfButton";
import { ContactActivityTimeline } from "@/app/dashboard/contacts/[id]/ContactActivityTimeline";
import { ChatThread } from "@/app/components/ChatThread";
import { ClientFinancialSummary } from "@/app/components/contacts/ClientFinancialSummary";
import { ContactTabLayout } from "./ContactTabLayout";
import { ContactTasksAndEvents } from "./ContactTasksAndEvents";
import { ContactOpportunityBoard } from "./ContactOpportunityBoard";
import { ProductCoverageGrid, CoverageSummaryCard } from "@/app/components/contacts/ProductCoverageGrid";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const contact = await getContact(id);
  if (!contact) notFound();

  const overviewContent = (
    <div className="space-y-6 md:space-y-8">
      <CoverageSummaryCard contactId={id} />
      <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white shadow-sm overflow-hidden">
        <ProductCoverageGrid contactId={id} />
      </div>
      <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="text-sm font-bold text-slate-800 uppercase tracking-wider mb-4">Kontaktní údaje</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
          <p className="flex flex-col gap-0.5">
            <span className="text-slate-500 text-xs font-medium">E-mail</span>
            <span className="text-slate-800">{contact.email ?? "—"}</span>
          </p>
          <p className="flex flex-col gap-0.5">
            <span className="text-slate-500 text-xs font-medium">Telefon</span>
            <span className="text-slate-800">{contact.phone ?? "—"}</span>
          </p>
          {contact.title && (
            <p className="flex flex-col gap-0.5">
              <span className="text-slate-500 text-xs font-medium">Titul</span>
              <span className="text-slate-800">{contact.title}</span>
            </p>
          )}
          {contact.birthDate && (
            <p className="flex flex-col gap-0.5">
              <span className="text-slate-500 text-xs font-medium">Datum narození</span>
              <span className="text-slate-800">{contact.birthDate}</span>
            </p>
          )}
          {(contact.street || contact.city || contact.zip) && (
            <p className="flex flex-col gap-0.5 md:col-span-2">
              <span className="text-slate-500 text-xs font-medium">Adresa</span>
              <span className="text-slate-800">
                {[contact.street, [contact.city, contact.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
              </span>
            </p>
          )}
          {contact.lifecycleStage && (
            <p className="flex flex-col gap-0.5">
              <span className="text-slate-500 text-xs font-medium">Fáze</span>
              <span className="text-slate-800 capitalize">
                {contact.lifecycleStage === "former_client" ? "Bývalý klient" : contact.lifecycleStage === "client" ? "Klient" : contact.lifecycleStage}
              </span>
            </p>
          )}
          {contact.priority && (
            <p className="flex flex-col gap-0.5">
              <span className="text-slate-500 text-xs font-medium">Priorita</span>
              <span className="text-slate-800">
                {contact.priority === "low" ? "Nízká" : contact.priority === "normal" ? "Běžná" : contact.priority === "high" ? "Vysoká" : contact.priority === "urgent" ? "Urgentní" : contact.priority}
              </span>
            </p>
          )}
          {contact.tags && contact.tags.length > 0 && (
            <div className="flex flex-col gap-1.5 md:col-span-2">
              <span className="text-slate-500 text-xs font-medium">Štítky</span>
              <div className="flex items-center gap-1.5 flex-wrap">
                {contact.tags.map((tag) => (
                  <span key={tag} className="inline-block rounded-[var(--wp-radius-xs)] bg-blue-50 px-2.5 py-0.5 text-xs font-medium text-blue-600 border border-blue-100">
                    {tag}
                  </span>
                ))}
              </div>
            </div>
          )}
          {(contact.nextServiceDue || contact.serviceCycleMonths) && (
            <p className="flex flex-col gap-0.5 md:col-span-2">
              <span className="text-slate-500 text-xs font-medium">Servisní cyklus</span>
              <span className="text-slate-800">
                {contact.serviceCycleMonths ?? "—"} měsíců
                {contact.nextServiceDue && <> · Příští servis: {contact.nextServiceDue}</>}
              </span>
            </p>
          )}
          {contact.gdprConsentAt && (
            <p className="flex flex-col gap-0.5">
              <span className="text-slate-500 text-xs font-medium">Souhlas GDPR</span>
              <span className="text-slate-800">{new Date(contact.gdprConsentAt).toLocaleString("cs-CZ")}</span>
            </p>
          )}
          {(contact.referralSource || contact.referralContactName) && (
            <p className="flex flex-col gap-0.5 md:col-span-2">
              <span className="text-slate-500 text-xs font-medium">Doporučení</span>
              <span className="text-slate-800">
                {[contact.referralSource, contact.referralContactName].filter(Boolean).join(" – ")}
                {contact.referralContactId && (
                  <Link href={`/portal/contacts/${contact.referralContactId}`} className="ml-2 text-blue-600 hover:underline">
                    kontakt
                  </Link>
                )}
              </span>
            </p>
          )}
        </div>
        {contact.email && (
          <div className="mt-6 pt-4 border-t border-slate-100">
            <InviteToClientZoneButton contactId={id} />
          </div>
        )}
      </div>
    </div>
  );

  const smlouvyContent = (
    <div className="space-y-6 md:space-y-8">
      <ContractsSection contactId={id} />
      <ClientFinancialSummary contactId={id} />
      <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-2 text-sm">Platební instrukce</h2>
        <SendPaymentPdfButton contactId={id} />
      </div>
    </div>
  );

  const aktivitaContent = (
    <div className="space-y-6 md:space-y-8">
      <ContactActivityTimeline contactId={id} />
      <div className="rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white p-6 shadow-sm">
        <h2 className="font-semibold text-slate-800 mb-3 text-sm">Zprávy</h2>
        <ChatThread contactId={id} currentUserType="advisor" />
      </div>
    </div>
  );

  const tabs = [
    { id: "prehled" as const, label: "Přehled", content: overviewContent },
    { id: "smlouvy" as const, label: "Smlouvy", content: smlouvyContent },
    { id: "dokumenty" as const, label: "Dokumenty", content: <div className="space-y-6 md:space-y-8"><DocumentsSection contactId={id} /></div> },
    { id: "aktivita" as const, label: "Aktivita", content: aktivitaContent },
    { id: "ukoly" as const, label: "Úkoly a schůzky", content: <div className="space-y-6 md:space-y-8"><ContactTasksAndEvents contactId={id} /></div> },
    { id: "obchody" as const, label: "Obchody", content: <div className="space-y-6 md:space-y-8"><ContactOpportunityBoard contactId={id} /></div> },
  ];

  const initials = [contact.firstName, contact.lastName].map((s) => s?.charAt(0) ?? "").join("").toUpperCase() || "?";
  const statusBadge = (() => {
    if (contact.priority === "urgent" || contact.priority === "high") return { label: "Vysoká priorita", className: "bg-amber-100 text-amber-800 border-amber-200" };
    if (contact.lifecycleStage === "client") return { label: "Klient", className: "bg-blue-100 text-blue-800 border-blue-200" };
    if (contact.lifecycleStage === "lead") return { label: "Lead", className: "bg-slate-100 text-slate-700 border-slate-200" };
    if (contact.lifecycleStage === "prospect") return { label: "Prospect", className: "bg-emerald-100 text-emerald-800 border-emerald-200" };
    if (contact.lifecycleStage === "former_client") return { label: "Bývalý klient", className: "bg-slate-100 text-slate-500 border-slate-200" };
    if (contact.tags && contact.tags.length > 0) return { label: contact.tags[0], className: "bg-blue-50 text-blue-700 border-blue-100" };
    return null;
  })();

  return (
    <div className="min-h-screen bg-[#f4f7f9] pb-8">
      {/* Sticky client header */}
      <div className="sticky top-0 z-20 bg-white border-b border-slate-200 px-4 md:px-8 pt-4 md:pt-6 pb-0">
        <nav className="flex items-center text-xs font-bold text-slate-400 uppercase tracking-widest mb-4" aria-label="Breadcrumb">
          <Link href="/portal/contacts" className="hover:text-blue-600 transition-colors">Kontakty</Link>
          <span className="mx-2">/</span>
          <span className="text-slate-700 normal-case tracking-normal">{contact.firstName} {contact.lastName}</span>
        </nav>

        <div className="flex flex-wrap items-start justify-between gap-4 mb-6">
          <div className="flex items-center gap-4 md:gap-5">
            <div
              className="w-14 h-14 md:w-16 md:h-16 rounded-[var(--wp-radius-sm)] bg-gradient-to-br from-indigo-500 to-purple-600 flex items-center justify-center text-white font-bold text-xl md:text-2xl shadow-md shrink-0"
              aria-hidden
            >
              {contact.avatarUrl ? (
                <img src={contact.avatarUrl} alt="" className="w-full h-full object-cover rounded-[var(--wp-radius-sm)]" />
              ) : (
                initials
              )}
            </div>
            <div>
              <div className="flex items-center gap-3 mb-1 flex-wrap">
                <h1 className="text-2xl md:text-3xl font-extrabold text-slate-900 tracking-tight">
                  {contact.firstName} {contact.lastName}
                </h1>
                {statusBadge && (
                  <span className={`px-2.5 py-1 rounded-[var(--wp-radius-xs)] text-[10px] font-bold uppercase tracking-wider border ${statusBadge.className}`}>
                    {statusBadge.label}
                  </span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-3 md:gap-4 text-sm font-medium text-slate-500">
                {contact.email && (
                  <a href={`mailto:${contact.email}`} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z" /><polyline points="22,6 12,13 2,6" /></svg>
                    {contact.email}
                  </a>
                )}
                {contact.phone && (
                  <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="flex items-center gap-1.5 hover:text-blue-600 transition-colors">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 16.92v3a2 2 0 0 1-2.18 2 19.79 19.79 0 0 1-8.63-3.07 19.5 19.5 0 0 1-6-6 19.79 19.79 0 0 1-3.07-8.67A2 2 0 0 1 4.11 2h3a2 2 0 0 1 2 1.72 12.84 12.84 0 0 0 .7 2.81 2 2 0 0 1-.45 2.11L8.09 9.91a16 16 0 0 0 6 6l1.27-1.27a2 2 0 0 1 2.11-.45 12.84 12.84 0 0 0 2.81.7A2 2 0 0 1 22 16.92z" /></svg>
                    {contact.phone}
                  </a>
                )}
              </div>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <Link
              href={`/portal/mindmap?contactId=${id}`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-[var(--wp-radius-sm)] text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
            >
              Strategická mapa
            </Link>
            <Link
              href={`/portal/contacts/${id}/summary`}
              className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-[var(--wp-radius-sm)] text-sm font-bold shadow-sm hover:bg-slate-50 transition-colors"
            >
              <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
              Client Summary
            </Link>
            <Link
              href={`/portal/contacts/${id}/edit`}
              className="flex items-center gap-2 px-5 py-2 bg-[#1a1c2e] text-white rounded-[var(--wp-radius-sm)] text-sm font-bold shadow-md hover:bg-[#2a2d4a] hover:-translate-y-0.5 transition-all"
            >
              Upravit
            </Link>
          </div>
        </div>

        <ContactTabLayout tabs={tabs} defaultTab="prehled" />
      </div>
    </div>
  );
}
