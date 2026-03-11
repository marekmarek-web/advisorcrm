import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
  FileText,
  Mail,
  Phone,
  MapPin,
  Calendar,
  MessageSquare,
} from "lucide-react";
import { getContact } from "@/app/actions/contacts";
import { getHouseholdForContact } from "@/app/actions/households";
import { ContractsSection } from "@/app/dashboard/contacts/[id]/ContractsSection";
import { DocumentsSection } from "@/app/dashboard/contacts/[id]/DocumentsSection";
import { InviteToClientZoneButton } from "@/app/dashboard/contacts/[id]/InviteToClientZoneButton";
import { SendPaymentPdfButton } from "@/app/dashboard/contacts/[id]/SendPaymentPdfButton";
import { ContactActivityTimeline } from "@/app/dashboard/contacts/[id]/ContactActivityTimeline";
import { ChatThread } from "@/app/components/ChatThread";
import { ClientFinancialSummary } from "@/app/components/contacts/ClientFinancialSummary";
import { ComplianceSection } from "@/app/components/contacts/ComplianceSection";
import { ContactTabLayout } from "./ContactTabLayout";
import { ContactTasksAndEvents } from "./ContactTasksAndEvents";
import { ContactOpportunityBoard } from "./ContactOpportunityBoard";
import { ContactHouseholdCard } from "./ContactHouseholdCard";
import { ContactOpenTasksPreview } from "./ContactOpenTasksPreview";
import { ContactNotesSection } from "./ContactNotesSection";
import { ContactOverviewKpi } from "./ContactOverviewKpi";
import { ContactLastNotePreview } from "./ContactLastNotePreview";
import { ContactProductsPreview } from "./ContactProductsPreview";
import { ContactAiAnalysisCard } from "./ContactAiAnalysisCard";
import { ClientCoverageWidget } from "@/app/components/contacts/ClientCoverageWidget";
import { ContactFinancialAnalysesSection } from "@/app/dashboard/contacts/[id]/ContactFinancialAnalysesSection";

