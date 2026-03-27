import { getHouseholdsWithMembers } from "@/app/actions/households";
import { HouseholdListClient } from "./HouseholdListClient";

export default async function HouseholdsPage() {
  let list: Awaited<ReturnType<typeof getHouseholdsWithMembers>> = [];
  try {
    list = await getHouseholdsWithMembers();
  } catch {
    list = [];
  }

  return (
    <div
      className="flex min-h-0 min-h-screen w-full flex-1 flex-col bg-[color:var(--wp-main-scroll-bg)]"
      style={{ animation: "wp-fade-in 0.3s ease" }}
    >
      <div className="flex-1 min-w-0 max-w-[1600px] mx-auto w-full p-4 md:p-8 pb-12">
        <HouseholdListClient list={list} />
      </div>
    </div>
  );
}
