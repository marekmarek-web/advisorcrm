"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import {
  getFinancialAnalysis,
  listFinancialAnalyses,
  saveFinancialAnalysisDraft,
  setFinancialAnalysisStatus,
  type FinancialAnalysisListItem,
} from "@/app/actions/financial-analyses";
import { formatUpdated } from "@/app/portal/analyses/analyses-page-utils";
import {
  AnalysisCard,
  EmptyState,
  ErrorState,
  FilterChips,
  FullscreenSheet,
  LoadingSkeleton,
  MobileCard,
  MobileSection,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";

type Filter = "all" | "draft" | "completed";

export function AnalysesHubScreen({
  detailIdFromPath,
}: {
  detailIdFromPath: string | null;
}) {
  const [items, setItems] = useState<FinancialAnalysisListItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(detailIdFromPath);
  const [detailPayload, setDetailPayload] = useState<{ currentStep?: number; data?: Record<string, unknown> } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      setError(null);
      try {
        setItems(await listFinancialAnalyses());
      } catch (e) {
        setError(e instanceof Error ? e.message : "Načtení analýz selhalo.");
      }
    });
  }

  useEffect(() => {
    reload();
  }, []);

  useEffect(() => {
    if (!detailIdFromPath) return;
    setDetailId(detailIdFromPath);
    setDetailOpen(true);
  }, [detailIdFromPath]);

  useEffect(() => {
    if (!detailId || !detailOpen) return;
    startTransition(async () => {
      try {
        const row = await getFinancialAnalysis(detailId);
        const payload = (row?.payload ?? null) as { currentStep?: number; data?: Record<string, unknown> } | null;
        setDetailPayload(payload);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Načtení detailu analýzy selhalo.");
      }
    });
  }, [detailId, detailOpen]);

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "draft") return items.filter((item) => item.status === "draft" || item.status === "archived");
    return items.filter((item) => item.status === "completed" || item.status === "exported");
  }, [items, filter]);

  async function handleCreate() {
    startTransition(async () => {
      setError(null);
      try {
        const id = await saveFinancialAnalysisDraft({
          payload: {
            currentStep: 1,
            data: {
              client: { name: "" },
            },
          },
        });
        await reload();
        setDetailId(id);
        setDetailOpen(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Vytvoření analýzy selhalo.");
      }
    });
  }

  async function setStatus(nextStatus: "draft" | "completed" | "archived") {
    if (!detailId) return;
    startTransition(async () => {
      try {
        await setFinancialAnalysisStatus(detailId, nextStatus);
        await reload();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Aktualizace statusu selhala.");
      }
    });
  }

  return (
    <>
      {error ? <ErrorState title={error} onRetry={reload} /> : null}
      {pending && items.length === 0 ? <LoadingSkeleton rows={2} /> : null}

      <MobileSection
        title="Finanční analýzy"
        action={
          <button
            type="button"
            onClick={handleCreate}
            className="min-h-[32px] rounded-lg border border-indigo-200 bg-indigo-50 text-indigo-700 px-2.5 text-xs font-bold"
          >
            Nová
          </button>
        }
      >
        <FilterChips
          value={filter}
          onChange={(id) => setFilter(id as Filter)}
          options={[
            { id: "all", label: "Vše", badge: items.length },
            { id: "draft", label: "Koncepty", badge: items.filter((i) => i.status === "draft").length },
            {
              id: "completed",
              label: "Hotové",
              badge: items.filter((i) => i.status === "completed" || i.status === "exported").length,
            },
          ]}
        />

        {filtered.length === 0 ? (
          <EmptyState title="Žádné analýzy" description="Vytvořte první analýzu přes tlačítko Nová." />
        ) : (
          filtered.map((item) => (
            <AnalysisCard
              key={item.id}
              title={item.clientName || item.analysisTypeLabel || "Finanční analýza"}
              status={item.status}
              progress={item.progress}
              subtitle={`Upraveno: ${formatUpdated(new Date(item.updatedAt))}`}
              action={
                <button
                  type="button"
                  onClick={() => {
                    setDetailId(item.id);
                    setDetailOpen(true);
                  }}
                  className="min-h-[40px] rounded-lg border border-slate-200 px-3 text-xs font-bold"
                >
                  Otevřít detail
                </button>
              }
            />
          ))
        )}
      </MobileSection>

      <FullscreenSheet open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail analýzy">
        {!detailId ? (
          <EmptyState title="Analýza není vybraná" />
        ) : (
          <div className="space-y-3">
            <MobileCard>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-black">Progress</p>
              <p className="text-sm mt-1">Krok: {detailPayload?.currentStep ?? "—"}</p>
              {detailPayload?.data?.client ? (
                <StatusBadge tone="info">Klientská data přítomna</StatusBadge>
              ) : (
                <StatusBadge tone="warning">Chybí klientská data</StatusBadge>
              )}
            </MobileCard>
            <MobileCard>
              <p className="text-xs uppercase tracking-wider text-slate-500 font-black">Workflow</p>
              <div className="mt-2 grid grid-cols-3 gap-2">
                <button
                  type="button"
                  onClick={() => setStatus("draft")}
                  className="min-h-[40px] rounded-lg border border-slate-200 text-xs font-bold"
                >
                  Draft
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("completed")}
                  className="min-h-[40px] rounded-lg border border-emerald-200 bg-emerald-50 text-emerald-700 text-xs font-bold"
                >
                  Hotovo
                </button>
                <button
                  type="button"
                  onClick={() => setStatus("archived")}
                  className="min-h-[40px] rounded-lg border border-amber-200 bg-amber-50 text-amber-700 text-xs font-bold"
                >
                  Archiv
                </button>
              </div>
            </MobileCard>
          </div>
        )}
      </FullscreenSheet>
    </>
  );
}
