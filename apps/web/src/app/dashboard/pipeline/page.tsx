import { getPipeline } from "@/app/actions/pipeline";
import { getContactsList } from "@/app/actions/contacts";
import { PipelineBoard } from "./PipelineBoard";

export default async function PipelinePage() {
  const [stages, contactsList] = await Promise.all([getPipeline(), getContactsList()]);
  const contacts = contactsList.map((c) => ({ id: c.id, firstName: c.firstName, lastName: c.lastName }));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold" style={{ color: "var(--brand-dark)" }}>
        Obchodní nástěnka
      </h1>
      <p className="text-[color:var(--wp-text-muted)]">
        Případy (hypo / invest / pojist) – přesuňte do jiné fáze obchodu.
      </p>
      <PipelineBoard stages={stages} contacts={contacts} />
    </div>
  );
}
