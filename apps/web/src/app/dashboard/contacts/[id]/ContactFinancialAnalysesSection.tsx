"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { getFinancialAnalysesForContact } from "@/app/actions/financial-analyses";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import { getCompaniesForContact } from "@/app/actions/company-person-links";
import { getSharedFactsForContact } from "@/app/actions/shared-facts";
import { getCompanyById } from "@/app/actions/companies";
import { getAnalysisStatusLabel } from "@/lib/analyses/financial/constants";
import { FileText, Plus, Building2, Link2 } from "lucide-react";

export function ContactFinancialAnalysesSection({ contactId }: { contactId: string }) {
  const [list, setList] = useState<FinancialAnalysisListItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [companiesCount, setCompaniesCount] = useState(0);
  const [sharedFactsCount, setSharedFactsCount] = useState(0);
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      getFinancialAnalysesForContact(contactId),
      getCompaniesForContact(contactId),
      getSharedFactsForContact(contactId),
    ])
      .then(([rows, companies, facts]) => {
        if (cancelled) return;
        setList(rows);
        setCompaniesCount(companies.length);
        setSharedFactsCount(facts.length);
        const ids = [...new Set(rows.map((a) => a.linkedCompanyId).filter(Boolean))] as string[];
        Promise.all(ids.map((id) => getCompanyById(id)))
          .then((comps) => {
            if (cancelled) return;
            const map: Record<string, string> = {};
            ids.forEach((id, i) => {
              if (comps[i]?.name) map[id] = comps[i]!.name;
            });
            setCompanyNames(map);
          });
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
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
        {(companiesCount > 0 || sharedFactsCount > 0) && (
          <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm flex flex-wrap items-center gap-4">
            <span className="inline-flex items-center gap-2 text-slate-700">
              <Building2 className="h-4 w-4 text-slate-500" />
              Propojené firmy: {companiesCount}
            </span>
            <span className="inline-flex items-center gap-2 text-slate-700">
              <Link2 className="h-4 w-4 text-slate-500" />
              Sdílená data: {sharedFactsCount} položek
            </span>
          </div>
        )}
        {loading ? (
          <p className="text-sm text-slate-500">Načítám…</p>
        ) : list.length === 0 ? (
          <p className="text-sm text-slate-500">Žádné finanční analýzy. Vytvořte novou analýzu.</p>
        ) : (
          <ul className="space-y-3">
            {list.map((a) => (
              <li key={a.id} className="flex flex-wrap items-center justify-between gap-2 py-2 border-b border-slate-50 last:border-0">
                <div className="flex flex-col sm:flex-row sm:items-center gap-1 sm:gap-2 min-w-0">
                  <div className="flex items-center gap-2">
                    <FileText className="w-4 h-4 text-slate-400 shrink-0" />
                    <span className="text-sm font-semibold text-slate-700">
                      {getAnalysisStatusLabel(a.status)}
                    </span>
                    <span className="text-xs text-slate-400">
                      {new Date(a.updatedAt).toLocaleDateString("cs-CZ")}
                    </span>
                  </div>
                  {a.linkedCompanyId && (
                    <span className="text-xs text-indigo-600">
                      Propojeno s firmou {companyNames[a.linkedCompanyId] ?? a.linkedCompanyId}
                      {a.lastRefreshedFromSharedAt != null && (
                        <> · Poslední synchronizace: {new Date(a.lastRefreshedFromSharedAt).toLocaleDateString("cs-CZ")}</>
                      )}
                    </span>
                  )}
                </div>
                <Link
                  href={`/portal/analyses/financial?id=${a.id}`}
                  className="text-sm font-semibold text-amber-600 hover:text-amber-700 min-h-[44px] flex items-center shrink-0"
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
