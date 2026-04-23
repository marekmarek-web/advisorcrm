"use client";

import { Calculator } from "lucide-react";
import type { OpportunityDetail } from "@/app/actions/pipeline";

function isRecord(x: unknown): x is Record<string, unknown> {
  return x != null && typeof x === "object" && !Array.isArray(x);
}

/** Zobrazení `custom_fields.client_portal_calculator_snapshot` u obchodu z kalkulačky v klientské zóně. */
export function OpportunityClientCalculatorSnapshot({ opportunity }: { opportunity: OpportunityDetail }) {
  const custom = (opportunity.customFields as Record<string, unknown> | null) ?? null;
  const raw = custom?.client_portal_calculator_snapshot;
  if (!isRecord(raw)) return null;
  const kind = typeof raw.kind === "string" ? raw.kind : "—";
  const inputs = isRecord(raw.inputs) ? raw.inputs : null;
  const results = isRecord(raw.results) ? raw.results : null;

  return (
    <div className="rounded-[24px] border border-indigo-100 bg-indigo-50/50 p-5 sm:p-6 shadow-sm">
      <div className="flex items-center gap-3 mb-4">
        <div className="w-10 h-10 rounded-xl bg-indigo-100 text-indigo-700 flex items-center justify-center shrink-0">
          <Calculator size={20} aria-hidden />
        </div>
        <div>
          <h2 className="text-sm font-black uppercase tracking-widest text-indigo-800">Data z kalkulačky (klient)</h2>
          <p className="text-xs text-indigo-700/80 font-medium">Typ: {kind}</p>
        </div>
      </div>
      {inputs && Object.keys(inputs).length > 0 && (
        <div className="mb-4">
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
            Vstupy
          </p>
          <pre className="text-xs font-mono bg-white/80 rounded-xl border border-indigo-100/80 p-3 overflow-x-auto max-h-48 overflow-y-auto text-[color:var(--wp-text)]">
            {JSON.stringify(inputs, null, 2)}
          </pre>
        </div>
      )}
      {results && Object.keys(results).length > 0 && (
        <div>
          <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-1">
            Výsledky
          </p>
          <pre className="text-xs font-mono bg-white/80 rounded-xl border border-indigo-100/80 p-3 overflow-x-auto max-h-48 overflow-y-auto text-[color:var(--wp-text)]">
            {JSON.stringify(results, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
}
