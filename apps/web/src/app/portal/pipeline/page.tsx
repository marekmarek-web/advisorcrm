import { getPipeline, ensureDefaultStages } from "@/app/actions/pipeline";
import { getContactsList } from "@/app/actions/contacts";
import { PipelineBoard } from "@/app/dashboard/pipeline/PipelineBoard";

export default async function PipelinePage() {
  await ensureDefaultStages();
  const [stages, contactsList] = await Promise.all([getPipeline(), getContactsList()]);
  const contacts = contactsList.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full">
      <div className="flex items-center justify-between px-4 py-4 shrink-0">
        <div>
          <h1 className="text-xl font-bold" style={{ color: "var(--wp-text)" }}>Moje pipeline</h1>
          <p className="text-sm mt-0.5" style={{ color: "var(--wp-text-muted)" }}>
            Přehled obchodních případů: od prvního kontaktu po servis.
          </p>
        </div>
      </div>
      <div className="flex-1 min-h-0 px-4 pb-4 w-full">
        <PipelineBoard stages={stages} contacts={contacts} />
      </div>
    </div>
  );
}
