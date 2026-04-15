import { getPipeline, ensureDefaultStages } from "@/app/actions/pipeline";
import { getContactsList } from "@/app/actions/contacts";
import { PipelinePageClient } from "./PipelinePageClient";

export default async function PipelinePage() {
  let stages: Awaited<ReturnType<typeof getPipeline>> = [];
  let contactsList: Awaited<ReturnType<typeof getContactsList>> = [];
  try {
    await ensureDefaultStages();
    [stages, contactsList] = await Promise.all([getPipeline(), getContactsList()]);
  } catch {
    stages = [];
    contactsList = [];
  }
  const contacts = contactsList.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
  }));

  const totalPotential = stages.reduce(
    (sum, s) => sum + s.opportunities.reduce((a, o) => a + Number(o.expectedValue || 0), 0),
    0
  );

  return (
    <div className="flex min-h-0 w-full flex-1 flex-col bg-[color:var(--wp-main-scroll-bg)]">
      <div className="flex-1 min-h-0 flex flex-col pb-4 w-full min-w-0">
        <PipelinePageClient initialStages={stages} contacts={contacts} totalPotential={totalPotential} />
      </div>
    </div>
  );
}
