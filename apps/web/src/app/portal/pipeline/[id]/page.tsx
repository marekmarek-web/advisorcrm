import Link from "next/link";
import { notFound } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getOpportunityById } from "@/app/actions/pipeline";

/** Vždy čerstvá data + žádné statické cachování starého RSC shellu po deployi. */
export const dynamic = "force-dynamic";
export const revalidate = 0;
import { DealDetailHeader } from "./DealDetailHeader";
import { OpportunityTabLayout } from "./OpportunityTabLayout";
import { OpportunitySidebar } from "./OpportunitySidebar";
import { OpportunityTimelineTab } from "./OpportunityTimelineTab";
import { OpportunityProductsTab } from "./OpportunityProductsTab";
import { OpportunityOffersTab } from "./OpportunityOffersTab";
import { OpportunityLinkedTab } from "./OpportunityLinkedTab";
import { OpportunityNotesTab } from "./OpportunityNotesTab";
import { OpportunityCustomFieldsTab } from "./OpportunityCustomFieldsTab";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = await getOpportunityById(id);
  if (!opportunity) notFound();

  const tabs = [
    {
      id: "casova_osa" as const,
      content: (
        <OpportunityTimelineTab
          opportunityId={opportunity.id}
          stages={opportunity.stages}
        />
      ),
    },
    {
      id: "produkty" as const,
      content: (
        <OpportunityProductsTab
          contactId={opportunity.contactId}
          contactName={opportunity.contactName}
        />
      ),
    },
    {
      id: "nabidky" as const,
      content: (
        <OpportunityOffersTab
          opportunityId={opportunity.id}
          contactId={opportunity.contactId}
        />
      ),
    },
    {
      id: "navazane" as const,
      content: (
        <OpportunityLinkedTab
          opportunityId={opportunity.id}
          contactId={opportunity.contactId}
          contactName={opportunity.contactName}
        />
      ),
    },
    {
      id: "poznamky" as const,
      content: (
        <OpportunityNotesTab
          opportunityId={opportunity.id}
          contactId={opportunity.contactId}
        />
      ),
    },
    {
      id: "vlastni_pole" as const,
      content: <OpportunityCustomFieldsTab opportunity={opportunity} />,
    },
  ];

  const crumbNumber = opportunity.opportunityNumber;

  return (
    <div className="min-h-screen bg-[#f4f7f9] font-sans text-[color:var(--wp-text)] pb-20">
      <header className="bg-[color:var(--wp-surface-card)]/80 backdrop-blur-md border-b border-[color:var(--wp-surface-card-border)] px-4 sm:px-8 py-4 sticky top-0 z-50 flex items-center justify-between">
        <div className="flex items-center gap-4 sm:gap-6 min-w-0 flex-wrap">
          <Link
            href="/portal/pipeline"
            className="flex items-center gap-2 text-sm font-bold text-[color:var(--wp-text-tertiary)] hover:text-indigo-600 transition-colors min-h-[44px] min-w-[44px] -ml-2 px-2"
          >
            <ArrowLeft size={16} aria-hidden />
            <span className="hidden sm:inline">Zpět na nástěnku obchodů</span>
            <span className="sm:hidden">Zpět</span>
          </Link>
          <div className="w-px h-6 bg-[color:var(--wp-surface-card-border)] hidden sm:block" aria-hidden />
          <div className="flex items-center gap-2 text-[10px] font-black uppercase tracking-[0.2em] text-[color:var(--wp-text-tertiary)] min-w-0">
            <span>Obchody</span>
            <span className="opacity-30" aria-hidden>
              /
            </span>
            <span className="text-[color:var(--wp-text)] truncate">{crumbNumber}</span>
          </div>
        </div>
      </header>

      <main className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 space-y-6">
        <DealDetailHeader opportunity={opportunity} />

        <div className="grid grid-cols-1 xl:grid-cols-12 gap-6 xl:gap-8 items-start">
          <div className="xl:col-span-8 min-w-0">
            <OpportunityTabLayout tabs={tabs} defaultTab="casova_osa" />
          </div>
          <div className="xl:col-span-4 min-w-0">
            <OpportunitySidebar opportunity={opportunity} />
          </div>
        </div>
      </main>
    </div>
  );
}
