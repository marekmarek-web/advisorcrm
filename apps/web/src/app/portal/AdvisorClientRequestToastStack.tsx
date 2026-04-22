"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
import { ADVISOR_NOTIFICATION_TYPES } from "@/lib/advisor-in-app/advisor-notification-types";
import {
  ArrowRight,
  CircleHelp,
  Clock,
  FileText,
  Home,
  Shield,
  TrendingUp,
  Users,
  X,
} from "lucide-react";
import { caseTypeToLabel } from "@/lib/client-portal/case-type-labels";
import { parseClientPortalNotificationBody } from "@/lib/advisor-in-app/parse-client-portal-notification-body";
import {
  useAdvisorInAppNotifications,
  type AdvisorInAppNotificationRow,
} from "@/app/portal/AdvisorInAppNotificationsContext";
import "@/styles/advisor-client-request-toast.css";

const AUTO_DISMISS_MS = 6000;
const EXIT_MS = 400;
const PREVIEW_MAX = 140;
/** Nepřečtené notifikace starší než (sessionStart − buffer) při prvním syncu označíme jako „seen“ bez toastu. Novější zůstanou pro toast i v první HTTP odpovědi. */
const SESSION_CLOCK_SKEW_BUFFER_MS = 10_000;

type Accent = "blue" | "emerald" | "violet" | "amber" | "rose" | "slate";

type ToastRow = {
  /** UI klíč / animace (`toast-` + notification id). */
  id: string;
  /** Řádek advisor_notifications — pro mark-read API. */
  notificationId: string;
  navigateHref: string;
  clientName: string;
  categoryLabel: string;
  preview: string;
  timeLabel: string;
  accent: Accent;
  Icon: LucideIcon;
  isExiting: boolean;
  progressMs: number;
};

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

function formatToastTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 45) return "Právě teď";
  if (s < 3600) return `Před ${Math.max(1, Math.floor(s / 60))} min`;
  if (s < 86400) return `Před ${Math.floor(s / 3600)} h`;
  return d.toLocaleString("cs-CZ", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });
}

