import { getPipeline } from "@/app/actions/pipeline";
import { getContactsList } from "@/app/actions/contacts";
import { PipelineBoard } from "./PipelineBoard";

export default async function PipelinePage() {
  const [stages, contactsList] = await Promise.all([getPipeline(), getContactsList()]);
  const contacts = contactsList.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        Pipeline
      </h1>
      <p className="text-slate-600">
        Případy (hypo / invest / pojist) – přesuňte do jiného stupně pomocí tlačítka.
      </p>
      <PipelineBoard stages={stages} contacts={contacts} />
    </div>
  );
}
