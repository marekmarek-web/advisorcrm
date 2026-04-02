import { Suspense } from "react";
import { loadClientPortalSessionBundle } from "@/lib/client-portal/client-portal-session-bundle";
import { toClientMobileInitialData } from "./client-mobile-initial-data";
import { ClientMobileClient } from "./ClientMobileClient";

export async function ClientMobileApp() {
  const bundle = await loadClientPortalSessionBundle();
  const initialData = toClientMobileInitialData(bundle);

  return (
    <Suspense
      fallback={
        <div className="min-h-[40vh] flex items-center justify-center text-slate-500 text-sm p-6">
          Načítám…
        </div>
      }
    >
      <ClientMobileClient initialData={initialData} />
    </Suspense>
  );
}
