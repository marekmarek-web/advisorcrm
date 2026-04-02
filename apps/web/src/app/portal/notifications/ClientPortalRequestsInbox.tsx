"use client";

import { useCallback, useEffect, useMemo, useState, useTransition } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowUpRight,
  Bell,
  Briefcase,
  CheckSquare,
  CircleHelp,
  Clock,
  FileText,
  Home,
  Loader2,
  MessageCircle,
  Search,
  Send,
  Shield,
  Sparkles,
  TrendingUp,
  Users,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { sendMessage } from "@/app/actions/messages";
import { createTask } from "@/app/actions/tasks";
import {
  getAdvisorClientPortalRequestsInbox,
  setAdvisorPortalRequestHandling,
} from "@/app/actions/client-portal-requests";
import type { AdvisorClientPortalInboxItem } from "@/app/actions/client-portal-requests";
import type { AdvisorPortalRequestHandling } from "@/lib/client-portal/advisor-portal-handling";
import { AdvisorAiOutputNotice } from "@/app/components/ai/AdvisorAiOutputNotice";
import { useToast } from "@/app/components/Toast";

function formatListTime(d: Date): string {
  const t = d.getTime();
  if (Number.isNaN(t)) return "";
  const s = Math.floor((Date.now() - t) / 1000);
  if (s < 45) return "Právě teď";
  if (s < 3600) return `Před ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `Před ${Math.floor(s / 3600)} h`;
  if (s < 172800) return "Včera";
  return d.toLocaleString("cs-CZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

type Accent = "blue" | "emerald" | "violet" | "amber" | "rose" | "slate";

function accentForCaseType(caseType: string): Accent {
  const n = caseType?.toLowerCase().trim() ?? "";
  if (n.includes("hypot") || n === "úvěr") return "blue";
  if (n.includes("pojist")) return "emerald";
  if (n.includes("invest")) return "violet";
  if (n.includes("servis")) return "amber";
  if (n.includes("změna") || n.includes("situace")) return "rose";
  return "slate";
}

function iconForCaseType(caseType: string): LucideIcon {
  const n = caseType?.toLowerCase().trim() ?? "";
  if (n.includes("hypot") || n === "úvěr") return Home;
  if (n.includes("pojist")) return Shield;
  if (n.includes("invest")) return TrendingUp;
  if (n.includes("servis")) return FileText;
  if (n.includes("změna") || n.includes("situace")) return Users;
  return CircleHelp;
}

const ACCENT_ICON: Record<Accent, string> = {
  blue: "bg-blue-50 text-blue-600 border-blue-100/50 dark:bg-blue-950/40 dark:text-blue-300 dark:border-blue-800/50",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100/50 dark:bg-emerald-950/40 dark:text-emerald-300 dark:border-emerald-800/50",
  violet: "bg-violet-50 text-violet-600 border-violet-100/50 dark:bg-violet-950/40 dark:text-violet-300 dark:border-violet-800/50",
  amber: "bg-amber-50 text-amber-700 border-amber-100/50 dark:bg-amber-950/40 dark:text-amber-300 dark:border-amber-800/50",
  rose: "bg-rose-50 text-rose-600 border-rose-100/50 dark:bg-rose-950/40 dark:text-rose-300 dark:border-rose-800/50",
  slate: "bg-slate-50 text-slate-600 border-slate-200/50 dark:bg-slate-800/50 dark:text-slate-300 dark:border-slate-600/50",
};

const ACCENT_SUB: Record<Accent, string> = {
  blue: "text-blue-600 dark:text-blue-400",
  emerald: "text-emerald-600 dark:text-emerald-400",
  violet: "text-violet-600 dark:text-violet-400",
  amber: "text-amber-700 dark:text-amber-400",
  rose: "text-rose-600 dark:text-rose-400",
  slate: "text-slate-600 dark:text-slate-400",
};

type Props = {
  initialItems: AdvisorClientPortalInboxItem[];
};

function coerceDate(d: Date | string): Date {
  if (d instanceof Date && !Number.isNaN(d.getTime())) return d;
  const t = new Date(d as string);
  return Number.isNaN(t.getTime()) ? new Date() : t;
}

function normalizeInboxItems(rows: AdvisorClientPortalInboxItem[]): AdvisorClientPortalInboxItem[] {
  return rows.map((it) => ({
    ...it,
    notificationCreatedAt: coerceDate(it.notificationCreatedAt as unknown as Date | string),
  }));
}

export function ClientPortalRequestsInbox({ initialItems }: Props) {
  const searchParams = useSearchParams();
  const toast = useToast();
  const [items, setItems] = useState(() => normalizeInboxItems(initialItems));
  const focusFromQuery = searchParams.get("n");
  const [selectedId, setSelectedId] = useState<string | null>(() => {
    if (focusFromQuery && initialItems.some((i) => i.notificationId === focusFromQuery)) {
      return focusFromQuery;
    }
    return initialItems[0]?.notificationId ?? null;
  });
  const [filter, setFilter] = useState<"all" | "unread">("all");
  const [search, setSearch] = useState("");
  const [reply, setReply] = useState("");
  const [aiBrief, setAiBrief] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [pending, startTransition] = useTransition();
  const [taskPending, setTaskPending] = useState(false);
  const [handlingSaving, setHandlingSaving] = useState(false);

  const selected = useMemo(
    () => items.find((i) => i.notificationId === selectedId) ?? null,
    [items, selectedId]
  );

  useEffect(() => {
    setItems(normalizeInboxItems(initialItems));
  }, [initialItems]);

  const markReadApi = useCallback(async (notificationId: string) => {
    const res = await fetch("/api/notifications/mark-read", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notificationId }),
    });
    if (res.ok) {
      setItems((prev) =>
        prev.map((n) => (n.notificationId === notificationId ? { ...n, notificationStatus: "read" } : n))
      );
      window.dispatchEvent(new CustomEvent("portal-notifications-badge-refresh"));
    }
  }, []);

  useEffect(() => {
    const id = searchParams.get("n");
    if (!id) return;
    const row = items.find((i) => i.notificationId === id);
    if (row) {
      setSelectedId(id);
      if (row.notificationStatus === "unread") {
        void markReadApi(id);
      }
    }
  }, [searchParams, items, markReadApi]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return items.filter((it) => {
      if (filter === "unread" && it.notificationStatus !== "unread") return false;
      if (!q) return true;
      return (
        it.clientName.toLowerCase().includes(q) ||
        it.subject.toLowerCase().includes(q) ||
        it.preview.toLowerCase().includes(q) ||
        (it.bodyText?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [items, filter, search]);

  const onSelect = useCallback(
    (id: string) => {
      setSelectedId(id);
      setReply("");
      setAiBrief(null);
      const row = items.find((i) => i.notificationId === id);
      if (row?.notificationStatus === "unread") {
        void markReadApi(id);
      }
    },
    [items, markReadApi]
  );

  const applyAdvisorHandling = useCallback(
    async (h: AdvisorPortalRequestHandling | null) => {
      const oppId = selected?.opportunityId;
      if (!oppId || selected?.opportunityMissing) return;
      setHandlingSaving(true);
      try {
        const res = await setAdvisorPortalRequestHandling(oppId, h);
        if (!res.success) {
          toast.showToast(res.error, "error");
          return;
        }
        toast.showToast("Stav požadavku byl uložen.", "success");
        const data = await getAdvisorClientPortalRequestsInbox();
        setItems(normalizeInboxItems(data));
      } catch (e) {
        toast.showToast(e instanceof Error ? e.message : "Uložení se nepodařilo.", "error");
      } finally {
        setHandlingSaving(false);
      }
    },
    [selected?.opportunityId, selected?.opportunityMissing, toast]
  );

  async function onGenerateBrief() {
    if (!selected) return;
    setAiLoading(true);
    setAiBrief(null);
    try {
      const res = await fetch("/api/ai/client-request-brief", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject: selected.subject,
          caseTypeLabel: selected.caseTypeLabel,
          bodyText: selected.bodyText ?? selected.preview,
        }),
      });
      const data = (await res.json()) as { brief?: string; error?: string };
      if (!res.ok) {
        toast.showToast(data.error ?? "Nepodařilo se vygenerovat shrnutí.", "error");
        return;
      }
      setAiBrief(data.brief ?? "");
    } catch {
      toast.showToast("Nepodařilo se vygenerovat shrnutí.", "error");
    } finally {
      setAiLoading(false);
    }
  }

  function onSendReply() {
    const text = reply.trim();
    if (!text || !selected?.contactId) return;
    const contactId = selected.contactId;
    startTransition(async () => {
      try {
        const header = `[K vašemu požadavku: ${selected.subject}]`;
        await sendMessage(contactId, `${header}\n\n${text}`);
        setReply("");
        toast.showToast("Zpráva byla odeslána do klientské zóny.", "success");
      } catch (e) {
        toast.showToast(e instanceof Error ? e.message : "Odeslání se nepodařilo.", "error");
      }
    });
  }

  function onCreateTask() {
    const contactId = selected?.contactId;
    const opportunityId = selected?.opportunityId;
    if (!contactId || !opportunityId) return;
    const description = selected.bodyText ?? selected.preview ?? undefined;
    setTaskPending(true);
    startTransition(async () => {
      try {
        await createTask({
          title: `Vyřídit požadavek: ${selected.subject}`,
          description,
          contactId,
          opportunityId,
        });
        toast.showToast("Úkol byl založen.", "success");
      } catch (e) {
        toast.showToast(e instanceof Error ? e.message : "Úkol se nepodařilo vytvořit.", "error");
      } finally {
        setTaskPending(false);
      }
    });
  }

  const unreadCount = items.filter((i) => i.notificationStatus === "unread").length;

  return (
    <div className="flex w-full min-h-0 flex-col gap-4 max-lg:min-h-0 lg:min-h-[min(100vh-8rem,900px)] md:gap-6">
      <header className="shrink-0 space-y-4">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div className="flex items-start gap-3">
            <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-lg shadow-indigo-200/50 dark:shadow-none">
              <Bell className="h-6 w-6" aria-hidden />
            </div>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[color:var(--wp-text)] md:text-3xl">
                Klientské požadavky
              </h1>
              <p className="mt-1 text-sm font-medium text-[color:var(--wp-text-secondary)]">
                Zprávy z klientského portálu a stav souvisejícího obchodu v pipeline.
              </p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="relative min-w-[min(100%,280px)] flex-1 md:max-w-sm">
              <Search
                className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]"
                aria-hidden
              />
              <input
                type="search"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Hledat klienta, předmět nebo text…"
                className="w-full rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] py-2.5 pl-10 pr-4 text-sm text-[color:var(--wp-text)] outline-none ring-0 ring-indigo-500/30 placeholder:text-[color:var(--wp-text-tertiary)] focus:border-indigo-400 focus:ring-4 min-h-[44px]"
                aria-label="Hledat v požadavcích"
              />
            </div>
            <Link
              href="/portal/settings/notification-log"
              className="inline-flex min-h-[44px] items-center justify-center rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-link-hover-bg)]"
            >
              Historie e-mailů
            </Link>
          </div>
        </div>
      </header>

      <div className="flex w-full min-h-0 flex-col gap-4 max-lg:flex-none lg:flex-1 lg:flex-row lg:gap-6">
        {/* Seznam */}
        <div className="flex w-full flex-col max-lg:flex-none max-lg:min-h-0 lg:min-h-0 lg:w-[400px] lg:shrink-0">
          <div className="mb-3 flex rounded-2xl bg-[color:var(--wp-surface-muted)] p-1.5 dark:bg-white/5">
            <button
              type="button"
              onClick={() => setFilter("all")}
              className={`min-h-[44px] flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                filter === "all"
                  ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm"
                  : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
              }`}
            >
              Vše ({items.length})
            </button>
            <button
              type="button"
              onClick={() => setFilter("unread")}
              className={`min-h-[44px] flex-1 rounded-xl py-2.5 text-sm font-bold transition-all ${
                filter === "unread"
                  ? "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)] shadow-sm"
                  : "text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)]"
              }`}
            >
              Nepřečtené ({unreadCount})
            </button>
          </div>

          <div className="max-lg:flex-none max-lg:min-h-0 space-y-2 overflow-y-auto overscroll-y-contain pr-1 lg:min-h-[280px] lg:flex-1 lg:max-h-[calc(100vh-16rem)]">
            {filtered.length === 0 ? (
              <div className="rounded-2xl border border-dashed border-[color:var(--wp-surface-card-border)] p-8 text-center text-sm text-[color:var(--wp-text-secondary)]">
                {items.length === 0
                  ? "Zatím nemáte žádné požadavky z klientské zóny."
                  : "Žádná položka neodpovídá filtru."}
              </div>
            ) : (
              filtered.map((it) => {
                const active = selectedId === it.notificationId;
                const accent = accentForCaseType(it.caseType);
                const Icon = iconForCaseType(it.caseType);
                const unread = it.notificationStatus === "unread";
                return (
                  <button
                    key={it.notificationId}
                    type="button"
                    onClick={() => onSelect(it.notificationId)}
                    className={`relative w-full rounded-2xl border p-4 text-left transition-all ${
                      active
                        ? "border-[color:var(--wp-text)] bg-[color:var(--wp-text)] text-white shadow-lg"
                        : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] hover:border-indigo-300 hover:shadow-md dark:hover:border-indigo-700"
                    } min-h-[44px]`}
                  >
                    {unread && !active ? (
                      <span className="absolute right-4 top-4 h-2.5 w-2.5 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.5)]" />
                    ) : null}
                    <div className="flex gap-3">
                      <div
                        className={`flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border ${
                          active ? "bg-white/15 text-white border-white/20" : ACCENT_ICON[accent]
                        }`}
                      >
                        <Icon className="h-5 w-5" strokeWidth={2.2} aria-hidden />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="mb-0.5 flex items-start justify-between gap-2">
                          <p
                            className={`truncate text-sm font-bold ${active ? "text-white" : "text-[color:var(--wp-text)]"}`}
                          >
                            {it.clientName}
                          </p>
                          <span
                            className={`shrink-0 text-[10px] font-semibold uppercase tracking-wide ${
                              active ? "text-white/70" : "text-[color:var(--wp-text-tertiary)]"
                            }`}
                          >
                            {formatListTime(it.notificationCreatedAt)}
                          </span>
                        </div>
                        <p
                          className={`mb-0.5 truncate text-xs font-semibold ${active ? "text-indigo-200" : ACCENT_SUB[accent]}`}
                        >
                          {it.caseTypeLabel}
                        </p>
                        <p className={`truncate text-xs font-semibold ${active ? "text-white" : "text-[color:var(--wp-text)]"}`}>
                          {it.subject}
                        </p>
                        <p
                          className={`mt-0.5 line-clamp-2 text-xs leading-relaxed ${
                            active ? "text-white/75" : "text-[color:var(--wp-text-secondary)]"
                          }`}
                        >
                          {it.preview}
                        </p>
                        <p className={`mt-1 text-[10px] font-bold uppercase tracking-wide ${active ? "text-emerald-300" : "text-[color:var(--wp-text-tertiary)]"}`}>
                          {it.statusLabel}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Detail */}
        <div className="flex w-full flex-col max-lg:flex-none max-lg:overflow-visible lg:min-h-0 lg:min-w-0 lg:flex-1 lg:overflow-hidden rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm lg:rounded-3xl">
          {!selected ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-3 p-10 text-[color:var(--wp-text-secondary)]">
              <MessageCircle className="h-12 w-12 opacity-30" strokeWidth={1} aria-hidden />
              <p className="text-center font-medium">Vyberte požadavek v seznamu vlevo.</p>
            </div>
          ) : (
            <>
              <div className="shrink-0 border-b border-[color:var(--wp-surface-card-border)] px-4 py-5 sm:px-8">
                <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                  <div className="flex gap-4">
                    <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-lg font-bold text-[color:var(--wp-text)]">
                      {selected.clientName
                        .split(/\s+/)
                        .filter(Boolean)
                        .slice(0, 2)
                        .map((p) => p[0])
                        .join("")
                        .toUpperCase() || "?"}
                    </div>
                    <div>
                      <h2 className="text-xl font-bold text-[color:var(--wp-text)]">{selected.clientName}</h2>
                      <div className="mt-1 flex flex-wrap items-center gap-2">
                        <span className="rounded-lg bg-indigo-50 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-300">
                          {selected.caseTypeLabel}
                        </span>
                        <span className="flex items-center gap-1 text-xs font-semibold text-[color:var(--wp-text-tertiary)]">
                          <Clock className="h-3.5 w-3.5" aria-hidden />
                          {selected.notificationCreatedAt.toLocaleString("cs-CZ", {
                            day: "numeric",
                            month: "long",
                            year: "numeric",
                            hour: "2-digit",
                            minute: "2-digit",
                          })}
                        </span>
                        <span className="rounded-lg bg-[color:var(--wp-surface-muted)] px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                          {selected.statusLabel}
                        </span>
                      </div>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {selected.contactId ? (
                      <Link
                        href={`/portal/contacts/${selected.contactId}`}
                        className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3 text-sm font-semibold text-[color:var(--wp-text)] hover:bg-[color:var(--wp-link-hover-bg)]"
                      >
                        Profil klienta
                        <ArrowUpRight className="h-4 w-4" aria-hidden />
                      </Link>
                    ) : null}
                    {selected.opportunityId && !selected.opportunityMissing ? (
                      <Link
                        href={`/portal/pipeline/${selected.opportunityId}`}
                        className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl bg-[color:var(--wp-text)] px-4 text-sm font-semibold text-white hover:opacity-90"
                      >
                        Otevřít v Obchody
                        <Briefcase className="h-4 w-4" aria-hidden />
                      </Link>
                    ) : null}
                  </div>
                </div>
                {selected.opportunityId && !selected.opportunityMissing ? (
                  <div className="mt-4 border-t border-[color:var(--wp-surface-card-border)] pt-4">
                    <p className="mb-2 text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">
                      Stav požadavku v inboxu
                    </p>
                    <div className="flex flex-wrap gap-2">
                      <button
                        type="button"
                        disabled={handlingSaving}
                        onClick={() => void applyAdvisorHandling("waiting")}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-colors ${
                          selected.advisorHandling === "waiting"
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-link-hover-bg)]"
                        }`}
                      >
                        {handlingSaving ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
                        Čeká se
                      </button>
                      <button
                        type="button"
                        disabled={handlingSaving}
                        onClick={() => void applyAdvisorHandling("resolved")}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-colors ${
                          selected.advisorHandling === "resolved"
                            ? "bg-emerald-600 text-white shadow-sm"
                            : "border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-link-hover-bg)]"
                        }`}
                      >
                        Vyřešeno
                      </button>
                      <button
                        type="button"
                        disabled={handlingSaving}
                        onClick={() => void applyAdvisorHandling(null)}
                        className={`inline-flex min-h-[44px] items-center justify-center gap-2 rounded-xl px-4 text-xs font-bold transition-colors ${
                          selected.advisorHandling === null
                            ? "border-2 border-[color:var(--wp-text)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text)]"
                            : "border border-dashed border-[color:var(--wp-surface-card-border)] bg-transparent text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"
                        }`}
                      >
                        Podle obchodu
                      </button>
                    </div>
                    <p className="mt-2 text-xs text-[color:var(--wp-text-tertiary)]">
                      Volitelný štítek pro váš přehled; nemění automaticky fázi obchodu v nástěnce.
                    </p>
                  </div>
                ) : null}
              </div>

              <div className="min-h-0 flex-1 overflow-y-auto overscroll-y-contain px-4 py-6 sm:px-8 max-lg:min-h-0 max-lg:flex-none">
                {selected.opportunityMissing ? (
                  <p className="mb-6 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-100">
                    Související obchod už v databázi není. Zobrazené údaje pocházejí z upozornění.
                  </p>
                ) : null}

                <div className="mb-8 rounded-2xl border border-indigo-200/80 bg-gradient-to-br from-indigo-50/90 to-white p-5 dark:border-indigo-800/50 dark:from-indigo-950/40 dark:to-[color:var(--wp-surface-card)]">
                  <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-indigo-800 dark:text-indigo-200">
                      <Sparkles className="h-4 w-4 shrink-0" aria-hidden />
                      Interní shrnutí (AI)
                    </h3>
                    <button
                      type="button"
                      onClick={() => void onGenerateBrief()}
                      disabled={aiLoading}
                      className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                    >
                      {aiLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                      {aiBrief ? "Přepočítat shrnutí" : "Vygenerovat shrnutí"}
                    </button>
                  </div>
                  <AdvisorAiOutputNotice variant="compact" className="mb-3" />
                  {aiLoading ? (
                    <p className="text-sm text-[color:var(--wp-text-secondary)]">Generuji…</p>
                  ) : aiBrief ? (
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-[color:var(--wp-text)]">{aiBrief}</p>
                  ) : (
                    <p className="text-sm text-[color:var(--wp-text-secondary)]">
                      Klikněte na „Vygenerovat shrnutí“ pro stručný interní přehled požadavku.
                    </p>
                  )}
                  {selected.contactId && selected.opportunityId && !selected.opportunityMissing ? (
                    <div className="mt-4 flex flex-wrap gap-2 border-t border-indigo-100 pt-4 dark:border-indigo-800/50">
                      <button
                        type="button"
                        onClick={() => onCreateTask()}
                        disabled={taskPending}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-indigo-600 px-3 py-2 text-xs font-bold text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {taskPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckSquare className="h-4 w-4" aria-hidden />}
                        Převést na úkol
                      </button>
                      <Link
                        href={`/portal/pipeline/${selected.opportunityId}`}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-indigo-200 bg-white px-3 py-2 text-xs font-bold text-indigo-800 hover:bg-indigo-50 dark:border-indigo-700 dark:bg-indigo-950/50 dark:text-indigo-200 dark:hover:bg-indigo-900/40"
                      >
                        <Briefcase className="h-4 w-4" aria-hidden />
                        Detail obchodu
                      </Link>
                    </div>
                  ) : null}
                </div>

                <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/40 p-6 dark:bg-white/5">
                  <div className="mb-4 flex flex-wrap items-start justify-between gap-2">
                    <h3 className="text-lg font-bold text-[color:var(--wp-text)]">{selected.subject}</h3>
                    <span className="rounded-lg bg-[color:var(--wp-surface-muted)] px-2.5 py-1 text-[10px] font-bold uppercase tracking-wide text-[color:var(--wp-text-secondary)]">
                      Z klientského portálu
                    </span>
                  </div>
                  <div className="prose prose-sm max-w-none text-[color:var(--wp-text)] dark:prose-invert">
                    <p className="whitespace-pre-wrap text-[15px] leading-relaxed">
                      {selected.bodyText?.trim() || selected.preview || "—"}
                    </p>
                  </div>
                </div>
              </div>

              <div className="shrink-0 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 sm:p-6">
                {selected.contactId && !selected.opportunityMissing ? (
                  <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 p-2 focus-within:border-indigo-400 focus-within:ring-4 focus-within:ring-indigo-500/15 dark:bg-white/5">
                    <label htmlFor="portal-reply" className="sr-only">
                      Odpověď klientovi do klientské zóny
                    </label>
                    <textarea
                      id="portal-reply"
                      value={reply}
                      onChange={(e) => setReply(e.target.value)}
                      rows={4}
                      placeholder={`Odpověď se zobrazí klientovi v sekci Zprávy…`}
                      className="w-full resize-none bg-transparent px-3 py-2 text-sm text-[color:var(--wp-text)] outline-none placeholder:text-[color:var(--wp-text-tertiary)] min-h-[88px]"
                    />
                    <div className="flex justify-end px-2 pb-2">
                      <button
                        type="button"
                        onClick={() => onSendReply()}
                        disabled={pending || !reply.trim()}
                        className="inline-flex min-h-[44px] items-center gap-2 rounded-xl bg-[color:var(--wp-text)] px-5 text-sm font-bold text-white hover:opacity-90 disabled:opacity-50"
                      >
                        {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" aria-hidden />}
                        Odeslat do portálu
                      </button>
                    </div>
                  </div>
                ) : (
                  <p className="text-center text-sm text-[color:var(--wp-text-secondary)]">
                    Odpověď v aplikaci nelze odeslat — chybí vazba na kontakt. Použijte jiný kanál.
                  </p>
                )}
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
