"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { FinancialAnalysisLayout } from "./components/FinancialAnalysisLayout";
import { getFinancialAnalysis } from "@/app/actions/financial-analyses";

const PERSONAL_FA_IMPORT_KEY = "financial_analysis_import";

export default function FinancialAnalysisPage() {
  const searchParams = useSearchParams();
  const hydrate = useFinancialAnalysisStore((s) => s.hydrate);
  const setLinkIds = useFinancialAnalysisStore((s) => s.setLinkIds);
  const loadFromServerPayload = useFinancialAnalysisStore((s) => s.loadFromServerPayload);
  const setAnalysisId = useFinancialAnalysisStore((s) => s.setAnalysisId);
  const setLinkMetadata = useFinancialAnalysisStore((s) => s.setLinkMetadata);
  const loadFromFile = useFinancialAnalysisStore((s) => s.loadFromFile);

  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error">("idle");

  useEffect(() => {
    const id = searchParams.get("id");
    const fromImport = searchParams.get("fromImport");
    if (id) {
      setLoadState("loading");
      getFinancialAnalysis(id)
        .then((row) => {
          if (row) {
            try {
              loadFromServerPayload(row.payload ?? {});
              setAnalysisId(row.id);
              setLinkIds(row.contactId ?? undefined, row.householdId ?? undefined);
              setLinkMetadata(
                (row as { linkedCompanyId?: string | null; lastRefreshedFromSharedAt?: Date | null }).linkedCompanyId ?? null,
                (row as { linkedCompanyId?: string | null; lastRefreshedFromSharedAt?: Date | null }).lastRefreshedFromSharedAt ?? null
              );
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
    if (fromImport === "1" && typeof window !== "undefined") {
      const json = window.sessionStorage.getItem(PERSONAL_FA_IMPORT_KEY);
      if (json) {
        window.sessionStorage.removeItem(PERSONAL_FA_IMPORT_KEY);
        const ok = loadFromFile(json);
        setLoadState(ok ? "ok" : "error");
        return;
      }
    }
    hydrate();
    setLoadState("ok");
  }, [searchParams, hydrate, loadFromServerPayload, setAnalysisId, setLinkIds, loadFromFile]);

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
          className="min-h-[44px] px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl"
        >
          Začít novou analýzu
        </Link>
      </div>
    );
  }

  return <FinancialAnalysisLayout />;
}
