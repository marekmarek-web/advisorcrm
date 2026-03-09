import { getHouseholdsWithMembers } from "@/app/actions/households";
import { HouseholdListClient } from "./HouseholdListClient";

export default async function HouseholdsPage() {
  const list = await getHouseholdsWithMembers();

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full min-h-screen bg-[#f4f7f9]" style={{ animation: "wp-fade-in 0.3s ease" }}>
      <div className="flex-1 min-w-0 max-w-[1600px] mx-auto w-full p-4 md:p-8 pb-12">
        <HouseholdListClient list={list} />
      </div>
    </div>
  );
}
