"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { BarChart2 } from "lucide-react";
import {
  getCoverageForContact,
  setCoverageStatus,
  createOpportunityFromCoverageItem,
  createTaskFromCoverageItem,
} from "@/app/actions/coverage";
import type { ResolvedCoverageItem, CoverageSummary } from "@/app/lib/coverage/types";
import type { CoverageStatus } from "@/app/lib/coverage/types";

const STATUS_LABELS: Record<CoverageStatus, string> = {
  done: "Hotovo",
  in_progress: "Řeší se",
  none: "Nastavit",
  not_relevant: "Nerelevantní",
  opportunity: "Příležitost",
};

const STATUS_CYCLE: CoverageStatus[] = ["none", "in_progress", "done", "opportunity", "not_relevant"];

function nextStatus(s: CoverageStatus): CoverageStatus {
  const i = STATUS_CYCLE.indexOf(s);
  return STATUS_CYCLE[(i + 1) % STATUS_CYCLE.length];
}

function StatusIcon({ status }: { status: CoverageStatus }) {
  const size = 16;
  if (status === "done")
    return (
      <span className="shrink-0" style={{ color: "var(--wp-success)" }} aria-hidden>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <path d="M20 6L9 17l-5-5" />
        </svg>
      </span>
    );
  if (status === "in_progress" || status === "opportunity")
    return (
      <span className="shrink-0" style={{ color: "var(--wp-warning)" }} aria-hidden>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10" />
          <path d="M12 6v6l4 2" />
        </svg>
      </span>
    );
  if (status === "not_relevant")
    return (
      <span className="shrink-0 text-slate-400" aria-hidden>
        <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <line x1="18" y1="6" x2="6" y2="18" />
          <line x1="6" y1="6" x2="18" y2="18" />
        </svg>
      </span>
    );
  return (
    <span className="shrink-0" style={{ color: "var(--wp-text-muted)", opacity: 0.5 }} aria-hidden>
      <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <circle cx="12" cy="12" r="10" />
      </svg>
    </span>
  );
}

/** Samostatný blok „Celkové pokrytí portfolia“ – nad kartou Pokrytí produktů. */
export function CoverageSummaryBar({ summary }: { summary: CoverageSummary }) {
  const { done, inProgress, none, notRelevant, opportunity, total } = summary;
  const donePct = total ? (done / total) * 100 : 0;
  const inProgressPct = total ? (inProgress / total) * 100 : 0;
  const opportunityPct = total ? (opportunity / total) * 100 : 0;

  return (
    <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm p-6 flex flex-col justify-center">
      <h3 className="font-black text-slate-800 uppercase tracking-widest text-[11px] mb-4">Celkové pokrytí portfolia</h3>
      <div className="flex gap-2 text-sm font-bold mb-3">
        <span className="text-emerald-600">{done} hotovo</span>
        <span className="text-slate-300">,</span>
        <span className="text-amber-500">{inProgress} řeší se</span>
        <span className="text-slate-300">,</span>
        <span className="text-slate-500">{none} nic</span>
        {opportunity > 0 && (
          <>
            <span className="text-slate-300">,</span>
            <span className="text-indigo-500">{opportunity} příležitost</span>
          </>
        )}
        {notRelevant > 0 && (
          <>
            <span className="text-slate-300">,</span>
            <span className="text-slate-400">{notRelevant} nerelevantní</span>
          </>
        )}
      </div>
      <div className="h-2 w-full max-w-md mx-auto bg-slate-100 rounded-full overflow-hidden flex">
        <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${donePct}%` }} />
        <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${inProgressPct}%` }} />
        <div className="h-full bg-indigo-500 transition-all duration-500" style={{ width: `${opportunityPct}%` }} />
      </div>
    </div>
  );
}

/** Výběr stavu – cyklus při kliku. */
function CoverageStatusSelector({
  status,
  onSelect,
  disabled,
}: {
  status: CoverageStatus;
  onSelect: () => void;
  disabled?: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      disabled={disabled}
      className="min-h-[44px] min-w-[44px] flex items-center gap-2 px-3 py-2 rounded-[var(--wp-radius-sm)] hover:bg-slate-100 transition-colors touch-manipulation"
      title="Klikni pro změnu stavu"
      aria-label={`Stav: ${STATUS_LABELS[status]}. Klikni pro změnu.`}
    >
      <StatusIcon status={status} />
      <span className="text-sm font-medium text-slate-700">{STATUS_LABELS[status]}</span>
    </button>
  );
}

