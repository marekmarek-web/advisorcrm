import { Suspense } from "react";
import { getAdvisorClientPortalRequestsInbox } from "@/app/actions/client-portal-requests";
import { ClientPortalRequestsInbox } from "./ClientPortalRequestsInbox";

export const dynamic = "force-dynamic";

export default async function ClientPortalRequestsPage() {
  let items: Awaited<ReturnType<typeof getAdvisorClientPortalRequestsInbox>> = [];
  try {
    items = await getAdvisorClientPortalRequestsInbox();
  } catch {
    items = [];
  }

  return (
    <div className="p-4 wp-fade-in md:p-6 lg:p-8">
      <Suspense
        fallback={
          <div className="text-sm text-[color:var(--wp-text-secondary)]" aria-busy="true">
            Načítání…
          </div>
        }
      >
        <ClientPortalRequestsInbox initialItems={items} />
      </Suspense>
    </div>
  );
}
