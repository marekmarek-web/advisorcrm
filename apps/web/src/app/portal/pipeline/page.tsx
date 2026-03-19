import { getPipeline, ensureDefaultStages } from "@/app/actions/pipeline";
import { getContactsList } from "@/app/actions/contacts";
import { PipelineBoard } from "@/app/dashboard/pipeline/PipelineBoard";

export default async function PipelinePage() {
  await ensureDefaultStages();
  const [stages, contactsList] = await Promise.all([getPipeline(), getContactsList()]);
  const contacts = contactsList.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));

  const totalPotential = stages.reduce(
    (sum, s) => sum + s.opportunities.reduce((a, o) => a + Number(o.expectedValue || 0), 0),
    0
  );

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full bg-[#f8fafc]">
      <div className="flex-1 min-h-0 flex flex-col px-4 md:px-6 lg:px-8 pb-4 w-full">
        <PipelineBoard stages={stages} contacts={contacts} totalPotential={totalPotential} />
      </div>
    </div>
  );
}
