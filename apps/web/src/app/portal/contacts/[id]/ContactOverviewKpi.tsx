"use client";

import { useState, useEffect } from "react";
import { Activity } from "lucide-react";
import { getFinancialSummary } from "@/app/actions/financial";

function fmtCZK(value: number): string {
  if (value === 0) return "—";
  return value.toLocaleString("cs-CZ", { maximumFractionDigits: 0 }) + " Kč";
}

/** Nejstarší rok ze smluv (pro „Klientem od“). */
function clientSinceYear(timeline: { startDate: string | null }[]): string {
  const years = timeline
    .map((t) => t.startDate && t.startDate.slice(0, 4))
    .filter((y): y is string => !!y);
  if (years.length === 0) return "—";
  return String(Math.min(...years.map(Number)));
}

const DEFAULT_DATA = {
  totalMonthly: 0,
  totalAnnual: 0,
  contractCount: 0,
  clientSince: "—",
};

export function ContactOverviewKpi({ contactId }: { contactId: string }) {
  const [data, setData] = useState<{
    totalMonthly: number;
    totalAnnual: number;
    contractCount: number;
    clientSince: string;
  } | null>(null);

  useEffect(() => {
    getFinancialSummary(contactId)
      .then((s) => {
        const contractCount = s.bySegment.reduce((acc, seg) => acc + seg.count, 0);
        setData({
          totalMonthly: s.totalMonthly,
          totalAnnual: s.totalAnnual,
          contractCount,
          clientSince: clientSinceYear(s.contractTimeline),
        });
      })
      .catch(() => setData(null));
  }, [contactId]);

  const d = data ?? DEFAULT_DATA;

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
      <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm min-h-[44px]">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Osobní AUM</span>
        <div className="text-xl font-black text-slate-900">{d.totalAnnual > 0 ? fmtCZK(d.totalAnnual) : "—"}</div>
      </div>
      <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm min-h-[44px]">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Měs. investice</span>
        <div className="text-xl font-black text-emerald-600">{fmtCZK(d.totalMonthly)}</div>
      </div>
      <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm min-h-[44px]">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 flex items-center gap-1">
          Health Score <Activity size={12} aria-hidden />
        </span>
        <div className="text-xl font-black text-indigo-600">—</div>
      </div>
      <div className="bg-white p-5 rounded-[24px] border border-slate-100 shadow-sm min-h-[44px]">
        <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">Klientem od</span>
        <div className="text-xl font-black text-slate-900">{d.clientSince}</div>
      </div>
    </div>
  );
}