function clipPreview(text: string): string {
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, PREVIEW_MAX).trim()}…`;
}

function parseSelfServiceNotificationBody(
  body: string | null
): { contactId: string; preview: string } | null {
  try {
    const b = JSON.parse(body || "{}") as { contactId?: string; preview?: string };
    const contactId = typeof b.contactId === "string" ? b.contactId : "";
    if (!contactId) return null;
    const preview = typeof b.preview === "string" ? b.preview : "";
    return { contactId, preview };
  } catch {
    return null;
  }
}

function notificationToToastRow(n: AdvisorInAppNotificationRow): ToastRow | null {
  const timeLabel = formatToastTime(n.createdAt);
  if (n.type === "client_portal_request" && n.relatedEntityType === "opportunity" && n.relatedEntityId) {
    const { caseType, caseTypeLabel, preview } = parseClientPortalNotificationBody(n.body);
    const accent = accentForCaseType(caseType);
    const Icon = iconForCaseType(caseType);
    const categoryLabel = caseTypeLabel || caseTypeToLabel(caseType);
    const previewText = clipPreview(preview || n.title);
    return {
      id: `toast-${n.id}`,
      notificationId: n.id,
      navigateHref: `/portal/notifications?n=${encodeURIComponent(n.id)}`,
      clientName: n.title,
      categoryLabel,
      preview: previewText,
      timeLabel,
      accent,
      Icon,
      isExiting: false,
      progressMs: AUTO_DISMISS_MS,
    };
  }

  if (n.type === "client_material_response" && n.relatedEntityType === "advisor_material_request" && n.relatedEntityId) {
    let contactId = "";
    try {
      const b = JSON.parse(n.body || "{}") as { contactId?: string };
      contactId = typeof b.contactId === "string" ? b.contactId : "";
    } catch {
      return null;
    }
    if (!contactId) return null;
    let previewText = "";
    try {
      const b = JSON.parse(n.body || "{}") as { preview?: string };
      previewText = clipPreview(b.preview || n.title || "");
    } catch {
      previewText = clipPreview(n.title || "");
    }
    return {
      id: `toast-${n.id}`,
      notificationId: n.id,
      navigateHref: `/portal/contacts/${contactId}?tab=podklady&materialRequest=${encodeURIComponent(n.relatedEntityId)}`,
      clientName: n.title,
      categoryLabel: "Odpověď na požadavek",
      preview: previewText,
      timeLabel,
      accent: "emerald",
      Icon: FileText,
      isExiting: false,
      progressMs: AUTO_DISMISS_MS,
    };
  }

  if (n.type === "client_trezor_upload" && n.relatedEntityType === "document" && n.relatedEntityId) {
    const parsed = parseSelfServiceNotificationBody(n.body);
    if (!parsed) return null;
    const previewText = clipPreview(parsed.preview || n.title || "");
    return {
      id: `toast-${n.id}`,
      notificationId: n.id,
      navigateHref: `/portal/contacts/${parsed.contactId}?tab=dokumenty`,
      clientName: n.title,
      categoryLabel: "Nahrání do trezoru",
      preview: previewText,
      timeLabel,
      accent: "violet",
      Icon: FileText,
      isExiting: false,
      progressMs: AUTO_DISMISS_MS,
    };
  }

  if (n.type === "client_household_update" && n.relatedEntityType === "contact" && n.relatedEntityId) {
    const parsed = parseSelfServiceNotificationBody(n.body);
    if (!parsed) return null;
    const previewText = clipPreview(parsed.preview || n.title || "");
    return {
      id: `toast-${n.id}`,
      notificationId: n.id,
      navigateHref: `/portal/contacts/${parsed.contactId}?tab=prehled`,
      clientName: n.title,
      categoryLabel: "Úprava domácnosti",
      preview: previewText,
      timeLabel,
      accent: "amber",
      Icon: Users,
      isExiting: false,
      progressMs: AUTO_DISMISS_MS,
    };
  }

  return null;
}

const ACCENT_BAR: Record<Accent, string> = {
  blue: "from-blue-400 to-blue-600",
  emerald: "from-emerald-400 to-emerald-600",
  violet: "from-violet-400 to-violet-600",
  amber: "from-amber-400 to-amber-600",
  rose: "from-rose-400 to-rose-600",
  slate: "from-slate-400 to-slate-600",
};

const ACCENT_ICON: Record<Accent, string> = {
  blue: "bg-blue-50 text-blue-600 border-blue-100/50",
  emerald: "bg-emerald-50 text-emerald-600 border-emerald-100/50",
  violet: "bg-violet-50 text-violet-600 border-violet-100/50",
  amber: "bg-amber-50 text-amber-600 border-amber-100/50",
  rose: "bg-rose-50 text-rose-600 border-rose-100/50",
  slate: "bg-[color:var(--wp-main-scroll-bg)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]/50",
};

const ACCENT_SUB: Record<Accent, string> = {
  blue: "text-blue-600",
  emerald: "text-emerald-600",
  violet: "text-violet-600",
  amber: "text-amber-700",
  rose: "text-rose-600",
  slate: "text-[color:var(--wp-text-secondary)]",
};

const ACCENT_PROGRESS: Record<Accent, string> = {
  blue: "bg-blue-500/30",
  emerald: "bg-emerald-500/30",
  violet: "bg-violet-500/30",
  amber: "bg-amber-500/30",
  rose: "bg-rose-500/30",
  slate: "bg-slate-500/30",
};

export function AdvisorClientRequestToastStack() {
  const router = useRouter();
  const { items: notifications, loading, markRead } = useAdvisorInAppNotifications();
  const [toastRows, setToastRows] = useState<ToastRow[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const exitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seenNotificationIdsRef = useRef<Set<string>>(new Set());
  const initialSyncDoneRef = useRef(false);
  const portalSessionStartedAtRef = useRef(Date.now());

  const removeAfterExit = useCallback((id: string) => {
    if (exitTimersRef.current[id]) clearTimeout(exitTimersRef.current[id]);
    exitTimersRef.current[id] = setTimeout(() => {
      setToastRows((prev) => prev.filter((t) => t.id !== id));
      delete exitTimersRef.current[id];
    }, EXIT_MS);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
      setToastRows((prev) => prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
      removeAfterExit(id);
    },
    [removeAfterExit]
  );

  const scheduleAutoDismiss = useCallback(
    (id: string) => {
      if (timersRef.current[id]) clearTimeout(timersRef.current[id]);
      timersRef.current[id] = setTimeout(() => {
        delete timersRef.current[id];
        dismiss(id);
      }, AUTO_DISMISS_MS);
    },
    [dismiss]
  );

  const openDetail = useCallback(
    (href: string, toastId: string, notificationId: string) => {
      void markRead(notificationId);
      router.push(href);
      dismiss(toastId);
    },
    [router, dismiss, markRead]
  );

  useEffect(() => {
    if (loading) return;

    if (!initialSyncDoneRef.current) {
      initialSyncDoneRef.current = true;
      const t0 = portalSessionStartedAtRef.current;
      const seen = new Set<string>();
      for (const n of notifications) {
        if (n.status !== "unread") {
          seen.add(n.id);
          continue;
        }
        const created = new Date(n.createdAt).getTime();
        if (Number.isNaN(created)) {
          seen.add(n.id);
          continue;
        }
        if (created < t0 - SESSION_CLOCK_SKEW_BUFFER_MS) {
          seen.add(n.id);
        }
      }
      seenNotificationIdsRef.current = seen;
    }

    for (const n of notifications) {
      if (seenNotificationIdsRef.current.has(n.id)) continue;
      seenNotificationIdsRef.current.add(n.id);
      if (
        n.status !== "unread" ||
        !(ADVISOR_NOTIFICATION_TYPES as readonly string[]).includes(n.type)
      ) {
        continue;
      }
      const row = notificationToToastRow(n);
      if (!row) continue;
      setToastRows((prev) => [...prev.slice(-6), row]);
      scheduleAutoDismiss(row.id);
    }
  }, [notifications, loading, scheduleAutoDismiss]);

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      Object.values(exitTimersRef.current).forEach(clearTimeout);
    },
    []
  );

  if (toastRows.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-24 right-4 z-[301] flex w-[calc(100%-2rem)] max-w-[400px] flex-col gap-3 md:bottom-6 md:right-6"
      aria-live="polite"
    >
      {toastRows.map((t) => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          onClick={() => openDetail(t.navigateHref, t.id, t.notificationId)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openDetail(t.navigateHref, t.id, t.notificationId);
            }
          }}
          className={`pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-[var(--wp-radius-card)] border border-white bg-white/95 text-left shadow-[0_24px_48px_-12px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/5 backdrop-blur-2xl ${
            t.isExiting ? "aidv-client-request-toast--out" : "aidv-client-request-toast--in"
          }`}
        >
          <div className={`absolute left-0 right-0 top-0 h-1.5 bg-gradient-to-r ${ACCENT_BAR[t.accent]}`} />

          <div className="flex items-start gap-4 p-5">
            <div
              className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border shadow-sm ${ACCENT_ICON[t.accent]}`}
            >
              <t.Icon size={20} strokeWidth={2.5} />
            </div>

            <div className="min-w-0 flex-1 pt-0.5">
              <div className="mb-1.5 flex items-center justify-between gap-2">
                <p className="truncate font-[family-name:var(--font-jakarta)] text-[15px] font-extrabold text-[#0B1021]">
                  {t.clientName}
                </p>
                <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
                  <Clock size={10} /> {t.timeLabel}
                </span>
              </div>
              <p className={`mb-1.5 font-[family-name:var(--font-jakarta)] text-xs font-bold ${ACCENT_SUB[t.accent]}`}>
                {t.categoryLabel}
              </p>
              <p className="line-clamp-2 text-[13px] font-medium leading-relaxed text-[color:var(--wp-text-secondary)]">{t.preview}</p>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(t.navigateHref, t.id, t.notificationId);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-[10px] bg-[#0B1021] px-4 py-2.5 font-[family-name:var(--font-jakarta)] text-xs font-bold text-white transition-all hover:bg-black hover:shadow-lg"
                >
                  Zobrazit <ArrowRight size={14} />
                </button>
              </div>
            </div>

            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                dismiss(t.id);
              }}
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-[color:var(--wp-text-tertiary)] transition-colors hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
              aria-label="Zavřít"
            >
              <X size={16} />
            </button>
          </div>

          <div className="absolute bottom-0 left-0 h-1 w-full bg-[color:var(--wp-surface-muted)]">
            <div
              className={`h-full ${ACCENT_PROGRESS[t.accent]}`}
              style={{
                transformOrigin: "left center",
                animation: `aidvToastProgress ${t.progressMs}ms linear forwards`,
              }}
            />
          </div>
        </div>
      ))}
    </div>
  );
}
