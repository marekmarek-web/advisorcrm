"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { loadFromStorage, clearStorage, hasPersistableFinancialDraft } from "@/lib/analyses/financial/saveLoad";
import { FinancialAnalysisLayout } from "./components/FinancialAnalysisLayout";
import { getFinancialAnalysis } from "@/app/actions/financial-analyses";

function withTimeout<T>(promise: Promise<T>, ms = 15_000): Promise<T> {
  return Promise.race([
    promise,
    new Promise<never>((_, reject) => setTimeout(() => reject(new Error("Timeout")), ms)),
  ]);
}

const PERSONAL_FA_IMPORT_KEY = "financial_analysis_import";

function hasSignificantLocalDraft(): boolean {
  try {
    const loaded = loadFromStorage();
    if (!loaded) return false;
    return hasPersistableFinancialDraft(loaded.data, loaded.currentStep);
  } catch {
    return false;
  }
}

export default function FinancialAnalysisPage() {
  const searchParams = useSearchParams();
  const hydrate = useFinancialAnalysisStore((s) => s.hydrate);
  const reset = useFinancialAnalysisStore((s) => s.reset);
  const setLinkIds = useFinancialAnalysisStore((s) => s.setLinkIds);
  const loadFromServerPayload = useFinancialAnalysisStore((s) => s.loadFromServerPayload);
  const setAnalysisId = useFinancialAnalysisStore((s) => s.setAnalysisId);
  const setLinkMetadata = useFinancialAnalysisStore((s) => s.setLinkMetadata);
  const loadFromFile = useFinancialAnalysisStore((s) => s.loadFromFile);

  const [loadState, setLoadState] = useState<"idle" | "loading" | "ok" | "error" | "timeout">("idle");
  const [showDraftPrompt, setShowDraftPrompt] = useState(false);

  useEffect(() => {
    const id = searchParams.get("id");
    const fromImport = searchParams.get("fromImport");
    if (id) {
      setLoadState("loading");
      withTimeout(getFinancialAnalysis(id))
        .catch(async (err) => {
          if (err?.message === "Timeout") {
            // Fallback retry without timeout for large legacy payloads.
            return getFinancialAnalysis(id);
          }
          throw err;
        })
        .then((row) => {
          if (row) {
            try {
              const payload =
                typeof row.payload === "string"
                  ? JSON.parse(row.payload)
                  : (row.payload ?? {});
              loadFromServerPayload(payload);
              setAnalysisId(row.id);
              setLinkIds(row.contactId ?? undefined, row.householdId ?? undefined);
              setLinkMetadata(
                (row as { linkedCompanyId?: string | null; lastRefreshedFromSharedAt?: Date | null }).linkedCompanyId ?? null,
                (row as { linkedCompanyId?: string | null; lastRefreshedFromSharedAt?: Date | null }).lastRefreshedFromSharedAt ?? null
              );
              setLoadState("ok");
            } catch (e) {
              console.error("[FinancialAnalysisPage] failed to hydrate analysis payload", e);
              setLoadState("error");
            }
          } else {
            setLoadState("error");
          }
        })
        .catch((err) => {
          console.error("[FinancialAnalysisPage] getFinancialAnalysis failed", err);
          setLoadState(err?.message === "Timeout" ? "timeout" : "error");
        });
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
    if (hasSignificantLocalDraft()) {
      setShowDraftPrompt(true);
      return;
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
  if (showDraftPrompt) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] p-4">
        <div className="w-full max-w-lg rounded-2xl bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] shadow-xl p-6 sm:p-8">
          <h2 className="text-xl font-extrabold text-[color:var(--wp-text)] mb-2">
            Máte rozpracovanou analýzu
          </h2>
          <p className="text-sm text-[color:var(--wp-text-secondary)] mb-6">
            Chcete pokračovat v rozpracované verzi, nebo začít úplně novou analýzu?
          </p>
          <div className="flex flex-col sm:flex-row gap-3 sm:justify-end">
            <button
              type="button"
              onClick={() => {
                hydrate();
                setShowDraftPrompt(false);
                setLoadState("ok");
              }}
              className="min-h-[44px] px-5 py-3 rounded-xl bg-indigo-600 hover:bg-indigo-500 text-white font-semibold"
            >
              Pokračovat
            </button>
            <button
              type="button"
              onClick={() => {
                clearStorage();
                reset();
                setShowDraftPrompt(false);
                setLoadState("ok");
              }}
              className="min-h-[44px] px-5 py-3 rounded-xl border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-secondary)] font-semibold hover:bg-[color:var(--wp-surface-muted)]"
            >
              Začít znovu
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (loadState === "loading" || (loadState === "idle" && idParam)) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4">
        <p className="text-[color:var(--wp-text-secondary)]">Načítání analýzy…</p>
      </div>
    );
  }

  if (loadState === "timeout") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 text-center">
        <p className="text-[color:var(--wp-text-secondary)] font-medium mb-2">Načítání trvá příliš dlouho.</p>
        <p className="text-[color:var(--wp-text-secondary)] text-sm mb-4">Zkontrolujte připojení k internetu a zkuste to znovu.</p>
        <button
          type="button"
          onClick={() => window.location.reload()}
          className="min-h-[44px] px-6 py-3 bg-amber-600 hover:bg-amber-500 text-white font-semibold rounded-xl"
        >
          Zkusit znovu
        </button>
      </div>
    );
  }

  if (loadState === "error") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[40vh] px-4 text-center">
        <p className="text-[color:var(--wp-text-secondary)] font-medium mb-2">Analýzu se nepodařilo načíst.</p>
        <p className="text-[color:var(--wp-text-secondary)] text-sm mb-4">Zkontrolujte připojení nebo zkuste začít novou analýzu.</p>
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
