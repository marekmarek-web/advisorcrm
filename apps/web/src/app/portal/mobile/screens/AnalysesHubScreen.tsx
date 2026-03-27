"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import {
  FileText,
  CheckCircle2,
  Clock,
  Archive,
  Upload,
  Plus,
  User,
  RefreshCw,
  ChevronRight,
} from "lucide-react";
import {
  deleteFinancialAnalysisPermanently,
  getFinancialAnalysis,
  listFinancialAnalyses,
  saveFinancialAnalysisDraft,
  setFinancialAnalysisStatus,
  type FinancialAnalysisListItem,
  type FinancialAnalysisStatus,
} from "@/app/actions/financial-analyses";
import { formatUpdated } from "@/app/portal/analyses/analyses-page-utils";
import {
  EmptyState,
  ErrorState,
  FilterChips,
  FullscreenSheet,
  LoadingSkeleton,
  MobileCard,
  PendingButton,
  StatusBadge,
  Toast,
  useToast,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { humanizeAdvisorActionError } from "@/lib/ui/humanize-action-error";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Types / helpers                                                    */
/* ------------------------------------------------------------------ */

type Filter = "all" | "draft" | "done";

const TOTAL_STEPS = 8;

function getStatusConfig(status: string) {
  switch (status) {
    case "completed":
      return { label: "Hotovo", tone: "success" as const, Icon: CheckCircle2, color: "text-emerald-600" };
    case "exported":
      return { label: "Exportováno", tone: "success" as const, Icon: Upload, color: "text-emerald-600" };
    case "archived":
      return { label: "Archiv", tone: "warning" as const, Icon: Archive, color: "text-amber-600" };
    default:
      return { label: "Koncept", tone: "info" as const, Icon: Clock, color: "text-indigo-600" };
  }
}

function ProgressBar({ pct, status }: { pct: number; status: string }) {
  const barColor =
    status === "completed" || status === "exported"
      ? "bg-emerald-500"
      : status === "archived"
        ? "bg-amber-400"
        : "bg-indigo-500";
  return (
    <div className="mt-2.5">
      <div className="flex items-center justify-between mb-1">
        <span className="text-[10px] text-[color:var(--wp-text-tertiary)] font-bold">
          {pct < 100 ? `Krok ${Math.ceil((pct / 100) * TOTAL_STEPS)} z ${TOTAL_STEPS}` : "Dokončeno"}
        </span>
        <span className="text-[10px] font-black text-[color:var(--wp-text-secondary)]">{pct}%</span>
      </div>
      <div className="h-1.5 rounded-full bg-[color:var(--wp-surface-muted)] overflow-hidden">
        <div
          className={cx("h-full rounded-full transition-all", barColor)}
          style={{ width: `${Math.max(0, Math.min(100, pct))}%` }}
        />
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Analysis card                                                      */
/* ------------------------------------------------------------------ */

function AnalysisListCard({
  item,
  onOpen,
}: {
  item: FinancialAnalysisListItem;
  onOpen: () => void;
}) {
  const cfg = getStatusConfig(item.status);
  const pct = item.progress ?? 0;

  return (
    <button
      type="button"
      onClick={onOpen}
      className="w-full text-left bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl overflow-hidden hover:border-indigo-300 transition-colors"
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-[color:var(--wp-surface-muted)] flex items-center justify-center flex-shrink-0">
            <FileText size={18} className="text-[color:var(--wp-text-secondary)]" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                {item.clientName || item.analysisTypeLabel || "Finanční analýza"}
              </p>
              <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
            </div>
            {item.clientName && item.analysisTypeLabel ? (
              <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5 truncate">{item.analysisTypeLabel}</p>
            ) : null}
            <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-0.5">
              Upraveno: {formatUpdated(new Date(item.updatedAt))}
            </p>
            <ProgressBar pct={pct} status={item.status} />
          </div>
          <ChevronRight size={14} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0 mt-1" />
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail panel                                                       */
/* ------------------------------------------------------------------ */

function AnalysisDetailPanel({
  detailId,
  item,
  onSetStatus,
  onPermanentDelete,
  pending,
}: {
  detailId: string;
  item: FinancialAnalysisListItem | undefined;
  onSetStatus: (s: FinancialAnalysisStatus) => void;
  onPermanentDelete: (id: string) => void;
  pending: boolean;
}) {
  const [payload, setPayload] = useState<{ currentStep?: number; data?: Record<string, unknown> } | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [permanentDeleteStep, setPermanentDeleteStep] = useState<"idle" | "confirm">("idle");

  useEffect(() => {
    setPermanentDeleteStep("idle");
  }, [detailId]);

  useEffect(() => {
    let cancelled = false;
    setLoadingDetail(true);
    setDetailError(null);
    getFinancialAnalysis(detailId)
      .then((row) => {
        if (cancelled) return;
        setPayload((row?.payload ?? null) as typeof payload);
      })
      .catch((e) => {
        if (cancelled) return;
        setPayload(null);
        setDetailError(e instanceof Error ? e.message : "Detail analýzy se nepodařilo načíst.");
      })
      .finally(() => !cancelled && setLoadingDetail(false));
    return () => { cancelled = true; };
  }, [detailId]);

  const pct = item?.progress ?? 0;
  const currentStep = payload?.currentStep ?? 0;
  const clientData = payload?.data?.client as Record<string, unknown> | undefined;
  const cfg = getStatusConfig(item?.status ?? "draft");

  return (
    <div className="space-y-3 pb-4">
      {/* Hero */}
      <MobileCard className="p-4 bg-gradient-to-br from-[#0a0f29] to-indigo-900 border-0 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--wp-surface-card)]/10 flex items-center justify-center flex-shrink-0">
            <FileText size={22} className="text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-base font-black text-white truncate">
              {item?.clientName || item?.analysisTypeLabel || "Finanční analýza"}
            </p>
            {item?.clientName && item?.analysisTypeLabel ? (
              <p className="text-xs text-indigo-300 mt-0.5">{item.analysisTypeLabel}</p>
            ) : null}
            <div className="mt-1">
              <StatusBadge tone={cfg.tone}>{cfg.label}</StatusBadge>
            </div>
          </div>
        </div>
        <ProgressBar pct={pct} status={item?.status ?? "draft"} />
      </MobileCard>

      {/* Client data */}
      {loadingDetail ? (
        <LoadingSkeleton rows={2} />
      ) : detailError ? (
        <MobileCard className="p-4 border-rose-200 bg-rose-50/80">
          <p className="text-sm font-bold text-rose-800">{detailError}</p>
          <button
            type="button"
            onClick={() => {
              setDetailError(null);
              setLoadingDetail(true);
              getFinancialAnalysis(detailId)
                .then((row) => {
                  setPayload((row?.payload ?? null) as typeof payload);
                  setDetailError(null);
                })
                .catch((e) => {
                  setPayload(null);
                  setDetailError(e instanceof Error ? e.message : "Detail analýzy se nepodařilo načíst.");
                })
                .finally(() => setLoadingDetail(false));
            }}
            className="mt-3 min-h-[44px] px-4 rounded-xl bg-rose-600 text-white text-sm font-bold"
          >
            Zkusit znovu
          </button>
        </MobileCard>
      ) : (
        <>
          <MobileCard className="divide-y divide-[color:var(--wp-surface-card-border)] py-0">
            <div className="flex items-center justify-between py-3 px-0.5">
              <span className="text-xs text-[color:var(--wp-text-secondary)] font-bold">Postup</span>
              <span className="text-sm font-black text-[color:var(--wp-text)]">
                Krok {currentStep} z {TOTAL_STEPS}
              </span>
            </div>
            {clientData?.name ? (
              <div className="flex items-center gap-2 py-3 px-0.5">
                <User size={13} className="text-[color:var(--wp-text-tertiary)]" />
                <span className="text-xs text-[color:var(--wp-text-secondary)] font-bold">{String(clientData.name)}</span>
              </div>
            ) : (
              <div className="py-3 px-0.5">
                <StatusBadge tone="warning">Chybí klientská data</StatusBadge>
              </div>
            )}
            {item?.lastExportedAt ? (
              <div className="flex items-center justify-between py-3 px-0.5">
                <span className="text-xs text-[color:var(--wp-text-secondary)]">Export</span>
                <span className="text-xs text-[color:var(--wp-text-secondary)] font-bold">
                  {formatUpdated(new Date(item.lastExportedAt))}
                </span>
              </div>
            ) : null}
          </MobileCard>

          {/* Step checklist */}
          <MobileCard className="p-3.5">
            <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2.5">
              Průběh kroků
            </p>
            <div className="grid grid-cols-4 gap-1.5">
              {Array.from({ length: TOTAL_STEPS }, (_, i) => {
                const step = i + 1;
                const done = step < currentStep;
                const active = step === currentStep;
                return (
                  <div
                    key={step}
                    className={cx(
                      "h-8 rounded-lg flex items-center justify-center text-xs font-black",
                      done ? "bg-emerald-100 text-emerald-700" : active ? "bg-indigo-600 text-white" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-tertiary)]"
                    )}
                  >
                    {step}
                  </div>
                );
              })}
            </div>
          </MobileCard>
        </>
      )}

      {/* Status actions */}
      <MobileCard className="p-3.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2.5">
          Změnit status
        </p>
        <div className="grid grid-cols-3 gap-2">
          <button
            type="button"
            onClick={() => onSetStatus("draft")}
            disabled={pending || item?.status === "draft"}
            className={cx(
              "min-h-[40px] rounded-lg border text-xs font-bold transition-colors",
              item?.status === "draft"
                ? "border-indigo-300 bg-indigo-50 text-indigo-700"
                : "border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"
            )}
          >
            Koncept
          </button>
          <button
            type="button"
            onClick={() => onSetStatus("completed")}
            disabled={pending || item?.status === "completed"}
            className={cx(
              "min-h-[40px] rounded-lg border text-xs font-bold transition-colors",
              item?.status === "completed"
                ? "border-emerald-300 bg-emerald-50 text-emerald-700"
                : "border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"
            )}
          >
            Hotovo
          </button>
          <button
            type="button"
            onClick={() => onSetStatus("archived")}
            disabled={pending || item?.status === "archived"}
            className={cx(
              "min-h-[40px] rounded-lg border text-xs font-bold transition-colors",
              item?.status === "archived"
                ? "border-amber-300 bg-amber-50 text-amber-700"
                : "border-[color:var(--wp-surface-card-border)] text-[color:var(--wp-text-secondary)]"
            )}
          >
            Archiv
          </button>
        </div>
      </MobileCard>

      <MobileCard className="p-3.5 border border-rose-200/80 bg-rose-50/30">
        <p className="text-[10px] font-black uppercase tracking-widest text-rose-800/90 mb-2.5">
          Nebezpečná zóna
        </p>
        {permanentDeleteStep === "idle" ? (
          <button
            type="button"
            onClick={() => setPermanentDeleteStep("confirm")}
            disabled={pending}
            className="w-full min-h-[44px] rounded-xl border border-rose-300 bg-[color:var(--wp-surface-card)] text-rose-800 text-sm font-bold hover:bg-rose-100 transition-colors disabled:opacity-50"
          >
            Smazat
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-bold text-rose-900">
              Opravdu trvale smazat tuto analýzu? Akci nelze vrátit zpět.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setPermanentDeleteStep("idle")}
                disabled={pending}
                className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50"
              >
                Ne
              </button>
              <button
                type="button"
                onClick={() => onPermanentDelete(detailId)}
                disabled={pending}
                className="min-h-[44px] rounded-xl bg-rose-600 text-white text-sm font-bold hover:bg-rose-500 disabled:opacity-50"
              >
                Ano, smazat
              </button>
            </div>
          </div>
        )}
      </MobileCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Main Screen                                                        */
/* ------------------------------------------------------------------ */

export function AnalysesHubScreen({
  detailIdFromPath,
  deviceClass = "phone",
}: {
  detailIdFromPath: string | null;
  deviceClass?: DeviceClass;
}) {
  const router = useRouter();
  const { toast, showToast, dismissToast } = useToast();
  const [items, setItems] = useState<FinancialAnalysisListItem[]>([]);
  const [filter, setFilter] = useState<Filter>("all");
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailId, setDetailId] = useState<string | null>(detailIdFromPath);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  function reload() {
    startTransition(async () => {
      setError(null);
      try {
        setItems(await listFinancialAnalyses());
      } catch (e) {
        setError(humanizeAdvisorActionError(e, "Načtení analýz selhalo."));
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

  const filtered = useMemo(() => {
    if (filter === "all") return items;
    if (filter === "draft") return items.filter((item) => item.status === "draft" || item.status === "archived");
    return items.filter((item) => item.status === "completed" || item.status === "exported");
  }, [items, filter]);

  const selectedItem = useMemo(() => items.find((i) => i.id === detailId), [items, detailId]);

  async function handleCreate() {
    startTransition(async () => {
      setError(null);
      try {
        const id = await saveFinancialAnalysisDraft({
          payload: { currentStep: 1, data: { client: { name: "" } } },
        });
        reload();
        showToast("Analýza vytvořena — otevíráme průvodce.", "success");
        router.push(`/portal/analyses/financial?id=${encodeURIComponent(id)}`);
      } catch (e) {
        setError(humanizeAdvisorActionError(e, "Vytvoření analýzy selhalo."));
      }
    });
  }

  async function handleSetStatus(status: FinancialAnalysisStatus) {
    if (!detailId) return;
    startTransition(async () => {
      try {
        await setFinancialAnalysisStatus(detailId, status);
        reload();
      } catch (e) {
        setError(humanizeAdvisorActionError(e, "Aktualizace statusu selhala."));
      }
    });
  }

  function handlePermanentDelete(id: string) {
    startTransition(async () => {
      try {
        await deleteFinancialAnalysisPermanently(id);
        if (detailId === id) {
          setDetailId(null);
          setDetailOpen(false);
        }
        reload();
        showToast("Analýza byla trvale smazána.", "success");
      } catch (e) {
        setError(humanizeAdvisorActionError(e, "Trvalé smazání analýzy selhalo."));
      }
    });
  }

  const draftCount = items.filter((i) => i.status === "draft" || i.status === "archived").length;
  const doneCount = items.filter((i) => i.status === "completed" || i.status === "exported").length;

  const isTablet = deviceClass === "tablet" || deviceClass === "desktop";

  return (
    <>
      {toast ? <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} /> : null}
      {error ? <ErrorState title={error} onRetry={reload} /> : null}

      {/* Header */}
      <div className="px-4 py-3 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)]">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FileText size={18} className="text-indigo-600" />
            <h2 className="text-base font-black text-[color:var(--wp-text)]">Finanční analýzy</h2>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={reload}
              disabled={pending}
              className="w-9 h-9 rounded-xl border border-[color:var(--wp-surface-card-border)] flex items-center justify-center"
            >
              <RefreshCw size={14} className={cx("text-[color:var(--wp-text-secondary)]", pending && "animate-spin")} />
            </button>
            <PendingButton
              type="button"
              onClick={handleCreate}
              isPending={pending}
              className="flex items-center gap-1.5 min-h-[36px] rounded-xl bg-indigo-600 text-white px-3 text-xs font-bold disabled:opacity-40"
            >
              <Plus size={14} />
              Nová
            </PendingButton>
          </div>
        </div>
        <div className="mt-2">
          <FilterChips
            value={filter}
            onChange={(id) => setFilter(id as Filter)}
            options={[
              { id: "all", label: "Vše", badge: items.length },
              { id: "draft", label: "Koncepty", badge: draftCount },
              { id: "done", label: "Hotové", badge: doneCount },
            ]}
          />
        </div>
      </div>

      {pending && items.length === 0 ? <LoadingSkeleton rows={3} /> : null}

      {!pending && filtered.length === 0 ? (
        <div className="px-4 pt-8">
          <EmptyState
            title="Žádné analýzy"
            description="Vytvořte první finanční analýzu přes tlačítko Nová."
          />
        </div>
      ) : null}

      {/* List — tablet: master-detail */}
      {isTablet ? (
        <div className="grid grid-cols-2 gap-0 h-[calc(100vh-10rem)]">
          {/* Master */}
          <div className="border-r border-[color:var(--wp-surface-card-border)] overflow-y-auto px-4 py-3 space-y-2">
            {filtered.map((item) => (
              <AnalysisListCard
                key={item.id}
                item={item}
                onOpen={() => {
                  setDetailId(item.id);
                  setDetailOpen(true);
                }}
              />
            ))}
          </div>
          {/* Detail */}
          <div className="overflow-y-auto px-4 py-3">
            {detailId ? (
              <AnalysisDetailPanel
                detailId={detailId}
                item={selectedItem}
                onSetStatus={handleSetStatus}
                onPermanentDelete={handlePermanentDelete}
                pending={pending}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <EmptyState title="Vyberte analýzu" description="Klikněte na analýzu vlevo." />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2">
          {filtered.map((item) => (
            <AnalysisListCard
              key={item.id}
              item={item}
              onOpen={() => {
                setDetailId(item.id);
                setDetailOpen(true);
              }}
            />
          ))}
        </div>
      )}

      {/* Phone detail sheet */}
      {!isTablet ? (
        <FullscreenSheet open={detailOpen} onClose={() => setDetailOpen(false)} title="Detail analýzy">
          {detailId ? (
            <AnalysisDetailPanel
              detailId={detailId}
              item={selectedItem}
              onSetStatus={handleSetStatus}
              onPermanentDelete={handlePermanentDelete}
              pending={pending}
            />
          ) : (
            <EmptyState title="Analýza není vybraná" />
          )}
        </FullscreenSheet>
      ) : null}
    </>
  );
}
