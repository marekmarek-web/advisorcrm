"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { hasPersistableFinancialDraft } from "@/lib/analyses/financial/saveLoad";
import { saveFinancialAnalysisDraft } from "@/app/actions/financial-analyses";

const DEBOUNCE_MS = 32_000;
const MIN_INTERVAL_MS = 18_000;
const ENABLE_MS = 900;

function shouldSyncToServer(): boolean {
  const s = useFinancialAnalysisStore.getState();
  if (s.analysisId) return true;
  return hasPersistableFinancialDraft(s.data, s.currentStep);
}

export function FinancialAnalysisAutoSave() {
  const router = useRouter();
  const savingRef = useRef(false);
  const debounceTimerRef = useRef<number | null>(null);
  const lastNetworkSaveAtRef = useRef(0);
  const enabledRef = useRef(false);

  useEffect(() => {
    const enableTimer = window.setTimeout(() => {
      enabledRef.current = true;
    }, ENABLE_MS);

    const flush = async (opts?: { force?: boolean }) => {
      if (savingRef.current || !shouldSyncToServer()) return;
      if (!enabledRef.current && !opts?.force) return;

      const now = Date.now();
      if (!opts?.force && now - lastNetworkSaveAtRef.current < MIN_INTERVAL_MS) return;

      const s = useFinancialAnalysisStore.getState();
      savingRef.current = true;
      try {
        const id = await saveFinancialAnalysisDraft({
          id: s.analysisId ?? undefined,
          contactId: s.data.clientId ?? undefined,
          householdId: s.data.householdId ?? undefined,
          payload: { data: s.data as unknown as Record<string, unknown>, currentStep: s.currentStep },
        });
        lastNetworkSaveAtRef.current = Date.now();
        if (!s.analysisId) {
          useFinancialAnalysisStore.getState().setAnalysisId(id);
          if (typeof window !== "undefined" && !window.location.search.includes("id=")) {
            router.replace(`/portal/analyses/financial?id=${encodeURIComponent(id)}`);
          }
        }
        useFinancialAnalysisStore.getState().saveToStorage();
      } catch (e) {
        console.warn("[FinancialAnalysisAutoSave]", e);
      } finally {
        savingRef.current = false;
      }
    };

    const schedule = () => {
      if (!enabledRef.current) return;
      if (!shouldSyncToServer()) {
        if (debounceTimerRef.current) {
          clearTimeout(debounceTimerRef.current);
          debounceTimerRef.current = null;
        }
        return;
      }
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
      debounceTimerRef.current = window.setTimeout(() => {
        debounceTimerRef.current = null;
        void flush();
      }, DEBOUNCE_MS);
    };

    const unsub = useFinancialAnalysisStore.subscribe(schedule);

    const onLeave = () => {
      if (debounceTimerRef.current) {
        clearTimeout(debounceTimerRef.current);
        debounceTimerRef.current = null;
      }
      void flush({ force: true });
    };

    const onVisibility = () => {
      if (document.visibilityState === "hidden") onLeave();
    };

    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("pagehide", onLeave);

    return () => {
      window.clearTimeout(enableTimer);
      unsub();
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("pagehide", onLeave);
      if (debounceTimerRef.current) clearTimeout(debounceTimerRef.current);
    };
  }, [router]);

  return null;
}
