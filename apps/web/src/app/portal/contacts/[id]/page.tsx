import Link from "next/link";
import Image from "next/image";
import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { notFound } from "next/navigation";
import { cookies, headers } from "next/headers";
import { ArrowLeft, Mail, Phone, MapPin, Calendar, MessageSquare, Briefcase } from "lucide-react";
import { getContact, getContactAiProvenance, type ContactAiProvenanceResult } from "@/app/actions/contacts";
import { getHouseholdForContact } from "@/app/actions/households";
import { AiReviewProvenanceBadge } from "@/app/components/aidvisora/AiReviewProvenanceBadge";
import { ContractsSection } from "@/app/dashboard/contacts/[id]/ContractsSection";
import { SendPaymentPdfButton } from "@/app/dashboard/contacts/[id]/SendPaymentPdfButton";
import { ContactActivityTimeline } from "@/app/dashboard/contacts/[id]/ContactActivityTimeline";
import { ClientFinancialSummary } from "@/app/components/contacts/ClientFinancialSummary";
import { ContactTabNav } from "./ContactTabNav";
import {
  parseContactTabFromSearchParams,
  contactDetailQueryWithoutTab,
  type ContactTabId,
} from "./contact-detail-tabs";
import { ContactTasksAndEvents } from "./ContactTasksAndEvents";
import { ContactHouseholdCard } from "./ContactHouseholdCard";
import { ContactOpenTasksPreview } from "./ContactOpenTasksPreview";
import { ContactNotesSection } from "./ContactNotesSection";
import { ContactOverviewKpi } from "./ContactOverviewKpi";
import { ContactLastNotePreview } from "./ContactLastNotePreview";
import { ContactProductsPreview } from "./ContactProductsPreview";
import { ContactOpportunitiesPreview } from "./ContactOpportunitiesPreview";
import { ContactAiGenerationsBlock } from "./ContactAiGenerationsBlock";
import { getLatestClientGenerations } from "@/app/actions/ai-generations";
import { ClientCoverageWidget } from "@/app/components/contacts/ClientCoverageWidget";
import { ContactTagsEditor } from "@/app/components/contacts/ContactTagsEditor";
import { ContactFinancialAnalysesSection } from "@/app/dashboard/contacts/[id]/ContactFinancialAnalysesSection";
import { ClientFinancialSummaryBlock } from "./ClientFinancialSummaryBlock";
import { ClientServiceBlock } from "./ClientServiceBlock";
import { ContactDetailEditButton } from "./ContactDetailEditButton";
import { ContactIdentityCompletenessGuard } from "./ContactIdentityCompletenessGuard";
import { ContactMergeConflictGuard } from "./ContactMergeConflictGuard";
import { ContactDetailIdentityTab } from "./ContactDetailIdentityTab";
import { ContactPaymentSetupsSection } from "./ContactPaymentSetupsSection";
import { ClientReferralSection } from "./ClientReferralSection";
import { ProductsFvSummarySection } from "./ProductsFvSummarySection";
import { Suspense, type ReactNode } from "react";
import { InviteToClientZoneButton } from "@/app/dashboard/contacts/[id]/InviteToClientZoneButton";
import { computeAccessVerdict, type AccessVerdict } from "@/lib/auth/access-verdict";
import { requireAuthInAction } from "@/lib/auth/require-auth";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import { resolveContactIdentityFieldProvenance } from "@/lib/portal/contact-identity-field-provenance";
import { isMobileUiV1EnabledForRequest } from "@/app/shared/mobile-ui/feature-flag";
import { hasPermission, type RoleName } from "@/lib/auth/permissions";
import { resolveIdentityCompleteness, buildIncompleteMessage } from "./contact-identity-completeness-logic";

const DynamicContactOpportunityBoard = dynamic(
  () =>
    import("@/app/components/pipeline/ContactOpportunityBoard").then((m) => m.ContactOpportunityBoard),
  {
    loading: () => (
      <div className="min-h-[320px] animate-pulse rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50" />
    ),
  },
);

const DynamicClientTimeline = dynamic(
  () => import("./ClientTimeline").then((m) => m.ClientTimeline),
  {
    loading: () => (
      <div className="min-h-[200px] animate-pulse rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50" />
    ),
  },
);

