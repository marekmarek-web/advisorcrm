import { notFound } from "next/navigation";
import { getHousehold } from "@/app/actions/households";
import { getContactsList } from "@/app/actions/contacts";
import { getOpportunitiesByHousehold } from "@/app/actions/pipeline";
import { HouseholdDetailClient } from "./HouseholdDetailClient";

export default async function HouseholdDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const [household, contactsList, opportunities] = await Promise.all([
    getHousehold(id),
    getContactsList(),
    getOpportunitiesByHousehold(id),
  ]);
  if (!household) notFound();

  const contacts = contactsList.map((c) => ({
    id: c.id,
    firstName: c.firstName,
    lastName: c.lastName,
  }));

  return (
    <div className="min-h-screen bg-[#f8fafc] pb-12">
      <HouseholdDetailClient
        household={household}
        contacts={contacts}
        opportunities={opportunities}
      />
    </div>
  );
}