/** Kontextové akce u položky. */
function CoverageActionsMenu({
  contactId,
  item,
  onOpportunityCreated,
  onTaskCreated,
}: {
  contactId: string;
  item: ResolvedCoverageItem;
  onOpportunityCreated: () => void;
  onTaskCreated: () => void;
}) {
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  async function handleCreateOpportunity() {
    setLoading(true);
    try {
      await createOpportunityFromCoverageItem(contactId, item.itemKey);
      onOpportunityCreated();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  async function handleCreateTask() {
    setLoading(true);
    try {
      await createTaskFromCoverageItem(contactId, item.itemKey);
      onTaskCreated();
    } finally {
      setLoading(false);
      setOpen(false);
    }
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-h-[44px] min-w-[44px] p-2 rounded-[var(--wp-radius-sm)] hover:bg-slate-100 text-slate-500 touch-manipulation"
        aria-label="Další akce"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-10" aria-hidden onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full mt-1 z-20 min-w-[180px] rounded-[var(--wp-radius-sm)] border border-slate-200 bg-white shadow-lg py-1">
            {item.linkedContractId && (
              <Link
                href={`/portal/contacts/${contactId}#produkty`}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 min-h-[44px] flex items-center"
                onClick={() => setOpen(false)}
              >
                Smlouva →
              </Link>
            )}
            {item.linkedOpportunityId && (
              <Link
                href={`/portal/pipeline/${item.linkedOpportunityId}`}
                className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 min-h-[44px] flex items-center"
                onClick={() => setOpen(false)}
              >
                Obchod →
              </Link>
            )}
            <button
              type="button"
              onClick={handleCreateOpportunity}
              disabled={loading}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 min-h-[44px] flex items-center disabled:opacity-50"
            >
              Založit obchod
            </button>
            <button
              type="button"
              onClick={handleCreateTask}
              disabled={loading}
              className="w-full text-left px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 min-h-[44px] flex items-center disabled:opacity-50"
            >
              Vytvořit úkol
            </button>
            <Link
              href={`/portal/contacts/${contactId}#ukoly`}
              className="block px-4 py-2 text-sm text-slate-700 hover:bg-slate-50 min-h-[44px] flex items-center"
              onClick={() => setOpen(false)}
            >
              Úkoly →
            </Link>
          </div>
        </>
      )}
    </div>
  );
}

/** Jedna položka v oblasti. */
function CoverageItemRow({
  contactId,
  item,
  onStatusChange,
  onRefresh,
}: {
  contactId: string;
  item: ResolvedCoverageItem;
  onStatusChange: () => void;
  onRefresh: () => void;
}) {
  const [updating, setUpdating] = useState(false);

  async function handleCycleStatus() {
    setUpdating(true);
    try {
      await setCoverageStatus(contactId, item.itemKey, {
        status: nextStatus(item.status),
      });
      onStatusChange();
    } finally {
      setUpdating(false);
    }
  }

  const bgClass =
    item.status === "done"
      ? "bg-green-50 border-green-200"
      : item.status === "in_progress" || item.status === "opportunity"
        ? "bg-amber-50 border-amber-200"
        : item.status === "not_relevant"
          ? "bg-slate-50 border-slate-200"
          : "bg-white border-slate-200";

  return (
    <div
      className={`flex items-center gap-2 px-3 py-2 rounded-[var(--wp-radius-sm)] border ${bgClass} min-h-[44px]`}
    >
      <CoverageStatusSelector
        status={item.status}
        onSelect={handleCycleStatus}
        disabled={updating}
      />
      <span className="flex-1 text-sm font-medium text-slate-800 truncate">{item.label}</span>
      <CoverageActionsMenu
        contactId={contactId}
        item={item}
        onOpportunityCreated={onRefresh}
        onTaskCreated={onRefresh}
      />
    </div>
  );
}

/** Barvy karet podle kategorie (spec klienti dash v2). */
const CATEGORY_COLORS: Record<string, { bg: string; border: string; icon: string }> = {
  "Pojištění auta": { bg: "bg-indigo-50", border: "border-indigo-100", icon: "text-indigo-400" },
  "Pojištění majetku": { bg: "bg-yellow-50", border: "border-yellow-100", icon: "text-yellow-500" },
  "Pojištění odpovědnosti": { bg: "bg-emerald-50", border: "border-emerald-100", icon: "text-emerald-500" },
  "Pojištění zaměstnanecké odpovědnosti": { bg: "bg-emerald-50", border: "border-emerald-100", icon: "text-emerald-500" },
  "Životní pojištění": { bg: "bg-rose-50", border: "border-rose-100", icon: "text-rose-400" },
  "Úvěry": { bg: "bg-amber-50", border: "border-amber-100", icon: "text-blue-500" },
  "Investice": { bg: "bg-purple-50", border: "border-purple-100", icon: "text-purple-400" },
  "DPS": { bg: "bg-blue-50", border: "border-blue-100", icon: "text-slate-500" },
};

