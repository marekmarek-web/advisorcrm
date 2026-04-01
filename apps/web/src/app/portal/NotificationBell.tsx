"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { CheckCircle2, CircleHelp, FileText, Home, Shield, TrendingUp, Users } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  useAdvisorInAppNotifications,
  type AdvisorInAppNotificationRow,
} from "@/app/portal/AdvisorInAppNotificationsContext";
import { parseClientPortalNotificationBody } from "@/lib/advisor-in-app/parse-client-portal-notification-body";
import { caseTypeToLabel } from "@/lib/client-portal/case-type-labels";

function formatListTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "Právě teď";
  if (s < 3600) return `Před ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `Před ${Math.floor(s / 3600)} h`;
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
  blue: "bg-blue-50 text-blue-600 border-blue-100/50",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100/50",
  violet: "bg-violet-50 text-violet-600 border-violet-100/50",
  amber: "bg-amber-50 text-amber-600 border-amber-100/50",
  rose: "bg-rose-50 text-rose-600 border-rose-100/50",
  slate: "bg-slate-50 text-slate-600 border-slate-100/50",
};

const ACCENT_SUB: Record<Accent, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  violet: "text-violet-600",
  amber: "text-amber-700",
  rose: "text-rose-600",
  slate: "text-slate-600",
};

function rowMeta(n: AdvisorInAppNotificationRow) {
  const { caseType, caseTypeLabel, preview } = parseClientPortalNotificationBody(n.body);
  const accent = accentForCaseType(caseType);
  const Icon = iconForCaseType(caseType);
  const categoryLabel = caseTypeLabel || caseTypeToLabel(caseType);
  return { accent, Icon, categoryLabel, preview: preview || n.title };
}

export function NotificationBell() {
  const router = useRouter();
  const { items, unreadCount, loading, markRead, markAllRead } = useAdvisorInAppNotifications();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    function onDoc(e: MouseEvent) {
      const el = rootRef.current;
      if (el && !el.contains(e.target as Node)) close();
    }
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") close();
    }
    document.addEventListener("mousedown", onDoc);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      document.removeEventListener("keydown", onKey);
    };
  }, [open, close]);

  async function onItemClick(n: AdvisorInAppNotificationRow) {
    if (n.relatedEntityType === "opportunity" && n.relatedEntityId) {
      router.push(`/portal/pipeline/${n.relatedEntityId}`);
    }
    if (n.status === "unread") {
      await markRead(n.id);
    }
    close();
  }

  async function onMarkAllRead(e: React.MouseEvent) {
    e.stopPropagation();
    await markAllRead();
  }

  const badge = unreadCount > 99 ? "99+" : String(unreadCount);

  return (
    <div className="relative" ref={rootRef}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        className="relative flex min-h-[44px] min-w-[44px] items-center justify-center rounded-full p-2.5 text-[color:var(--wp-text-muted)] transition-colors hover:bg-[color:var(--wp-link-hover-bg)] hover:text-[color:var(--wp-text)] dark:hover:bg-white/10 dark:hover:text-white/90"
        title="Požadavky z klientského portálu"
        aria-label={unreadCount > 0 ? `Oznámení, ${badge} nepřečtených` : "Oznámení"}
        aria-expanded={open}
        aria-haspopup="dialog"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          width="20"
          height="20"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unreadCount > 0 && (
          <>
            <span className="absolute right-1.5 top-1.5 flex min-h-[18px] min-w-[18px] items-center justify-center rounded-full border-2 border-[color:var(--wp-portal-header-bg)] bg-rose-500 px-1 text-[10px] font-bold leading-none text-white dark:border-[color:var(--wp-portal-header-bg)]">
              {unreadCount > 99 ? "99+" : unreadCount}
            </span>
            <span className="sr-only">{badge} nepřečtených</span>
          </>
        )}
      </button>

      {open && (
        <>
          <div className="fixed inset-0 z-[299] bg-black/20 md:bg-transparent" aria-hidden onClick={close} />
          <div
            className="fixed inset-x-3 bottom-[max(0.75rem,var(--safe-area-bottom))] top-[20vh] z-[300] flex max-h-[min(520px,70vh)] flex-col overflow-hidden rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-xl md:absolute md:inset-auto md:right-0 md:top-full md:mt-2 md:w-[min(100vw-2rem,400px)] md:max-h-[min(420px,70vh)]"
            role="dialog"
            aria-label="Požadavky z klientské zóny"
          >
            <div className="flex shrink-0 items-center justify-between border-b border-[color:var(--wp-border)] px-4 py-3">
              <h3 className="text-base font-semibold text-[color:var(--wp-text)]">Požadavky z portálu</h3>
              {unreadCount > 0 ? (
                <button
                  type="button"
                  onClick={onMarkAllRead}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg px-2 text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                >
                  <CheckCircle2 size={14} aria-hidden />
                  Přečíst vše
                </button>
              ) : null}
            </div>

            <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
              {loading && items.length === 0 ? (
                <p className="px-4 py-8 text-center text-sm text-[color:var(--wp-text-secondary)]">Načítání…</p>
              ) : items.length === 0 ? (
                <div className="px-4 py-10 text-center text-[color:var(--wp-text-secondary)]">
                  <BellIcon className="mx-auto mb-3 h-8 w-8 opacity-30" />
                  <p className="text-sm font-medium">Zatím nemáte žádné požadavky z klientské zóny.</p>
                </div>
              ) : (
                <ul className="divide-y divide-[color:var(--wp-border)]">
                  {items.map((n) => {
                    const { accent, Icon, categoryLabel, preview } = rowMeta(n);
                    const unread = n.status === "unread";
                    return (
                      <li key={n.id}>
                        <button
                          type="button"
                          onClick={() => void onItemClick(n)}
                          className={`flex w-full min-h-[44px] gap-3 px-4 py-3 text-left transition-colors hover:bg-[color:var(--wp-link-hover-bg)] ${
                            unread ? "bg-[color:var(--wp-surface-muted)]/80" : ""
                          }`}
                        >
                          <div
                            className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border ${ACCENT_ICON[accent]}`}
                          >
                            <Icon size={18} strokeWidth={2.5} aria-hidden />
                          </div>
                          <div className="min-w-0 flex-1 pt-0.5">
                            <div className="mb-0.5 flex items-start justify-between gap-2">
                              <p
                                className={`truncate text-sm font-semibold ${
                                  unread ? "text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-secondary)]"
                                }`}
                              >
                                {n.title}
                              </p>
                              <span className="shrink-0 whitespace-nowrap text-[10px] font-semibold uppercase tracking-wide text-[color:var(--wp-text-tertiary)]">
                                {formatListTime(n.createdAt)}
                              </span>
                            </div>
                            <p className={`mb-0.5 truncate text-xs font-semibold ${ACCENT_SUB[accent]}`}>{categoryLabel}</p>
                            <p
                              className={`line-clamp-2 text-xs leading-relaxed ${
                                unread ? "text-[color:var(--wp-text-secondary)]" : "text-[color:var(--wp-text-tertiary)]"
                              }`}
                            >
                              {preview}
                            </p>
                          </div>
                          {unread ? (
                            <span className="mt-2 h-2 w-2 shrink-0 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.45)]" />
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function BellIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
    </svg>
  );
}
