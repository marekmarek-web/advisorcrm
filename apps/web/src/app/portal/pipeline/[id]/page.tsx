import Link from "next/link";
import { notFound } from "next/navigation";
import { getOpportunityById } from "@/app/actions/pipeline";
import { OpportunityProgressBar } from "./OpportunityProgressBar";
import { OpportunityTabLayout } from "./OpportunityTabLayout";
import { OpportunitySidebar } from "./OpportunitySidebar";
import { OpportunityTimelineTab } from "./OpportunityTimelineTab";
import { OpportunityProductsTab } from "./OpportunityProductsTab";
import { OpportunityOffersTab } from "./OpportunityOffersTab";
import { OpportunityLinkedTab } from "./OpportunityLinkedTab";
import { OpportunityNotesTab } from "./OpportunityNotesTab";
import { OpportunityCustomFieldsTab } from "./OpportunityCustomFieldsTab";
import { Breadcrumbs } from "@/app/components/Breadcrumbs";

export default async function OpportunityDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const opportunity = await getOpportunityById(id);
  if (!opportunity) notFound();

  const probability = opportunity.probability ?? opportunity.stageProbability ?? 0;
  const valueStr = opportunity.expectedValue
    ? `${Number(opportunity.expectedValue).toLocaleString("cs-CZ")} Kč`
    : "—";
  const openedStr = opportunity.createdAt
    ? new Date(opportunity.createdAt).toLocaleDateString("cs-CZ")
    : "—";
  const closeStr = opportunity.expectedCloseDate ?? "—";

  const tabs = [
    { id: "casova_osa" as const, content: <OpportunityTimelineTab opportunityId={opportunity.id} stages={opportunity.stages} /> },
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

  return (
    <div className="p-4 max-w-[1600px] mx-auto">
      <Breadcrumbs
        items={[
          { label: "Obchody", href: "/portal/pipeline" },
          { label: opportunity.opportunityNumber ?? opportunity.title },
        ]}
      />
      <div className="rounded-xl border border-slate-200 bg-white p-6 mb-4">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div>
            <p className="text-xs font-medium text-slate-500 uppercase tracking-wide">
              Obchodní případ {opportunity.opportunityNumber}
            </p>
            <h1 className="text-xl font-semibold text-slate-800 mt-0.5">{opportunity.title}</h1>
          </div>
          <div className="flex items-center gap-4 text-sm">
            <div className="text-right">
              <p className="text-slate-500 text-xs">Konečná cena</p>
              <p className="font-semibold text-slate-800">{valueStr}</p>
            </div>
            <div className="text-right">
              <p className="text-slate-500 text-xs">Pravděpodobnost výhry</p>
              <p className="font-semibold text-slate-800">{probability}%</p>
            </div>
          </div>
        </div>

        <div className="mt-4 pt-4 border-t border-slate-100">
          <OpportunityProgressBar
            opportunityId={opportunity.id}
            stages={opportunity.stages}
            currentStageId={opportunity.stageId}
            closedAt={opportunity.closedAt}
          />
        </div>

        <div className="mt-3 flex gap-6 text-sm text-slate-500">
          <span>Otevřeno od {openedStr}</span>
          <span>Odhad uzavření {closeStr}</span>
        </div>
      </div>

      <div className="flex gap-6">
        <div className="flex-1 min-w-0">
          <OpportunityTabLayout tabs={tabs} defaultTab="casova_osa" />
        </div>
        <OpportunitySidebar opportunity={opportunity} />
      </div>

    </div>
  );
}