function getCategoryStyle(category: string) {
  return CATEGORY_COLORS[category] ?? { bg: "bg-slate-50", border: "border-slate-100", icon: "text-slate-500" };
}

/** Karta jedné kategorie (oblasti). */
function CoverageAreaCard({
  category,
  items,
  contactId,
  onRefresh,
}: {
  category: string;
  items: ResolvedCoverageItem[];
  contactId: string;
  onRefresh: () => void;
}) {
  const style = getCategoryStyle(category);
  const initial = category.charAt(0).toUpperCase();
  return (
    <div className={`flex flex-col p-5 rounded-2xl border ${style.bg} ${style.border}`}>
      <div className="flex items-center gap-2 mb-3">
        <span className={`text-lg font-black ${style.icon}`} aria-hidden>{initial}</span>
        <h3 className="font-bold text-sm text-slate-800">{category}</h3>
      </div>
      <div className="space-y-1.5">
        {items.map((item) => (
          <CoverageItemRow
            key={item.itemKey}
            contactId={contactId}
            item={item}
            onStatusChange={onRefresh}
            onRefresh={onRefresh}
          />
        ))}
      </div>
    </div>
  );
}

/** Hook: načte coverage a vrací refetch. */
export function useClientCoverage(contactId: string) {
  const [items, setItems] = useState<ResolvedCoverageItem[]>([]);
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await getCoverageForContact(contactId);
      setItems(result.resolvedItems);
      setSummary(result.summary);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Failed to load coverage"));
    } finally {
      setLoading(false);
    }
  }, [contactId]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    items,
    summary,
    loading,
    error,
    refetch,
  };
}

/** Hlavní widget – použití na záložce Přehled. */
export function ClientCoverageWidget({ contactId }: { contactId: string }) {
  const { items, summary, loading, error, refetch } = useClientCoverage(contactId);

  const byCategory = items.reduce<Record<string, ResolvedCoverageItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  if (error) {
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-slate-200 bg-white p-6 shadow-sm text-sm text-red-600">
        Chyba při načítání pokrytí: {error.message}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-white rounded-[24px] border border-slate-100 p-6 shadow-sm text-sm text-slate-500">
        Načítám pokrytí…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Samostatný blok Celkové pokrytí portfolia (nad kartou) */}
      {summary && summary.total > 0 && <CoverageSummaryBar summary={summary} />}

      {/* Karta Pokrytí produktů */}
      <div className="bg-white rounded-[24px] border border-slate-100 shadow-sm overflow-hidden">
        <div className="px-6 py-5 border-b border-slate-50 flex items-center justify-between">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <BarChart2 size={20} className="text-indigo-500" aria-hidden />
            Pokrytí produktů
          </h2>
          <Link
            href={`/portal/contacts/${contactId}#obchody`}
            className="text-sm font-black text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1 min-h-[44px]"
          >
            Obchody <span aria-hidden>→</span>
          </Link>
        </div>
        <div className="p-6">
          {summary && (
            <div className="max-w-md mx-auto mb-8 text-center">
              <div className="flex justify-center gap-2 text-sm font-bold mb-2">
                <span className="text-emerald-600">{summary.done} hotovo</span>
                <span className="text-slate-300">,</span>
                <span className="text-amber-500">{summary.inProgress} řeší se</span>
                <span className="text-slate-300">,</span>
                <span className="text-slate-500">{summary.none} nic</span>
              </div>
              <div className="h-1.5 w-full bg-slate-100 rounded-full overflow-hidden flex">
                <div className="h-full bg-emerald-500 transition-all duration-500" style={{ width: `${summary.total ? (summary.done / summary.total) * 100 : 0}%` }} />
                <div className="h-full bg-amber-400 transition-all duration-500" style={{ width: `${summary.total ? (summary.inProgress / summary.total) * 100 : 0}%` }} />
              </div>
              <p className="text-[10px] text-slate-400 font-bold uppercase tracking-widest mt-3">Klikni na položku pro změnu stavu.</p>
            </div>
          )}
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
            {Object.entries(byCategory).map(([category, categoryItems]) => (
              <CoverageAreaCard
                key={category}
                category={category}
                items={categoryItems}
                contactId={contactId}
                onRefresh={refetch}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
