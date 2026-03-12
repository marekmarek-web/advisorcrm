"use client";

import { Link2, Edit3 } from "lucide-react";

type ProvenanceValue = "linked" | "overridden" | "imported";

export function getProvenanceFromData(data: Record<string, unknown>): Record<string, ProvenanceValue> | undefined {
  const p = (data as { _provenance?: Record<string, ProvenanceValue> })._provenance;
  return p && typeof p === "object" ? p : undefined;
}

export function ProvenanceBadge({ path, data }: { path: string; data: Record<string, unknown> }) {
  const provenance = getProvenanceFromData(data);
  const value = provenance?.[path];
  if (!value) return null;
  if (value === "linked") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-indigo-100 px-2 py-0.5 text-xs font-medium text-indigo-700" title="Hodnota z propojené firmy">
        <Link2 className="h-3 w-3" />
        Sdílený
      </span>
    );
  }
  if (value === "overridden") {
    return (
      <span className="inline-flex items-center gap-1 rounded bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800" title="Přepsáno po propojení">
        <Edit3 className="h-3 w-3" />
        Přepsáno
      </span>
    );
  }
  return null;
}
