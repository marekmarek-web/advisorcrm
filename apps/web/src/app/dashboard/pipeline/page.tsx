import { getPipeline } from "@/app/actions/pipeline";
import { getContactsList } from "@/app/actions/contacts";
import { PipelineBoardDynamic } from "./PipelineBoardDynamic";

export default async function PipelinePage() {
  const [stages, contactsList] = await Promise.all([getPipeline(), getContactsList()]);
  const contacts = contactsList.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
    email: c.email,
    phone: c.phone,
  }));

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <PipelineBoardDynamic stages={stages} contacts={contacts} />
    </div>
  );
}
