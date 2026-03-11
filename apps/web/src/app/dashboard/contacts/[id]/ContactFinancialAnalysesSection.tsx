"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFinancialAnalysesForContact } from "@/app/actions/financial-analyses";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import { FileText, Plus } from "lucide-react";

const STATUS_LABELS: Record<string, string> = {
  draft: "Rozpracováno",
  completed: "Dokončeno",
  exported: "Exportováno",
  archived: "Archivováno",
};

export function ContactFinancialAnalysesSection({ contactId }: { contactId: string }) {
  const [list, setList] = useState<FinancialAnalysisListItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    getFinancialAnalysesForContact(contactId)
      .then((rows) => {
        if (!cancelled) setList(rows);
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => { cancelled = true; };
  }, [contactId]);

  return (
    <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
      <div className="px-6 py-5 border-b border-slate-50 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-lg font-black text-slate-900">Finanční analýzy</h2>
        <Link
          href={`/portal/analyses/financial?clientId=${contactId}`}
          className="inline-flex items-center gap-2 rounded-xl bg-amber-500 text-white px-4 py-2.5 text-sm font-semibold hover:bg-amber-600 transition-colors min-h-[44px]"
        >
          <Plus className="w-4 h-4" />
          <span>Nová analýza</span>
        </Link>
      </div>
      <div className="p-6">
        {loading ? (
          <p className="text-sm text-slate-500">Načítám…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-500">Žádné finanční analýzy. Vytvořte novou analýzu.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-50 last:border-0">
                <div className="flex items-center gap-2 min-w-0">
                  <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                  <span className="text-sm font-semibold text-slate-700">
                    {STATUS_LABELS[a.status] ?? a.status}
                  </span>
                  <span className="text-xs text-slate-400">
                    {new Date(a.updatedAt).toLocaleDateString("cs-CZ")}
                  </span>
                </div>
                <Link
                  href={`/portal/analyses/financial?id=${a.id}`}
                  className="text-sm font-semibold text-amber-600 hover:text-amber-700 min-h-[44px] flex items-center"
                >
                  Otevřít
                </Link>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
