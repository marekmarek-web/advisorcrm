"use client";

import { Suspense, useEffect, useState } from "react";
import { getAdvisorClientPortalRequestsInbox } from "@/app/actions/client-portal-requests";
import type { AdvisorClientPortalInboxItem } from "@/app/actions/client-portal-requests";
import { ClientPortalRequestsInbox } from "./ClientPortalRequestsInbox";
import { LoadingSkeleton } from "@/app/shared/mobile-ui/primitives";

export function ClientPortalRequestsInboxLoader() {
  const [items, setItems] = useState<AdvisorClientPortalInboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await getAdvisorClientPortalRequestsInbox();
        if (!cancelled) setItems(data);
      } catch {
        if (!cancelled) setError("Požadavky se nepodařilo načíst.");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  if (error) {
    return (
      <div className="p-4 text-center text-sm text-rose-600">
        {error}
      </div>
    );
  }

  if (!items) {
    return (
      <div className="p-4">
        <LoadingSkeleton rows={5} variant="list" />
      </div>
    );
  }

  return (
    <div className="p-3 md:p-6">
      <Suspense fallback={<LoadingSkeleton rows={5} variant="list" />}>
        <ClientPortalRequestsInbox initialItems={items} />
      </Suspense>
    </div>
  );
}
