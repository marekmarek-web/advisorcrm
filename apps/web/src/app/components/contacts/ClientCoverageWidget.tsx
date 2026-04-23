"use client";

import { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
import Link from "next/link";
import {
  BarChart2,
  Briefcase,
  Car,
  Home,
  ShieldCheck,
  ShieldAlert,
  Heart,
  CreditCard,
  TrendingUp,
  PiggyBank,
  CheckCircle2,
  Clock,
  Circle,
} from "lucide-react";
import {
  getCoverageForContact,
  setCoverageStatus,
  createOpportunityFromCoverageItem,
  createTaskFromCoverageItem,
  createOpportunityFromFaItem,
} from "@/app/actions/coverage";
import type { ResolvedCoverageItem, CoverageSummary } from "@/app/lib/coverage/types";
import type { CoverageStatus } from "@/app/lib/coverage/types";
import { getAllCoverageItemKeys } from "@/app/lib/coverage/item-keys";
import { useToast } from "@/app/components/Toast";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";

/** Zobrazené názvy kategorií podle spec „pokryti produktu.txt“. */
const DISPLAY_CATEGORY_NAMES: Record<string, string> = {
  "Pojištění auta": "Pojištění auta",
  Majetek: "Pojištění majetku",
  "Pojištění odpovědnosti": "Odpovědnost",
  "Pojištění zaměstnanecké odpovědnosti": "Poj. zaměstnance",
  "Životní pojištění": "Životní pojištění",
  Úvěry: "Úvěry & Bydlení",
  Investice: "Investice",
  DPS: "DPS",
};

/** Pořadí kategorií podle spec (8 kategorií). */
const CATEGORY_ORDER = [
  "Pojištění auta",
  "Majetek",
  "Pojištění odpovědnosti",
  "Pojištění zaměstnanecké odpovědnosti",
  "Životní pojištění",
  "Úvěry",
  "Investice",
  "DPS",
];

/** Výchozí položky pro zobrazení mřížky když API vrátí prázdný seznam. */
function getDefaultCoverageItems(): ResolvedCoverageItem[] {
  return getAllCoverageItemKeys().map(({ itemKey, segmentCode, category, label }) => ({
    itemKey,
    segmentCode,
    category,
    label,
    status: "none" as const,
    linkedContractId: null,
    linkedOpportunityId: null,
    source: "default" as const,
    isRelevant: true,
    notes: null,
  }));
}

/** Spec: rotace none -> pending -> active -> none; backend stavy: none, in_progress, done. */
const SPEC_CYCLE: CoverageStatus[] = ["none", "in_progress", "done"];

function nextStatus(s: CoverageStatus): CoverageStatus {
  const normalized = s === "opportunity" ? "in_progress" : s === "not_relevant" ? "none" : s;
  const i = SPEC_CYCLE.indexOf(normalized);
  return SPEC_CYCLE[(i + 1) % SPEC_CYCLE.length];
}

const STATUS_LABELS: Record<CoverageStatus, string> = {
  done: "Hotovo",
  in_progress: "Řeší se",
  none: "Nastavit",
  not_relevant: "Nerelevantní",
  opportunity: "Příležitost",
};

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
      <span className="shrink-0 text-[color:var(--wp-text-muted)]" aria-hidden>
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
    <div className="bg-[color:var(--wp-surface)] rounded-[24px] border border-[color:var(--wp-border)] shadow-sm p-6 flex flex-col justify-center">
      <h3 className="font-black text-[color:var(--wp-text)] uppercase tracking-widest text-[11px] mb-4">Celkové pokrytí portfolia</h3>
      <div className="flex gap-2 text-sm font-bold mb-3 flex-wrap">
        <span className="text-emerald-600 dark:text-emerald-400">{done} hotovo</span>
        <span className="text-[color:var(--wp-text-muted)]">,</span>
        <span className="text-amber-500 dark:text-amber-400">{inProgress} řeší se</span>
        <span className="text-[color:var(--wp-text-muted)]">,</span>
        <span className="text-[color:var(--wp-text-muted)]">{none} nic</span>
        {opportunity > 0 && (
          <>
            <span className="text-[color:var(--wp-text-muted)]">,</span>
            <span className="text-indigo-500 dark:text-indigo-400">{opportunity} příležitost</span>
          </>
        )}
        {notRelevant > 0 && (
          <>
            <span className="text-[color:var(--wp-text-muted)]">,</span>
            <span className="text-[color:var(--wp-text-muted)]">{notRelevant} nerelevantní</span>
          </>
        )}
      </div>
      <div className="h-2 w-full max-w-md mx-auto bg-[color:var(--wp-surface-inset)] rounded-full overflow-hidden flex">
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
      className="min-h-[44px] min-w-[44px] flex items-center gap-2 px-3 py-2 rounded-[var(--wp-radius-sm)] hover:bg-[color:var(--wp-surface-muted)] transition-colors touch-manipulation"
      title="Klikni pro změnu stavu"
      aria-label={`Stav: ${STATUS_LABELS[status]}. Klikni pro změnu.`}
    >
      <StatusIcon status={status} />
      <span className="text-sm font-medium text-[color:var(--wp-text)]">{STATUS_LABELS[status]}</span>
    </button>
  );
}