const DynamicDocumentsSection = dynamic(
  () => import("@/app/dashboard/contacts/[id]/DocumentsSection").then((m) => m.DocumentsSection),
  {
    loading: () => (
      <div className="min-h-[200px] animate-pulse rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50" />
    ),
  },
);

const DynamicBriefingTabContent = dynamic(
  () => import("./BriefingTabContent").then((m) => m.BriefingTabContent),
  {
    loading: () => (
      <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 text-sm text-[color:var(--wp-text-secondary)]">
        Načítání…
      </div>
    ),
  },
);

const DynamicMaterialRequestsTab = dynamic(
  () => import("./MaterialRequestsTab").then((m) => m.MaterialRequestsTab),
  {
    loading: () => (
      <div className="min-h-[200px] animate-pulse rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50" />
    ),
  },
);

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

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { id: rawId } = await params;
  const contactId = rawId?.trim() ?? "";
  if (!contactId || !CONTACT_ID_UUID_RE.test(contactId)) {
    return { title: "Kontakt · Aidvisora" };
  }
  try {
    const contact = await getContact(contactId);
    if (!contact) return { title: "Kontakt · Aidvisora" };
    const name = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Kontakt";
    return { title: `${name} · Aidvisora` };
  } catch (e) {
    if (isRedirectError(e)) throw e;
    return { title: "Kontakt · Aidvisora" };
  }
}

type ContactRow = NonNullable<Awaited<ReturnType<typeof getContact>>>;
type HouseholdForContact = Awaited<ReturnType<typeof getHouseholdForContact>>;
type LatestGenerations = Awaited<ReturnType<typeof getLatestClientGenerations>>;

