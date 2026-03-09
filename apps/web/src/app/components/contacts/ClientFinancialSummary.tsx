"use client";

import { useState, useEffect } from "react";
import { getFinancialSummary } from "@/app/actions/financial";
import type { FinancialSummary } from "@/app/actions/financial";
import { segmentLabel } from "@/app/lib/segment-labels";

function fmtCZK(value: number): string {
  return value.toLocaleString("cs-CZ", {
    minimumFractionDigits: 0,
    maximumFractionDigits: 0,
  }) + " Kč";
}

export function ClientFinancialSummary({ contactId }: { contactId: string }) {
  const [data, setData] = useState<FinancialSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setLoading(true);
    setError(null);
    getFinancialSummary(contactId)
      .then(setData)
      .catch(() => setError("Nepodařilo se načíst finanční přehled."))
      .finally(() => setLoading(false));
  }, [contactId]);

  if (loading) {
    return (
      <div className="rounded-[var(--wp-radius-sm)] border border-monday-border bg-white p-6 shadow-sm">
        <p className="text-sm text-monday-text-muted">
          Načítám finanční přehled…
        </p>
      </div>
    );
  }

  if (error || !data) {
    return (
      <div className="rounded-[var(--wp-radius-sm)] border border-monday-border bg-white p-6 shadow-sm">
        <p className="text-sm text-red-600">{error ?? "Žádná data."}</p>
      </div>
    );
  }

  const maxMonthly = Math.max(...data.bySegment.map((s) => s.monthlySum), 1);

  return (
    <div className="rounded-[var(--wp-radius-sm)] border border-monday-border bg-white p-6 shadow-sm space-y-6">
      <h2 className="font-semibold text-monday-text text-sm">
        Finanční přehled
      </h2>

      {/* Summary cards – pills méně zaoblené (radius 50) */}
      <div className="grid grid-cols-2 gap-4">
        <div className="border border-monday-border bg-monday-bg p-4 rounded-[var(--wp-radius-sm)]">
          <p className="text-xs text-monday-text-muted mb-1">
            Měsíční pojistné celkem
          </p>
          <p className="text-xl font-bold text-monday-text">
            {fmtCZK(data.totalMonthly)}
          </p>
        </div>
        <div className="border border-monday-border bg-monday-bg p-4 rounded-[var(--wp-radius-sm)]">
          <p className="text-xs text-monday-text-muted mb-1">
            Roční pojistné celkem
          </p>
          <p className="text-xl font-bold text-monday-text">
            {fmtCZK(data.totalAnnual)}
          </p>
        </div>
      </div>

      {/* Coverage by segment */}
      {data.bySegment.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-monday-text-muted uppercase tracking-wide mb-3">
            Pokrytí dle segmentu
          </h3>
          <div className="space-y-2">
            {data.bySegment.map((s) => (
              <div key={s.segment} className="flex items-center gap-3 text-sm">
                <span className="w-40 truncate text-monday-text font-medium">
                  {segmentLabel(s.segment)}
                </span>
                <span className="w-8 text-right text-monday-text-muted text-xs">
                  {s.count}×
                </span>
                <div className="flex-1 h-5 bg-monday-bg rounded overflow-hidden">
                  <div
                    className="h-full bg-monday-blue rounded transition-all"
                    style={{
                      width: `${Math.max((s.monthlySum / maxMonthly) * 100, 4)}%`,
                    }}
                  />
                </div>
                <span className="w-28 text-right text-monday-text text-xs tabular-nums">
                  {fmtCZK(s.monthlySum)}/měs
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Pokrytí produktů je na záložce Přehled (ProductCoverageGrid), zde jen finanční přehled a časová osa */}

      {/* Contract timeline */}
      {data.contractTimeline.length > 0 && (
        <div>
          <h3 className="text-xs font-semibold text-monday-text-muted uppercase tracking-wide mb-3">
            Časová osa smluv
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-monday-border text-left text-xs text-monday-text-muted">
                  <th className="pb-2 pr-4 font-medium">Segment</th>
                  <th className="pb-2 pr-4 font-medium">Partner</th>
                  <th className="pb-2 pr-4 font-medium">Začátek</th>
                  <th className="pb-2 font-medium">Výročí</th>
                </tr>
              </thead>
              <tbody>
                {data.contractTimeline.map((c) => (
                  <tr
                    key={c.id}
                    className="border-b border-monday-border/50 last:border-0"
                  >
                    <td className="py-2 pr-4 text-monday-text">
                      {segmentLabel(c.segment)}
                    </td>
                    <td className="py-2 pr-4 text-monday-text">
                      {c.partnerName ?? "—"}
                    </td>
                    <td className="py-2 pr-4 text-monday-text tabular-nums">
                      {c.startDate ?? "—"}
                    </td>
                    <td className="py-2 text-monday-text tabular-nums">
                      {c.anniversaryDate ?? "—"}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