export default async function ContactDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [contact, household] = await Promise.all([
    getContact(id),
    getHouseholdForContact(id),
  ]);
  if (!contact) notFound();

  const overviewContent = (
    <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
      <div className="xl:col-span-2 space-y-6">
        <ClientCoverageWidget contactId={id} />
        <ContactOverviewKpi contactId={id} />
        <ContactLastNotePreview contactId={id} />
        <ContactProductsPreview contactId={id} />
        <ContactFinancialAnalysesSection contactId={id} />
        <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-slate-50">
            <h2 className="text-lg font-black text-slate-900">Kontaktní údaje</h2>
          </div>
          <div className="p-6">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4 text-sm">
              <p className="flex flex-col gap-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">E-mail</span>
                <span className="text-slate-800">{contact.email ?? "—"}</span>
              </p>
              <p className="flex flex-col gap-0.5">
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Telefon</span>
                <span className="text-slate-800">{contact.phone ?? "—"}</span>
              </p>
              {contact.title && (
                <p className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Titul</span>
                  <span className="text-slate-800">{contact.title}</span>
                </p>
              )}
              {contact.birthDate && (
                <p className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Datum narození</span>
                  <span className="text-slate-800">{contact.birthDate}</span>
                </p>
              )}
              {(contact.street || contact.city || contact.zip) && (
                <p className="flex flex-col gap-0.5 md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Adresa</span>
                  <span className="text-slate-800">
                    {[contact.street, [contact.city, contact.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ")}
                  </span>
                </p>
              )}
              {contact.lifecycleStage && (
                <p className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Fáze</span>
                  <span className="text-slate-800 capitalize">
                    {contact.lifecycleStage === "former_client" ? "Bývalý klient" : contact.lifecycleStage === "client" ? "Klient" : contact.lifecycleStage}
                  </span>
                </p>
              )}
              {contact.priority && (
                <p className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Priorita</span>
                  <span className="text-slate-800">
                    {contact.priority === "low" ? "Nízká" : contact.priority === "normal" ? "Běžná" : contact.priority === "high" ? "Vysoká" : contact.priority === "urgent" ? "Urgentní" : contact.priority}
                  </span>
                </p>
              )}
              {contact.tags && contact.tags.length > 0 && (
                <div className="flex flex-col gap-1.5 md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Štítky</span>
                  <div className="flex items-center gap-1.5 flex-wrap">
                    {contact.tags.map((tag) => (
                      <span key={tag} className="inline-block rounded-md bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600 border border-slate-200">
                        {tag}
                      </span>
                    ))}
                  </div>
                </div>
              )}
              {(contact.nextServiceDue || contact.serviceCycleMonths) && (
                <p className="flex flex-col gap-0.5 md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Servisní cyklus</span>
                  <span className="text-slate-800">
                    {contact.serviceCycleMonths ?? "—"} měsíců
                    {contact.nextServiceDue && <> · Příští servis: {contact.nextServiceDue}</>}
                  </span>
                </p>
              )}
              {contact.gdprConsentAt && (
                <p className="flex flex-col gap-0.5">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Souhlas GDPR</span>
                  <span className="text-slate-800">{new Date(contact.gdprConsentAt).toLocaleString("cs-CZ")}</span>
                </p>
              )}
              {(contact.referralSource || contact.referralContactName) && (
                <p className="flex flex-col gap-0.5 md:col-span-2">
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">Doporučení</span>
                  <span className="text-slate-800">
                    {[contact.referralSource, contact.referralContactName].filter(Boolean).join(" – ")}
                    {contact.referralContactId && (
                      <Link href={`/portal/contacts/${contact.referralContactId}`} className="ml-2 text-indigo-600 hover:underline">
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
      </div>

      <aside className="xl:col-span-1 space-y-6">
        <ContactOpenTasksPreview contactId={id} />
        <ContactAiAnalysisCard />
        {household && <ContactHouseholdCard household={household} />}
      </aside>
    </div>
  );

  const smlouvyContent = (
    <div className="space-y-6 md:space-y-8">
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6">
          <ContractsSection contactId={id} />
          <ClientFinancialSummary contactId={id} />
          <div className="mt-6 pt-6 border-t border-slate-100">
            <h2 className="text-lg font-black text-slate-900 mb-2">Platební instrukce</h2>
            <SendPaymentPdfButton contactId={id} />
          </div>
        </div>
      </div>
    </div>
  );

  const aktivitaContent = (
    <div className="space-y-6 md:space-y-8">
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="p-6">
          <ContactActivityTimeline contactId={id} />
        </div>
      </div>
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50">
          <h2 className="text-lg font-black text-slate-900">Zprávy</h2>
        </div>
        <div className="p-6">
          <ChatThread contactId={id} currentUserType="advisor" />
        </div>
      </div>
    </div>
  );

  const zapiskyContent = (
    <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="p-6">
        <ContactNotesSection contactId={id} />
      </div>
    </div>
  );

  const tabs = [
    { id: "prehled" as const, label: "Přehled", content: overviewContent },
    { id: "smlouvy" as const, label: "Produkty", content: smlouvyContent },
    { id: "dokumenty" as const, label: "Dokumenty", content: <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden"><div className="px-6 py-5 border-b border-slate-50"><h2 className="text-lg font-black text-slate-900">Dokumenty</h2></div><div className="p-6"><DocumentsSection contactId={id} /></div></div> },
    { id: "zapisky" as const, label: "Zápisky", content: zapiskyContent },
    { id: "aktivita" as const, label: "Aktivita", content: aktivitaContent },
    { id: "ukoly" as const, label: "Úkoly a schůzky", content: <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden"><div className="px-6 py-5 border-b border-slate-50"><h2 className="text-lg font-black text-slate-900">Úkoly a schůzky</h2></div><div className="p-6"><ContactTasksAndEvents contactId={id} /></div></div> },
    { id: "obchody" as const, label: "Obchody", content: <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden"><div className="px-6 py-5 border-b border-slate-50"><h2 className="text-lg font-black text-slate-900">Obchody</h2></div><div className="p-6"><ContactOpportunityBoard contactId={id} /></div></div> },
    { id: "kyc" as const, label: "KYC & AML", content: <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden"><div className="px-6 py-5 border-b border-slate-50"><h2 className="text-lg font-black text-slate-900">KYC & AML</h2></div><div className="p-6"><ComplianceSection contactId={id} /></div></div> },
  ];

  const initials = [contact.firstName, contact.lastName].map((s) => s?.charAt(0) ?? "").join("").toUpperCase() || "?";
  const addressLine = [contact.street, [contact.city, contact.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Kontakt";

  return (
    <div className="min-h-screen bg-[#f8fafc] text-slate-800 pb-20 font-lato">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Lato:wght@300;400;700;900&display=swap');
        .font-lato { font-family: 'Lato', sans-serif; }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <header className="bg-white/80 backdrop-blur-md border-b border-slate-100 px-4 sm:px-6 md:px-8 py-4 sticky top-0 z-50 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <Link
            href="/portal/contacts"
            className="flex items-center gap-2 text-sm font-bold text-slate-400 hover:text-indigo-600 transition-colors shrink-0 min-h-[44px]"
          >
            <ArrowLeft size={16} /> Zpět na kontakty
          </Link>
          <div className="w-px h-6 bg-slate-200 shrink-0 hidden sm:block" aria-hidden />
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-slate-400 min-w-0">
            <span>Databáze</span>
            <span className="opacity-30">/</span>
            <span className="text-slate-800 truncate">{fullName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <Link
            href={`/portal/contacts/${id}/summary`}
            className="flex items-center gap-2 px-4 py-2 bg-white border border-slate-200 text-slate-700 rounded-xl text-xs font-black uppercase tracking-widest shadow-sm hover:bg-slate-50 transition-all min-h-[44px]"
          >
            <FileText size={16} /> Klientská zpráva
          </Link>
          <Link
            href={`/portal/contacts/${id}/edit`}
            className="flex items-center gap-2 px-5 py-2 bg-[#1a1c2e] text-white rounded-xl text-xs font-black uppercase tracking-widest shadow-lg shadow-indigo-900/20 hover:bg-[#2a2d4a] transition-all hover:-translate-y-0.5 active:scale-95 min-h-[44px]"
          >
            <Edit2 size={14} /> Upravit
          </Link>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <div className="bg-white rounded-[32px] p-6 md:p-8 border border-slate-100 shadow-sm relative overflow-hidden">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-blue-50/30 rounded-bl-full -z-10 opacity-50" aria-hidden />
          <div className="flex flex-col xl:flex-row justify-between gap-6 xl:gap-8 z-10">
            <div className="flex flex-col sm:flex-row items-start gap-4 md:gap-6 min-w-0">
              <div className="relative shrink-0">
                <div className="w-24 h-24 rounded-[28px] bg-gradient-to-br from-slate-800 to-[#1a1c2e] flex items-center justify-center text-white font-black text-3xl shadow-xl shadow-slate-900/20 border-4 border-white overflow-hidden">
                  {contact.avatarUrl ? (
                    <img src={contact.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
              </div>
              <div className="pt-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                  <h1 className="text-2xl md:text-3xl font-black text-slate-900 tracking-tight">
                    {contact.firstName} {contact.lastName}
                  </h1>
                  {contact.tags && contact.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1.5">
                      {contact.tags.map((tag) => (
                        <span key={tag} className="px-2.5 py-1 bg-slate-100 text-slate-600 text-[10px] font-black uppercase tracking-widest rounded-md border border-slate-200">
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm font-bold text-slate-500">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors min-h-[44px] md:min-h-0">
                      <Mail size={16} className="text-slate-400 shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors min-h-[44px] md:min-h-0">
                      <Phone size={16} className="text-slate-400 shrink-0" />
                      {contact.phone}
                    </a>
                  )}
                  {addressLine && (
                    <span className="flex items-center gap-2 min-h-[44px] md:min-h-0">
                      <MapPin size={16} className="text-slate-400 shrink-0" />
                      <span className="truncate">{addressLine}</span>
                    </span>
                  )}
                  {contact.birthDate && (
                    <span className="flex items-center gap-2 min-h-[44px] md:min-h-0">
                      <Calendar size={16} className="text-slate-400 shrink-0" />
                      {contact.birthDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex sm:flex-row xl:flex-col gap-2 justify-center xl:justify-start shrink-0">
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/\s/g, "")}`}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-sm font-black transition-colors w-full sm:w-auto min-h-[44px]"
                >
                  <Phone size={16} /> Zavolat
                </a>
              )}
              <Link
                href={`/portal/messages?contact=${id}`}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-sm font-black transition-colors w-full sm:w-auto min-h-[44px]"
              >
                <MessageSquare size={16} /> Zpráva
              </Link>
            </div>
          </div>
        </div>

        <ContactTabLayout tabs={tabs} defaultTab="prehled" />
      </main>
    </div>
  );
}