function ContactTabBody({
  tab,
  contactId,
  contact,
  household,
  latestGenerations,
  baseQueryNoTab,
  contactProvenance,
  canReadOpportunities,
  canWriteOpportunities,
  identityAdvisoryNoteDeals,
}: {
  tab: ContactTabId;
  contactId: string;
  contact: ContactRow;
  household: HouseholdForContact;
  latestGenerations: LatestGenerations;
  baseQueryNoTab: string;
  contactProvenance: ContactAiProvenanceResult | null;
  canReadOpportunities: boolean;
  canWriteOpportunities: boolean;
  identityAdvisoryNoteDeals: string | null;
}): ReactNode {
  switch (tab) {
    case "prehled":
      return (
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
              <ContactProductsPreview contactId={contactId} baseQueryNoTab={baseQueryNoTab} />
              <ContactFinancialAnalysesSection contactId={contactId} />
            </div>
            <aside className="xl:col-span-1 space-y-6">
              {household && <ContactHouseholdCard household={household} />}
            </aside>
          </div>
          {canReadOpportunities && (
            <ContactOpportunitiesPreview
              contactId={contactId}
              baseQueryNoTab={baseQueryNoTab}
              canWrite={canWriteOpportunities}
            />
          )}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ContactOpenTasksPreview contactId={contactId} />
            <ContactAiGenerationsBlock contactId={contactId} initialGenerations={latestGenerations} />
          </div>
        </div>
      );
    case "detail":
      return (
        <ContactDetailIdentityTab contactId={contactId} contact={contact} provenance={contactProvenance} />
      );
    case "timeline":
      return (
        <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
          <div className="p-6">
            <DynamicClientTimeline contactId={contactId} />
          </div>
        </div>
      );
    case "smlouvy":
      return (
        <div className="space-y-6 md:space-y-8">
          <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
            <div className="p-6">
              <Suspense
                fallback={
                  <p className="text-sm text-[color:var(--wp-text-secondary)] py-4">Načítám sekci smluv…</p>
                }
              >
                <ContractsSection contactId={contactId} />
              </Suspense>
              <div className="mt-6">
                <Suspense fallback={null}>
                  <ProductsFvSummarySection contactId={contactId} />
                </Suspense>
              </div>
              <ClientFinancialSummary contactId={contactId} />
              <div className="mt-6 pt-6 border-t border-[color:var(--wp-surface-card-border)]">
                <h2 className="text-lg font-black text-[color:var(--wp-text)] mb-2">Platební instrukce</h2>
                <SendPaymentPdfButton contactId={contactId} />
              </div>
            </div>
          </div>
        </div>
      );
    case "podklady":
      return (
        <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
            <h2 className="text-lg font-black text-[color:var(--wp-text)]">Požadavky na podklady</h2>
            <p className="text-sm text-[color:var(--wp-text-secondary)] mt-1">
              Vyžádejte si od klienta dokumenty a sledujte odpovědi v klientském portálu.
            </p>
          </div>
          <div className="p-6">
            <DynamicMaterialRequestsTab contactId={contactId} />
          </div>
        </div>
      );
    case "zapisky":
      return (
        <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
          <div className="p-6">
            <ContactNotesSection contactId={contactId} />
          </div>
        </div>
      );
    case "dokumenty":
      return (
        <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
            <h2 className="text-lg font-black text-[color:var(--wp-text)]">Dokumenty</h2>
          </div>
          <div className="p-6">
            <DynamicDocumentsSection contactId={contactId} />
          </div>
        </div>
      );
    case "ukoly":
      return (
        <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm overflow-hidden">
          <div className="px-6 py-5 border-b border-[color:var(--wp-surface-card-border)]/50">
            <h2 className="text-lg font-black text-[color:var(--wp-text)]">Úkoly a schůzky</h2>
          </div>
          <div className="p-6">
            <ContactTasksAndEvents contactId={contactId} />
          </div>
        </div>
      );
    case "obchody":
      if (!canReadOpportunities) {
        return (
          <div className="rounded-[24px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-8 text-sm text-[color:var(--wp-text-secondary)]">
            <p>
              Nemáte oprávnění zobrazit obchody tohoto klienta. Požádejte správce o oprávnění „Obchody — čtení“.
            </p>
          </div>
        );
      }
      return (
        <div className="flex flex-col flex-1 min-h-0 w-full">
          <DynamicContactOpportunityBoard
            contactId={contactId}
            contactFirstName={contact.firstName ?? undefined}
            contactLastName={contact.lastName ?? undefined}
            pipelineSettingsHref="/portal/pipeline"
            identityAdvisoryNote={identityAdvisoryNoteDeals}
            canWriteOpportunities={canWriteOpportunities}
          />
        </div>
      );
    case "briefing":
      return <DynamicBriefingTabContent contactId={contactId} />;
    default:
      return null;
  }
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

  const headerList = await headers();
  const cookieStore = await cookies();
  const mobileUiEnabled = isMobileUiV1EnabledForRequest({
    userAgent: headerList.get("user-agent"),
    cookieStore,
  });

  let contact: Awaited<ReturnType<typeof getContact>>;
  try {
    contact = await getContact(contactId);
  } catch (e) {
    if (isRedirectError(e)) throw e;
    notFound();
  }
  if (!contact) {
    notFound();
  }

  if (mobileUiEnabled) {
    return (
      <span className="sr-only" aria-hidden data-contact-detail-mobile-skip>
        {contact.firstName} {contact.lastName}
      </span>
    );
  }

  const auth = await requireAuthInAction();
  const canReadOpportunities = hasPermission(auth.roleName as RoleName, "opportunities:read");
  const canWriteOpportunities = hasPermission(auth.roleName as RoleName, "opportunities:write");

  let accessVerdict: AccessVerdict = "NEVER_INVITED";
  if (contact.email) {
    try {
      accessVerdict = (await computeAccessVerdict(auth.tenantId, contactId)).verdict;
    } catch {
      /* badge falls back to NEVER_INVITED */
    }
  }

  let household: HouseholdForContact = null;
  let latestGenerations: LatestGenerations = {
    clientSummary: null,
    clientOpportunities: null,
    nextBestAction: null,
  };
  let contactProvenance: ContactAiProvenanceResult = null;
  if (tab === "prehled") {
    try {
      [household, latestGenerations, contactProvenance] = await Promise.all([
        getHouseholdForContact(contactId),
        getLatestClientGenerations(contactId),
        getContactAiProvenance(contactId),
      ]);
    } catch {
      /* Sekundární data – přehled doplní prázdné bloky */
    }
  } else {
    try {
      contactProvenance = await getContactAiProvenance(contactId);
    } catch {
      /* provenance je neblokující */
    }
  }

  const provForDeals = contactProvenance
    ? {
        reviewId: contactProvenance.reviewId,
        confirmedFields: contactProvenance.confirmedFields,
        autoAppliedFields: contactProvenance.autoAppliedFields,
        pendingFields: contactProvenance.pendingFields,
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

  const initials =
    [contact.firstName, contact.lastName]
      .map((s) => String(s ?? "").charAt(0))
      .join("")
      .toUpperCase() || "?";
  const addressLine = [contact.street, [contact.city, contact.zip].filter(Boolean).join(" ")].filter(Boolean).join(", ");

  const fullName = [contact.firstName, contact.lastName].filter(Boolean).join(" ") || "Kontakt";

  return (
    <div className="min-h-screen bg-[color:var(--wp-main-scroll-bg)] pb-20 pt-0 text-[color:var(--wp-text)]">
      <style>{`
        .hide-scrollbar::-webkit-scrollbar { display: none; }
      `}</style>

      {/* Přilepeno pod wp-portal-top-header: zruší pt scroll kontejneru + full-bleed jako horní lišta */}
      <header className="sticky top-0 z-30 flex flex-nowrap items-center justify-between gap-3 border-b border-[color:var(--wp-portal-header-border)] bg-[color:var(--wp-portal-header-bg)] py-3 backdrop-blur-md sm:gap-4 md:py-3.5 -mx-4 -mt-4 px-4 md:-mx-5 md:-mt-4 md:px-5 lg:-mx-4 lg:-mt-3 lg:px-4">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0">
          <Link
            href="/portal/contacts"
            prefetch={false}
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
          <ContactDetailEditButton contactId={contactId} />
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <div className="relative overflow-hidden rounded-[32px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-6 shadow-sm md:p-8">
          <div className="absolute top-0 right-0 w-64 h-64 bg-gradient-to-br from-indigo-50 to-blue-50/30 rounded-bl-full -z-10 opacity-50" aria-hidden />
          <div className="flex flex-col xl:flex-row justify-between gap-6 xl:gap-8 z-10">
            <div className="flex flex-col sm:flex-row items-start gap-4 md:gap-6 min-w-0">
              <div className="relative shrink-0">
                <div className="relative flex h-24 w-24 items-center justify-center overflow-hidden rounded-[28px] border-4 border-[color:var(--wp-surface-card)] bg-gradient-to-br from-[#1e293b] to-aidv-create font-black text-3xl text-white shadow-xl shadow-black/25">
                  {contact.avatarUrl ? (
                    <Image
                      src={contact.avatarUrl}
                      alt=""
                      fill
                      sizes="96px"
                      className="object-cover"
                    />
                  ) : (
                    initials
                  )}
                </div>
              </div>
              <div className="pt-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2 md:gap-3 mb-1">
                  <h1 className="text-2xl md:text-3xl font-black text-[color:var(--wp-text)] tracking-tight">
                    {contact.firstName} {contact.lastName}
                  </h1>
                  <ContactTagsEditor contactId={contactId} initialTags={contact.tags ?? []} />
                </div>
                {(() => {
                  const pFirst = resolveContactIdentityFieldProvenance("firstName", contactProvenance);
                  const pLast = resolveContactIdentityFieldProvenance("lastName", contactProvenance);
                  const p = pFirst ?? pLast;
                  if (!p) return null;
                  return (
                    <div className="mb-2">
                      <AiReviewProvenanceBadge kind={p.kind} reviewId={p.reviewId} confirmedAt={p.confirmedAt} />
                    </div>
                  );
                })()}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-2 mt-4 text-sm font-bold text-[color:var(--wp-text-secondary)]">
                  {contact.email && (() => {
                    const p = resolveContactIdentityFieldProvenance("email", contactProvenance);
                    return (
                      <div className="flex flex-col gap-0.5 min-h-[44px] md:min-h-0 justify-center">
                        <a href={`mailto:${contact.email}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors">
                          <Mail size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                          <span className="truncate">{contact.email}</span>
                        </a>
                        {p && (
                          <span className="pl-6">
                            <AiReviewProvenanceBadge kind={p.kind} reviewId={p.reviewId} confirmedAt={p.confirmedAt} />
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {contact.phone && (() => {
                    const p = resolveContactIdentityFieldProvenance("phone", contactProvenance);
                    return (
                      <div className="flex flex-col gap-0.5 min-h-[44px] md:min-h-0 justify-center">
                        <a href={`tel:${contact.phone!.replace(/\s/g, "")}`} className="flex items-center gap-2 hover:text-indigo-600 transition-colors">
                          <Phone size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                          {contact.phone}
                        </a>
                        {p && (
                          <span className="pl-6">
                            <AiReviewProvenanceBadge kind={p.kind} reviewId={p.reviewId} confirmedAt={p.confirmedAt} />
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {addressLine && (() => {
                    const p = resolveContactIdentityFieldProvenance("address", contactProvenance);
                    return (
                      <div className="flex flex-col gap-0.5 min-h-[44px] md:min-h-0 justify-center">
                        <span className="flex items-center gap-2">
                          <MapPin size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                          <span className="truncate">{addressLine}</span>
                        </span>
                        {p && (
                          <span className="pl-6">
                            <AiReviewProvenanceBadge kind={p.kind} reviewId={p.reviewId} confirmedAt={p.confirmedAt} />
                          </span>
                        )}
                      </div>
                    );
                  })()}
                  {contact.birthDate && (() => {
                    const p = resolveContactIdentityFieldProvenance("birthDate", contactProvenance);
                    return (
                      <div className="flex flex-col gap-0.5 min-h-[44px] md:min-h-0 justify-center">
                        <span className="flex items-center gap-2">
                          <Calendar size={16} className="text-[color:var(--wp-text-tertiary)] shrink-0" />
                          {formatDisplayDateCs(contact.birthDate) || contact.birthDate}
                        </span>
                        {p && (
                          <span className="pl-6">
                            <AiReviewProvenanceBadge kind={p.kind} reviewId={p.reviewId} confirmedAt={p.confirmedAt} />
                          </span>
                        )}
                      </div>
                    );
                  })()}
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
                prefetch={false}
                className="flex items-center justify-center gap-2 px-5 py-3 bg-indigo-50 text-indigo-700 hover:bg-indigo-100 rounded-xl text-sm font-black transition-colors w-full sm:w-auto min-h-[44px]"
              >
                <MessageSquare size={16} /> Zpráva
              </Link>
              {canWriteOpportunities && (
                <Link
                  href={`/portal/contacts/${contactId}?tab=obchody&newOpportunity=1`}
                  prefetch={false}
                  className="flex items-center justify-center gap-2 px-5 py-3 bg-amber-50 text-amber-700 hover:bg-amber-100 rounded-xl text-sm font-black transition-colors w-full sm:w-auto min-h-[44px]"
                >
                  <Briefcase size={16} /> Nový obchod
                </Link>
              )}
              {contact.email && (
                <div className="w-full sm:w-auto min-h-[44px] flex items-center">
                  <InviteToClientZoneButton contactId={contactId} verdict={accessVerdict} />
                </div>
              )}
            </div>
          </div>
        </div>

        <ContactIdentityCompletenessGuard
          contact={contact}
          provenance={contactProvenance}
          contactId={contactId}
        />
        {contactProvenance?.mergeConflictFields && contactProvenance.mergeConflictFields.length > 0 && (
          <ContactMergeConflictGuard
            mergeConflicts={contactProvenance.mergeConflictFields}
            contactId={contactId}
            reviewId={contactProvenance.reviewId}
          />
        )}

        <Suspense
          fallback={
            <div className="h-14 animate-pulse rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/60" />
          }
        >
          <ContactTabNav activeTab={tab} baseQueryNoTab={baseQueryNoTab} />
        </Suspense>
        <div className="pt-6 pb-8">
          <ContactTabBody
            tab={tab}
            contactId={contactId}
            contact={contact}
            household={household}
            latestGenerations={latestGenerations}
            baseQueryNoTab={baseQueryNoTab}
            contactProvenance={contactProvenance}
            canReadOpportunities={canReadOpportunities}
            canWriteOpportunities={canWriteOpportunities}
            identityAdvisoryNoteDeals={identityAdvisoryNoteDeals}
          />
        </div>
      </main>
    </div>
  );
}
