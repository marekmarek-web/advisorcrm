"use client";

import { useEffect, useState, useTransition } from "react";
import { getCallsReport } from "@/app/actions/events";
import { ColdContactsClient } from "@/app/portal/cold-contacts/ColdContactsClient";
import { ErrorState, LoadingSkeleton } from "@/app/shared/mobile-ui/primitives";

export function ColdContactsMobileScreen() {
  const [calls, setCalls] = useState<Awaited<ReturnType<typeof getCallsReport>>>([]);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    startTransition(async () => {
      setError(null);
      try {
        setCalls(await getCallsReport());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nepodařilo se načíst studené kontakty.");
      }
    });
  }, []);

  if (pending && calls.length === 0) return <LoadingSkeleton variant="list" rows={5} />;
  if (error) return <ErrorState title={error} onRetry={() => window.location.reload()} />;

  return (
    <div className="space-y-4 -mx-2">
      <ColdContactsClient initialCalls={calls} />
    </div>
  );
}
