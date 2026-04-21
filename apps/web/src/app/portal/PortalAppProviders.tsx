"use client";

import type { ReactNode } from "react";
import { PortalQueryProvider } from "./PortalQueryProvider";
import { IdleTimeoutGate } from "@/app/components/IdleTimeoutGate";

/** Společné klientské providery pro celý `/portal` (desktop i mobilní UI). */
export function PortalAppProviders({ children }: { children: ReactNode }) {
  return (
    <PortalQueryProvider>
      {/* Delta A29: idle timeout gate — aktivní pro advisor/back-office role. */}
      <IdleTimeoutGate />
      {children}
    </PortalQueryProvider>
  );
}
