"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Users, ChevronDown, ChevronUp, ExternalLink } from "lucide-react";
import { getCompanyPersonLinks } from "@/app/actions/company-person-links";
import { getPersonalAnalysesLinkedToCompany } from "@/app/actions/financial-analyses";
import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";

type PersonalItem = Awaited<ReturnType<typeof getPersonalAnalysesLinkedToCompany>>[number] & {
  lastRefreshedFromSharedAt?: Date | null;
};

export function CompanyFALinkedPersonsSection() {
  const companyId = useCompanyFaStore((s) => s.companyId);
  const [links, setLinks] = useState<Awaited<ReturnType<typeof getCompanyPersonLinks>>>([]);
  const [personalAnalyses, setPersonalAnalyses] = useState<PersonalItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setLinks([]);
      setPersonalAnalyses([]);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([getCompanyPersonLinks(companyId), getPersonalAnalysesLinkedToCompany(companyId)])
      .then(([linkRows, analyses]) => {
        if (!cancelled) {
          setLinks(linkRows);
          setPersonalAnalyses(analyses as PersonalItem[]);
        }
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [companyId]);

  const personCount = links.length;
  const analysisCount = personalAnalyses.length;
  if (!companyId || (personCount === 0 && analysisCount === 0)) return null;

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 text-sm">
      <div className="flex flex-wrap items-center gap-2 text-slate-800">
        <Users className="h-5 w-5 shrink-0 text-slate-600" />
        <span>
          K této firmě jsou napojeny {personCount} {personCount === 1 ? "osoba" : "osoby"}.
          {analysisCount > 0 && (
            <> Sdílená data ovlivňují {analysisCount} {analysisCount === 1 ? "osobní analýzu" : "osobních analýz"}.</>
          )}
        </span>
      </div>
      {analysisCount > 0 && (
        <div className="mt-3">
          <button
            type="button"
            onClick={() => setExpanded((e) => !e)}
            className="inline-flex min-h-[44px] items-center gap-2 font-semibold text-indigo-600 hover:text-indigo-700"
          >
            {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            Zobrazit dopad
          </button>
          {expanded && (
            <ul className="mt-2 space-y-2 pl-6">
              {personalAnalyses.map((a) => (
                <li key={a.id} className="flex flex-wrap items-center gap-2">
                  <Link
                    href={`/portal/analyses/financial?id=${a.id}`}
                    className="inline-flex items-center gap-1 text-indigo-600 hover:underline"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                    {a.clientName ?? "Osobní analýza"} (aktualizováno {a.updatedAt ? new Date(a.updatedAt).toLocaleDateString("cs-CZ") : "—"})
                  </Link>
                  {"lastRefreshedFromSharedAt" in a && a.lastRefreshedFromSharedAt && (
                    <span className="text-xs text-slate-500">
                      Sync: {new Date(a.lastRefreshedFromSharedAt).toLocaleDateString("cs-CZ")}
                    </span>
                  )}
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
