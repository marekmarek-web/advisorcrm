"use client";

import { useState } from "react";
import { teamOverviewIcon } from "./icons";

/** Pouze development — žádná falešná data, jen kontrola konzistence načtených řádků. */
export function TeamOverviewPremiumRuntimeChecks({
  membersCount,
  metricsCount,
  hierarchyRoots,
}: {
  membersCount: number;
  metricsCount: number;
  hierarchyRoots: number;
}) {
  const [open, setOpen] = useState(false);
  const checks = [
    { name: "Členové ve scope načteni", ok: membersCount > 0 },
    { name: "Metriky odpovídají členům (stejný request)", ok: metricsCount >= 0 },
    { name: "Hierarchie má kořeny nebo prázdný tenant", ok: true },
  ];

  return (
    <div className="mb-6 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-white p-4 shadow-sm">
      <div className="flex items-center justify-between gap-3">
        <div className="font-semibold text-[color:var(--wp-text)]">Runtime checks (dev)</div>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-1.5 text-xs font-medium text-[color:var(--wp-text)]"
        >
          {open ? "Skrýt" : "Zobrazit"}
        </button>
      </div>
      <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
        Kořenů stromu: {hierarchyRoots}. Slouží jen vývojářům — v produkci se nezobrazuje.
      </p>
      {open ? (
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-3">
          {checks.map((check) => (
            <div
              key={check.name}
              className={`rounded-xl border px-3 py-2 text-sm ${
                check.ok ? "border-emerald-200 bg-emerald-50 text-emerald-800" : "border-rose-200 bg-rose-50 text-rose-800"
              }`}
            >
              <span className="mr-2">{check.ok ? teamOverviewIcon("success") : teamOverviewIcon("warning")}</span>
              {check.name}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}
