"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import { getAdvisorClientPortalRequestsInbox } from "@/app/actions/client-portal-requests";
import type { AdvisorClientPortalInboxItem } from "@/app/actions/client-portal-requests";
import { ClientPortalRequestsInbox } from "./ClientPortalRequestsInbox";
import { ErrorState, LoadingSkeleton } from "@/app/shared/mobile-ui/primitives";

export function ClientPortalRequestsInboxLoader() {
  const [items, setItems] = useState<AdvisorClientPortalInboxItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setError(null);
    setItems(null);
    try {
      const data = await getAdvisorClientPortalRequestsInbox();
      setItems(data);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Požadavky se nepodařilo načíst.");
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (error) {
    return (
      <div className="p-4">
        <ErrorState title={error} onRetry={load} />
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
