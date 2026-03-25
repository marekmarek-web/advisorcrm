"use client";

import { useSearchParams } from "next/navigation";
import { PortalMessagesView } from "@/app/portal/messages/PortalMessagesView";

/** Reuses web messages UI inside the mobile shell (full client-side data). */
export function MessagesMobileScreen() {
  const searchParams = useSearchParams();
  const contactFromQuery = searchParams.get("contact");

  return (
    <div className="-mx-4 -mt-4 min-h-[calc(100dvh-8rem)] flex flex-col">
      <PortalMessagesView initialContactId={contactFromQuery?.trim() || null} />
    </div>
  );
}
