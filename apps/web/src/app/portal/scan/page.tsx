"use client";

import { Suspense } from "react";
import { PortalScanFlow } from "./PortalScanFlow";

export default function ScanPage() {
  return (
    <Suspense fallback={<div className="p-4 text-sm text-slate-500">Načítání…</div>}>
      <PortalScanFlow />
    </Suspense>
  );
}
