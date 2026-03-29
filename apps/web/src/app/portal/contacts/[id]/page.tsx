import Link from "next/link";
import { notFound } from "next/navigation";
import {
  ArrowLeft,
  Edit2,
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
import { SendPaymentPdfButton } from "@/app/dashboard/contacts/[id]/SendPaymentPdfButton";
import { ContactActivityTimeline } from "@/app/dashboard/contacts/[id]/ContactActivityTimeline";
import { ChatThread } from "@/app/components/ChatThread";
import { ClientFinancialSummary } from "@/app/components/contacts/ClientFinancialSummary";
import { ContactTabNav } from "./ContactTabNav";
import {
  parseContactTabFromSearchParams,
  contactDetailQueryWithoutTab,
  type ContactTabId,
} from "./contact-detail-tabs";
import { ContactTasksAndEvents } from "./ContactTasksAndEvents";
import { ContactOpportunityBoard } from "./ContactOpportunityBoard";
import { ContactHouseholdCard } from "./ContactHouseholdCard";
import { ContactOpenTasksPreview } from "./ContactOpenTasksPreview";
import { ContactNotesSection } from "./ContactNotesSection";
import { ContactOverviewKpi } from "./ContactOverviewKpi";
import { ContactLastNotePreview } from "./ContactLastNotePreview";
import { ContactProductsPreview } from "./ContactProductsPreview";
import { ContactAiGenerationsBlock } from "./ContactAiGenerationsBlock";
import { getLatestClientGenerations } from "@/app/actions/ai-generations";
import { ClientCoverageWidget } from "@/app/components/contacts/ClientCoverageWidget";
import { ContactTagsEditor } from "@/app/components/contacts/ContactTagsEditor";
import { ContactFinancialAnalysesSection } from "@/app/dashboard/contacts/[id]/ContactFinancialAnalysesSection";
import { ClientFinancialSummaryBlock } from "./ClientFinancialSummaryBlock";
import { ClientServiceBlock } from "./ClientServiceBlock";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { ContactPaymentSetupsSection } from "./ContactPaymentSetupsSection";
import { ClientReferralSection } from "./ClientReferralSection";
import { ClientTimeline } from "./ClientTimeline";
import { Suspense, type ReactNode } from "react";
import { BriefingTabContent } from "./BriefingTabContent";
import { InviteToClientZoneButton } from "@/app/dashboard/contacts/[id]/InviteToClientZoneButton";

type PageProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

const CONTACT_ID_UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function isRedirectError(e: unknown): boolean {
  if (typeof e !== "object" || e === null) return false;
  const d = (e as { digest?: string }).digest;
  return typeof d === "string" && d.startsWith("NEXT_REDIRECT");
}

export default async function ContactDetailPage({ params, searchParams }: PageProps) {
  const { id: rawId } = await params;
  const contactId = rawId?.trim() ?? "";
  const sp = await searchParams;
  const tab: ContactTabId = parseContactTabFromSearchParams(sp);
  const baseQueryNoTab = contactDetailQueryWithoutTab(sp);

  if (!contactId || !CONTACT_ID_UUID_RE.test(contactId)) {
    notFound();
  }

  let contact: Awaited<ReturnType<typeof getContact>>;
  try {
    contact = await getContact(contactId);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    notFound();
  }
  if (!contact) notFound();

  let household: Awaited<ReturnType<typeof getHouseholdForContact>> = null;
  let latestGenerations: Awaited<ReturnType<typeof getLatestClientGenerations>> = {
    clientSummary: null,
    clientOpportunities: null,
    nextBestAction: null,
  };
  try {
    [household, latestGenerations] = await Promise.all([
      getHouseholdForContact(contactId),
      getLatestClientGenerations(contactId),
    ]);
  } catch {
    /* Sekundární data – stránka klienta zůstane, chybějící bloky se doplní prázdně */
  }

  const overviewContent = (
    <div className="space-y-8">
      <ContactOverviewKpi contactId={contactId} />
      <ClientFinancialSummaryBlock contactId={contactId} />
      <ClientServiceBlock contactId={contactId} />
      <ContactPaymentSetupsSection contactId={contactId} />
      <ClientReferralSection contactId={contactId} />
      <ClientCoverageWidget contactId={contactId} />
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
        <div className="xl:col-span-2 space-y-6">
          <ContactLastNotePreview contactId={contactId} />
          <ContactProductsPreview contactId={contactId} />
          <ContactFinancialAnalysesSection contactId={contactId} />
        </div>
        <aside className="xl:col-span-1 space-y-6">
          {household && <ContactHouseholdCard household={household} />}
        </aside>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <ContactOpenTasksPreview contactId={contactId} />
        <ContactAiGenerationsBlock contactId={contactId} initialGenerations={latestGenerations} />
      </div>
    </div>
  );

  const smlouvyContent = (
    <div className="space-y-6 md:space-y-8">
      <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
        <div className="p-6">
          <ContractsSection contactId={contactId} />
          <ClientFinancialSummary contactId={contactId} />
          <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
            <h2 className="text-lg font-black text-[color:var(--wp-text)] mb-2">Platební instrukce</h2>
            <SendPaymentPdfButton contactId={contactId} />
          </div>
        </div>
      </div>
    </div>
  );

  const aktivitaContent = (
    <div className="space-y-6 md:space-y-8">
      <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
        <div className="p-6">
          <ContactActivityTimeline contactId={contactId} />
        </div>
      </div>
      <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
          <h2 className="text-lg font-black text-[color:var(--wp-text)]">Zprávy</h2>
        </div>
        <div className="p-6">
          <ChatThread contactId={contactId} currentUserType="advisor" />
        </div>
      </div>
    </div>
  );

  const zapiskyContent = (
    <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
      <div className="p-6">
        <ContactNotesSection contactId={contactId} />
      </div>
    </div>
  );

  const timelineContent = (
    <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
      <div className="p-6">
        <ClientTimeline contactId={contactId} />
      </div>
    </div>
  );

  const dokumentyContent = (
    <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
        <h2 className="text-lg font-black text-[color:var(--wp-text)]">Dokumenty</h2>
      </div>
      <div className="p-6">
        <DocumentsSection contactId={contactId} />
      </div>
    </div>
  );

  const ukolyContent = (
    <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
        <h2 className="text-lg font-black text-[color:var(--wp-text)]">Úkoly a schůzky</h2>
      </div>
      <div className="p-6">
        <ContactTasksAndEvents contactId={contactId} />
      </div>
    </div>
  );

  const obchodyContent = (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <ContactOpportunityBoard
        contactId={contactId}
        contactFirstName={contact.firstName ?? undefined}
        contactLastName={contact.lastName ?? undefined}
      />
    </div>
  );

  const briefingContent = (
    <Suspense fallback={<div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6">Načítání…</div>}>
      <BriefingTabContent contactId={contactId} />
    </Suspense>
  );

  const tabBody: Record<ContactTabId, ReactNode> = {
    prehled: overviewContent,
    timeline: timelineContent,
    smlouvy: smlouvyContent,
    dokumenty: dokumentyContent,
    zapisky: zapiskyContent,
    aktivita: aktivitaContent,
    ukoly: ukolyContent,
    obchody: obchodyContent,
    briefing: briefingContent,
  };

  const initials = [contact.firstName, contact.lastName].map((s) => s?.charAt(0) ?? "").join("").toUpperCase() || "?";
  const addressLine = [contact.street, [contact.city, contact.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Kontakt";

  return (
    <div className="min-h-screen bg-[color:var(--wp-main-scroll-bg)] pb-20 text-[color:var(--wp-text)]">
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      <header className="sticky top-0 z-50 flex flex-wrap items-center justify-between gap-4 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/90 px-4 py-4 backdrop-blur-md sm:px-6 md:px-8">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <Link
            href="/portal/contacts"
            className="flex items-center gap-2 text-sm font-bold text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 transition-colors shrink-0 min-h-[44px]"
          >
            <ArrowLeft size={16} /> Zpět na kontakty
          </Link>
          <div className="w-px h-6 bg-[color:var(--wp-surface-card-border)] shrink-0 hidden sm:block" aria-hidden />
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)] min-w-0">
            <span>Databáze</span>
            <span className="opacity-30">/</span>
            <span className="text-[color:var(--wp-text)] truncate">{fullName}</span>
          </div>
        </div>
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          <CreateActionButton
            href={`/portal/contacts/${contactId}/edit`}
            icon={Edit2}
            className="min-h-[44px] px-5 py-2 text-xs font-black uppercase tracking-widest shadow-lg"
          >
            Upravit
          </CreateActionButton>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <div className="relative overflow-hidden rounded-[32px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 shadow-sm md:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-blue-50/30 rounded-bl-full -z-10 opacity-50" aria-hidden />
          <div className="flex flex-col xl:flex-row justify-between gap-6 xl:gap-8 z-10">
            <div className="flex flex-col sm:flex-row items-start gap-4 md:gap-6 min-w-0">
              <div className="relative shrink-0">
                <div className="flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border-4 border-[color:var(--wp-surface-card)] bg-gradient-to-br from-[#1e293b] to-aidv-create font-black text-3xl text-white shadow-xl shadow-black/25">
                  {contact.avatarUrl ? (
                    <img src={contact.avatarUrl} alt="" className="w-full h-full object-cover" />
                  ) : (
                    initials
                  )}
                </div>
              </div>
              <div className="pt-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-2">
                  <h1 className="text-2xl md:text-3xl font-black text-[color:var(--wp-text)] tracking-tight">
                    {contact.firstName} {contact.lastName}
                  </h1>
                  <ContactTagsEditor contactId={contactId} initialTags={contact.tags ?? []} />
                </div>
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm font-bold text-[color:var(--wp-text-secondary)]">
                  {contact.email && (
                    <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors min-h-[44px] md:min-h-0">
                      <Mail size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                      <span className="truncate">{contact.email}</span>
                    </a>
                  )}
                  {contact.phone && (
                    <a href={`tel:${contact.phone.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors min-h-[44px] md:min-h-0">
                      <Phone size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                      {contact.phone}
                    </a>
                  )}
                  {addressLine && (
                    <span className="flex items-center gap-2 min-h-[44px] md:min-h-0">
                      <MapPin size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                      <span className="truncate">{addressLine}</span>
                    </span>
                  )}
                  {contact.birthDate && (
                    <span className="flex items-center gap-2 min-h-[44px] md:min-h-0">
                      <Calendar size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                      {contact.birthDate}
                    </span>
                  )}
                </div>
              </div>
            </div>
            <div className="flex flex-col sm:flex-row xl:flex-col gap-2 justify-center xl:justify-start shrink-0">
              {contact.phone && (
                <a
                  href={`tel:${contact.phone.replace(/\s/g, "")}`}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-emerald-50 text-emerald-700 hover:bg-emerald-100 rounded-xl text-sm font-black transition-colors w-full sm:w-auto min-h-[44px]"
                >
                  <Phone size={16} /> Zavolat
                </a>
              )}
              <Link
                href={`/portal/messages?contact=${contactId}`}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-sm font-black transition-colors w-full sm:w-auto min-h-[44px]"
              >
                <MessageSquare size={16} /> Zpráva
              </Link>
              {contact.email && (
                <div className="w-full sm:w-auto min-h-[44px] flex items-center">
                  <InviteToClientZoneButton contactId={contactId} />
                </div>
              )}
            </div>
          </div>
        </div>

        <Suspense
          fallback={
            <div className="h-14 animate-pulse rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60" />
          }
        >
          <ContactTabNav activeTab={tab} baseQueryNoTab={baseQueryNoTab} />
        </Suspense>
        <div className="pt-6 pb-8">{tabBody[tab]}</div>
      </main>
    </div>
  );
}
