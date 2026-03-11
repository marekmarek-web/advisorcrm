"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { FinancialAnalysisLayout } from "./components/FinancialAnalysisLayout";
import { getFinancialAnalysis } from "@/app/actions/financial-analyses";

export default function FinancialAnalysisPage() {
  const searchParams = useSearchParams();
  const hydrate = useFinancialAnalysisStore((s) => s.hydrate);
  const setLinkIds = useFinancialAnalysisStore((s) => s.setLinkIds);
  const loadFromServerPayload = useFinancialAnalysisStore((s) => s.loadFromServerPayload);
  const setAnalysisId = useFinancialAnalysisStore((s) => s.setAnalysisId);

  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) {
      setLoadState("loading");
      getFinancialAnalysis(id)
        .then((row) => {
          if (row) {
            try {
              loadFromServerPayload(row.payload ?? {});
              setAnalysisId(row.id);
              setLinkIds(row.contactId ?? undefined, row.householdId ?? undefined);
              setLoadState("ok");
            } catch {
              setLoadState("error");
            }
          } else {
            setLoadState("error");
          }
        })
        .catch(() => setLoadState("error"));
      return;
    }
    setLoadState("ok");
    hydrate();
  }, [searchParams, hydrate, loadFromServerPayload, setAnalysisId, setLinkIds]);

  useEffect(() => {
    const id = searchParams.get("id");
    if (id) return;
    const clientId = searchParams.get("clientId") ?? undefined;
    const householdId = searchParams.get("householdId") ?? undefined;
    if (clientId != null || householdId != null) setLinkIds(clientId, householdId);
  }, [searchParams, setLinkIds]);

  const idParam = searchParams.get("id");
  if (loadState === "loading" || (loadState === "idle" && idParam)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4">
        <p className="text-slate-600">Načítání analýzy…</p>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 text-center">
        <p className="text-slate-700 font-medium mb-2">Analýzu se nepodařilo načíst.</p>
        <p className="text-slate-500 text-sm mb-4">Zkontrolujte připojení nebo zkuste začít novou analýzu.</p>
        <Link
          href="/portal/analyses/financial"
          className="min-h-[44px] px-6 py-3 bg-amber-400 hover:bg-amber-500 text-slate-900 font-semibold rounded-xl"
        >
          Začít novou analýzu
        </Link>
      </div>
    );
  }

  return <FinancialAnalysisLayout />;
}