/** Kontextové akce u položky. Dropdown vykreslen přes Portal, aby přesahoval mřížku. */
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
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);
  const [menuPosition, setMenuPosition] = useState<{ bottom: number; right: number } | null>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open || !triggerRef.current) {
      setMenuPosition(null);
      return;
    }
    const rect = triggerRef.current.getBoundingClientRect();
    setMenuPosition({
      bottom: window.innerHeight - rect.top + 4,
      right: window.innerWidth - rect.right,
    });
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
    };
  }, [open]);

  function invalidatePipelineTasksContacts() {
    void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.tasks.all });
    void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
  }

  async function handleCreateOpportunity() {
    setLoading(true);
    setOpen(false);
    try {
      const newId = await createOpportunityFromCoverageItem(contactId, item.itemKey);
      onOpportunityCreated();
      toast.showToast("Obchod založen", "success");
      if (newId) router.push(`/portal/pipeline/${newId}`);
      else invalidatePipelineTasksContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Obchod se nepodařilo vytvořit";
      toast.showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  async function handleCreateTask() {
    setLoading(true);
    setOpen(false);
    try {
      const taskId = await createTaskFromCoverageItem(contactId, item.itemKey);
      onTaskCreated();
      toast.showToast("Úkol vytvořen", "success");
      router.push(`/portal/contacts/${contactId}#ukoly`);
      if (!taskId) invalidatePipelineTasksContacts();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Úkol se nepodařilo vytvořit";
      toast.showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  const menuContent =
    open && typeof document !== "undefined" ? (
      <>
        <div className="fixed inset-0 z-[100]" aria-hidden onClick={() => setOpen(false)} />
        <div
          className="fixed z-[101] min-w-[180px] rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] shadow-lg py-1"
          style={
            menuPosition
              ? { bottom: menuPosition.bottom, right: menuPosition.right }
              : { visibility: "hidden" as const }
          }
        >
          {item.linkedContractId && (
            <Link
              href={`/portal/contacts/${contactId}#produkty`}
              className="block px-4 py-2 text-sm text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] flex items-center"
              onClick={() => setOpen(false)}
            >
              Smlouva →
            </Link>
          )}
          {item.linkedOpportunityId && (
            <Link
              href={`/portal/pipeline/${item.linkedOpportunityId}`}
              className="block px-4 py-2 text-sm text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] flex items-center"
              onClick={() => setOpen(false)}
            >
              Obchod →
            </Link>
          )}
          <button
            type="button"
            onClick={handleCreateOpportunity}
            disabled={loading}
            className="w-full text-left px-4 py-2 text-sm text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] flex items-center disabled:opacity-50"
          >
            Založit obchod
          </button>
          <button
            type="button"
            onClick={handleCreateTask}
            disabled={loading}
            className="w-full text-left px-4 py-2 text-sm text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] flex items-center disabled:opacity-50"
          >
            Vytvořit úkol
          </button>
          <Link
            href={`/portal/contacts/${contactId}#ukoly`}
            className="block px-4 py-2 text-sm text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)] min-h-[44px] flex items-center"
            onClick={() => setOpen(false)}
          >
            Úkoly →
          </Link>
        </div>
      </>
    ) : null;

  return (
    <div className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="min-h-[44px] min-w-[44px] p-2 rounded-[var(--wp-radius-sm)] hover:bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-muted)] touch-manipulation"
        aria-label="Další akce"
        aria-expanded={open}
      >
        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="1" />
          <circle cx="12" cy="5" r="1" />
          <circle cx="12" cy="19" r="1" />
        </svg>
      </button>
      {menuContent && createPortal(menuContent, document.body)}
    </div>
  );
}

/** Jedna položka – spec: tlačítko s ikonou stavu (Hotovo/Řeší se/Nastavit), cyklus none->pending->active->none. Optimistic update: UI se změní hned, persistence na pozadí. */
function CreateFaOpportunityButton({
  faItemId,
  onCreated,
}: {
  faItemId: string;
  onCreated: () => void;
}) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  async function handleClick() {
    setLoading(true);
    try {
      const newId = await createOpportunityFromFaItem(faItemId);
      onCreated();
      toast.showToast("Obchod založen z FA", "success");
      if (newId) router.push(`/portal/pipeline/${newId}`);
      else {
        void queryClient.invalidateQueries({ queryKey: queryKeys.pipeline.all });
        void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.all });
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Obchod se nepodařilo vytvořit";
      toast.showToast(msg, "error");
    } finally {
      setLoading(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="min-h-[44px] min-w-[44px] p-2 rounded-[var(--wp-radius-sm)] hover:bg-indigo-50 text-indigo-500 hover:text-indigo-700 transition-colors touch-manipulation disabled:opacity-50"
      title="Založit obchod z FA"
      aria-label="Založit obchod z finanční analýzy"
    >
      <Briefcase size={18} strokeWidth={2} />
    </button>
  );
}

function CoverageItemRow({
  contactId,
  item,
  onStatusChange,
  onOptimisticStatusChange,
  onRefresh,
  single,
  readOnly,
}: {
  contactId: string;
  item: ResolvedCoverageItem;
  onStatusChange: (silent?: boolean) => void;
  onOptimisticStatusChange: (itemKey: string, status: CoverageStatus) => void;
  onRefresh: () => void;
  single?: boolean;
  /** Klientská zóna: jen náhled, bez úprav stavu. */
  readOnly?: boolean;
}) {
  const [updating, setUpdating] = useState(false);
  const toast = useToast();
  const isDone = item.status === "done";
  const isPending = item.status === "in_progress" || item.status === "opportunity";
  const isNone = !isDone && !isPending;

  if (readOnly) {
    const roLabel = single && isDone ? "Hotovo" : single && isPending ? "Řeší se" : single && isNone ? "Nastavit" : item.label;
    return (
      <div className="flex items-center gap-2 w-full min-w-0">
        <div
          className={`group/btn flex items-center gap-3 text-[13px] font-bold px-3 py-2.5 rounded-xl w-full min-w-0 border min-h-[44px] ${
            single ? "justify-center" : "text-left"
          } ${
            isDone
              ? "bg-emerald-50 text-emerald-800 border-emerald-200"
              : isPending
                ? "bg-amber-50 text-amber-800 border-amber-200"
                : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-muted)] border-[color:var(--wp-border)]"
          }`}
        >
          {isDone && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" aria-hidden />}
          {isPending && <Clock size={16} className="text-amber-500 shrink-0" aria-hidden />}
          {isNone && <Circle size={16} className="text-[color:var(--wp-text-muted)] shrink-0" aria-hidden />}
          <span className="min-w-0 line-clamp-2 text-left break-words">{roLabel}</span>
        </div>
      </div>
    );
  }

  async function handleCycleStatus() {
    const next = nextStatus(item.status);
    const previousStatus = item.status;
    onOptimisticStatusChange(item.itemKey, next);
    setUpdating(true);
    try {
      await setCoverageStatus(contactId, item.itemKey, { status: next });
      onStatusChange(true);
      toast.showToast("Stav pokrytí uložen", "success");
    } catch (err) {
      onOptimisticStatusChange(item.itemKey, previousStatus);
      const message = err instanceof Error ? err.message : "Změna stavu se nepovedla";
      toast.showToast(message, "error");
    } finally {
      setUpdating(false);
    }
  }

  const btnClass =
    isDone
      ? "bg-emerald-50 text-emerald-700 border-emerald-200 shadow-sm dark:bg-emerald-950/35 dark:text-emerald-300 dark:border-emerald-800/50"
      : isPending
        ? "bg-amber-50 text-amber-700 border-amber-200 shadow-sm dark:bg-amber-950/35 dark:text-amber-300 dark:border-amber-800/50"
        : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-muted)] border-[color:var(--wp-border)] hover:bg-[color:var(--wp-surface)] hover:shadow-md dark:hover:bg-[color:var(--wp-surface-card)]";

  const label =
    single && isDone ? "Hotovo" : single && isPending ? "Řeší se" : single && isNone ? "Nastavit" : item.label;

  const showFaButton = !!item.faItemId && !item.linkedOpportunityId;

  return (
    <div className="flex items-center gap-2 w-full min-w-0">
      <button
        type="button"
        onClick={handleCycleStatus}
        disabled={updating}
        className={`group/btn flex items-center gap-3 text-[13px] font-bold px-3 py-2.5 rounded-xl w-full min-w-0 border transition-all duration-300 transform active:scale-95 min-h-[44px] touch-manipulation ${single ? "justify-center" : "text-left"} ${btnClass}`}
        title="Klikni na položku pro změnu stavu"
      >
        {isDone && <CheckCircle2 size={16} className="text-emerald-500 shrink-0" aria-hidden />}
        {isPending && <Clock size={16} className="text-amber-500 shrink-0" aria-hidden />}
        {isNone && <Circle size={16} className="text-[color:var(--wp-text-muted)] shrink-0 group-hover/btn:text-indigo-400 transition-colors" aria-hidden />}
        <span className="min-w-0 line-clamp-2 text-left break-words">{label}</span>
      </button>
      {!single && showFaButton && (
        <CreateFaOpportunityButton faItemId={item.faItemId!} onCreated={onRefresh} />
      )}
      {!single && (
        <CoverageActionsMenu
          contactId={contactId}
          item={item}
          onOpportunityCreated={onRefresh}
          onTaskCreated={onRefresh}
        />
      )}
    </div>
  );
}

/** Ikony a barvy kategorií podle spec „pokryti produktu.txt“. */
const CATEGORY_SPEC: Record<string, { icon: typeof Car; from: string; to: string; iconColor: string; shadowColor: string }> = {
  "Pojištění auta": { icon: Car, from: "from-indigo-500/5", to: "to-blue-500/5", iconColor: "text-indigo-500", shadowColor: "shadow-indigo-500" },
  Majetek: { icon: Home, from: "from-amber-500/5", to: "to-orange-500/5", iconColor: "text-amber-500", shadowColor: "shadow-amber-500" },
  "Pojištění odpovědnosti": { icon: ShieldCheck, from: "from-emerald-500/5", to: "to-teal-500/5", iconColor: "text-emerald-500", shadowColor: "shadow-emerald-500" },
  "Pojištění zaměstnanecké odpovědnosti": { icon: ShieldAlert, from: "from-emerald-500/5", to: "to-teal-500/5", iconColor: "text-emerald-500", shadowColor: "shadow-emerald-500" },
  "Životní pojištění": { icon: Heart, from: "from-rose-500/5", to: "to-pink-500/5", iconColor: "text-rose-500", shadowColor: "shadow-rose-500" },
  Úvěry: { icon: CreditCard, from: "from-cyan-500/5", to: "to-blue-500/5", iconColor: "text-cyan-500", shadowColor: "shadow-cyan-500" },
  Investice: { icon: TrendingUp, from: "from-purple-500/5", to: "to-fuchsia-500/5", iconColor: "text-purple-500", shadowColor: "shadow-purple-500" },
  DPS: { icon: PiggyBank, from: "from-slate-500/5", to: "to-gray-500/5", iconColor: "text-[color:var(--wp-text-muted)]", shadowColor: "shadow-slate-500" },
};

function getCategorySpec(category: string) {
  return (
    CATEGORY_SPEC[category] ?? {
      icon: BarChart2,
      from: "from-slate-500/5",
      to: "to-slate-500/5",
      iconColor: "text-[color:var(--wp-text-muted)]",
      shadowColor: "shadow-slate-500",
    }
  );
}

/** Karta jedné kategorie (glass-card, ikona, spec „pokryti produktu.txt“). */
function CoverageAreaCard({
  category,
  displayName,
  items,
  contactId,
  onRefresh,
  onOptimisticStatusChange,
  readOnly,
}: {
  category: string;
  displayName: string;
  items: ResolvedCoverageItem[];
  contactId: string;
  onRefresh: () => void;
  onOptimisticStatusChange: (itemKey: string, status: CoverageStatus) => void;
  readOnly?: boolean;
}) {
  const spec = getCategorySpec(category);
  const Icon = spec.icon;
  const single = items.length === 1;
  return (
    <div className="relative rounded-[28px] p-5 flex flex-col h-full group hover:bg-white/80 dark:hover:bg-[color:var(--wp-surface-card)]/80 transition-all duration-500 overflow-hidden border border-white/60 dark:border-[color:var(--wp-border)] bg-white/40 dark:bg-[color:var(--wp-surface-muted)]/40 backdrop-blur-[12px] shadow-[0_8px_30px_rgba(0,0,0,0.04)] dark:shadow-[0_8px_30px_rgba(0,0,0,0.25)]">
      <div className={`absolute inset-0 bg-gradient-to-br ${spec.from} ${spec.to} opacity-50 group-hover:opacity-100 transition-opacity duration-500 z-0`} aria-hidden />
      <div className="relative z-10 flex flex-col items-center justify-center mb-6 text-center pt-2">
        <div className={`w-14 h-14 bg-white dark:bg-[color:var(--wp-surface-card)] rounded-2xl shadow-md ${spec.shadowColor}/20 mb-4 flex items-center justify-center ${spec.iconColor} group-hover:scale-110 group-hover:-translate-y-1 transition-all duration-500`}>
          <Icon size={24} strokeWidth={2.5} aria-hidden />
        </div>
        <h4 className="font-black text-[color:var(--wp-text)] text-[15px] tracking-tight leading-tight">{displayName}</h4>
      </div>
      <div className={`relative z-10 flex flex-col gap-2 mt-auto min-w-0 ${single ? "items-center justify-center" : ""}`}>
        {items.map((item) => (
          <CoverageItemRow
            key={item.itemKey}
            contactId={contactId}
            item={item}
            onStatusChange={onRefresh}
            onOptimisticStatusChange={onOptimisticStatusChange}
            onRefresh={onRefresh}
            single={single}
            readOnly={readOnly}
          />
        ))}
      </div>
    </div>
  );
}

/** Hook: načte coverage, refetch a optimistic update. */
export function useClientCoverage(contactId: string) {
  const [items, setItems] = useState<ResolvedCoverageItem[]>([]);
  const [summary, setSummary] = useState<CoverageSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);

  const refetch = useCallback(async (silent?: boolean) => {
    if (!silent) setLoading(true);
    setError(null);
    try {
      const result = await getCoverageForContact(contactId);
      setItems(result.resolvedItems);
      setSummary(result.summary);
    } catch (e) {
      setError(e instanceof Error ? e : new Error("Failed to load coverage"));
    } finally {
      if (!silent) setLoading(false);
    }
  }, [contactId]);

  const applyOptimisticStatus = useCallback((itemKey: string, status: CoverageStatus) => {
    setItems((prev) =>
      prev.map((i) => (i.itemKey === itemKey ? { ...i, status } : i))
    );
  }, []);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return {
    items,
    summary,
    loading,
    error,
    refetch,
    applyOptimisticStatus,
  };
}

/** Hlavní widget – použití na záložce Přehled (spec „pokryti produktu.txt“). */
export function ClientCoverageWidget({
  contactId,
  readOnly,
}: {
  contactId: string;
  /** true = klientská zóna (bez změn stavu / akcí). */
  readOnly?: boolean;
}) {
  const { items, summary, loading, error, refetch, applyOptimisticStatus } = useClientCoverage(contactId);

  const itemsForGrid = items.length > 0 ? items : getDefaultCoverageItems();
  const byCategory = itemsForGrid.reduce<Record<string, ResolvedCoverageItem[]>>((acc, item) => {
    if (!acc[item.category]) acc[item.category] = [];
    acc[item.category].push(item);
    return acc;
  }, {});

  if (error) {
    const isGenericError =
      /Server Components|production|digest|An error occurred/i.test(error.message) || error.message.length > 120;
    const displayMessage = isGenericError
      ? "Pokrytí produktů se nepodařilo načíst. Zkontrolujte, že je v databázi vytvořena tabulka pro pokrytí (v README: příkaz pnpm run db:apply-schema)."
      : error.message;
    if (process.env.NODE_ENV === "development") {
      console.error("[ClientCoverageWidget] getCoverageForContact error:", error.message);
    }
    return (
      <div className="rounded-[var(--wp-radius-lg)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-6 shadow-sm text-sm text-red-600">
        Chyba při načítání pokrytí: {displayMessage}
      </div>
    );
  }

  if (loading) {
    return (
      <div className="bg-[color:var(--wp-surface)] rounded-[24px] border border-[color:var(--wp-border)] p-6 shadow-sm text-sm text-[color:var(--wp-text-muted)]">
        Načítám pokrytí…
      </div>
    );
  }

  const activeCount = summary?.done ?? 0;
  const pendingCount = (summary?.inProgress ?? 0) + (summary?.opportunity ?? 0);
  const totalCount = summary?.total ?? 0;
  const activePct = totalCount > 0 ? (activeCount / totalCount) * 100 : 0;
  const pendingPct = totalCount > 0 ? (pendingCount / totalCount) * 100 : 0;

  return (
    <div className="space-y-6">
      {/* Glass panel podle spec „pokryti produktu.txt“ */}
      <div className="w-full rounded-[32px] p-6 sm:p-8 border border-white/50 dark:border-[color:var(--wp-border)] bg-white/85 dark:bg-[color:var(--wp-surface-card)]/90 backdrop-blur-[20px] shadow-[0_8px_32px_rgba(31,38,135,0.05)] dark:shadow-[0_8px_32px_rgba(0,0,0,0.2)]">
        <div className="flex flex-col md:flex-row items-center justify-between mb-8 gap-6">
          <div className="flex items-center gap-4">
            <div className="w-14 h-14 bg-indigo-50 dark:bg-indigo-950/50 rounded-2xl flex items-center justify-center text-indigo-600 dark:text-indigo-300 shadow-inner">
              <BarChart2 size={28} strokeWidth={2.5} aria-hidden />
            </div>
            <div>
              <h2 className="text-2xl font-black text-[color:var(--wp-text)] tracking-tight">Pokrytí produktů</h2>
              <p className="text-sm font-bold text-[color:var(--wp-text-muted)] mt-1">
                {readOnly
                  ? "Přehled stavu u poradce (včetně domácnosti, kde je to zaznamenáno)"
                  : "Interaktivní mapa klientova portfolia"}
              </p>
            </div>
          </div>
          <div className="flex-1 max-w-sm w-full bg-slate-50/50 dark:bg-[color:var(--wp-surface-muted)] p-4 rounded-2xl border border-slate-100 dark:border-[color:var(--wp-border)]">
            <div className="flex justify-between items-center mb-3">
              <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-muted)]">Stav pokrytí</span>
              <div className="flex gap-3 text-xs font-bold">
                <span className="text-emerald-600 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-emerald-500" aria-hidden />{activeCount}
                </span>
                <span className="text-amber-500 flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-amber-400" aria-hidden />{pendingCount}
                </span>
              </div>
            </div>
            <div className="h-2.5 w-full bg-[color:var(--wp-surface-inset)] rounded-full overflow-hidden flex shadow-inner border border-[color:var(--wp-border)]">
              <div className="h-full bg-gradient-to-r from-emerald-400 to-emerald-500 transition-all duration-700 ease-out" style={{ width: `${activePct}%` }} />
              <div className="h-full bg-gradient-to-r from-amber-300 to-amber-400 transition-all duration-700 ease-out" style={{ width: `${pendingPct}%` }} />
            </div>
            <p className="text-[9px] text-[color:var(--wp-text-muted)] font-bold uppercase tracking-widest mt-3 text-center">
              {readOnly
                ? "Přehled odpovídá stavu u poradce (domácnost, kde je to evidováno)."
                : "Klikni na položku pro změnu stavu."}
            </p>
          </div>
        </div>
        <div className="flex items-center justify-between mb-4">
          <span className="text-sm font-bold text-[color:var(--wp-text-muted)]" />
          {!readOnly && (
            <Link
              href={`/portal/contacts/${contactId}#obchody`}
              className="text-sm font-black text-indigo-600 hover:text-indigo-800 dark:text-indigo-400 dark:hover:text-indigo-300 transition-colors flex items-center gap-1 min-h-[44px]"
            >
              Obchody <span aria-hidden>→</span>
            </Link>
          )}
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5">
          {CATEGORY_ORDER.filter((cat) => byCategory[cat]?.length).map((category) => (
            <CoverageAreaCard
              key={category}
              category={category}
              displayName={DISPLAY_CATEGORY_NAMES[category] ?? category}
              items={byCategory[category]}
              contactId={contactId}
              onRefresh={refetch}
              onOptimisticStatusChange={applyOptimisticStatus}
              readOnly={readOnly}
            />
          ))}
        </div>
      </div>
    </div>
  );
}
