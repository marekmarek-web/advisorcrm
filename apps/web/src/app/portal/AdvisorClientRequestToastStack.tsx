"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { LucideIcon } from "lucide-react";
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
import { createClient } from "@/lib/supabase/client";
import { caseTypeToLabel } from "@/lib/client-portal/case-type-labels";
import { getContactDisplayNameForAdvisorToast } from "@/app/actions/advisor-client-request-toast";
import "@/styles/advisor-client-request-toast.css";

const AUTO_DISMISS_MS = 6000;
const EXIT_MS = 400;
const PREVIEW_MAX = 140;
const STORAGE_KEY = "aidv_seen_portal_request_toasts";

type Accent = "blue" | "emerald" | "violet" | "amber" | "rose" | "slate";

type ToastRow = {
  id: string;
  opportunityId: string;
  clientName: string;
  categoryLabel: string;
  preview: string;
  timeLabel: string;
  accent: Accent;
  Icon: LucideIcon;
  isExiting: boolean;
  progressMs: number;
};

function parseCustomFields(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "object" && !Array.isArray(raw)) return raw as Record<string, unknown>;
  if (typeof raw === "string") {
    try {
      return JSON.parse(raw) as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  return null;
}

function isClientPortalRequest(cf: Record<string, unknown> | null): boolean {
  return cf?.client_portal_request === true;
}

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

function previewFromRow(title: string, cf: Record<string, unknown> | null): string {
  const desc = cf?.client_description;
  const text = typeof desc === "string" && desc.trim() ? desc.trim() : title;
  if (text.length <= PREVIEW_MAX) return text;
  return `${text.slice(0, PREVIEW_MAX).trim()}…`;
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

const ACCENT_PROGRESS: Record<Accent, string> = {
  blue: "bg-blue-500/30",
  emerald: "bg-emerald-500/30",
  violet: "bg-violet-500/30",
  amber: "bg-amber-500/30",
  rose: "bg-rose-500/30",
  slate: "bg-slate-500/30",
};

function loadSeenIds(): Set<string> {
  if (typeof window === "undefined") return new Set();
  try {
    const raw = sessionStorage.getItem(STORAGE_KEY);
    if (!raw) return new Set();
    const arr = JSON.parse(raw) as string[];
    return new Set(Array.isArray(arr) ? arr : []);
  } catch {
    return new Set();
  }
}

function rememberSeenId(id: string) {
  try {
    const s = loadSeenIds();
    s.add(id);
    sessionStorage.setItem(STORAGE_KEY, JSON.stringify([...s].slice(-200)));
  } catch {
    /* ignore */
  }
}

export function AdvisorClientRequestToastStack({ tenantId }: { tenantId: string }) {
  const router = useRouter();
  const [items, setItems] = useState<ToastRow[]>([]);
  const timersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const exitTimersRef = useRef<Record<string, ReturnType<typeof setTimeout>>>({});
  const seenRef = useRef<Set<string>>(new Set());

  const removeAfterExit = useCallback((id: string) => {
    if (exitTimersRef.current[id]) clearTimeout(exitTimersRef.current[id]);
    exitTimersRef.current[id] = setTimeout(() => {
      setItems((prev) => prev.filter((t) => t.id !== id));
      delete exitTimersRef.current[id];
    }, EXIT_MS);
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      if (timersRef.current[id]) {
        clearTimeout(timersRef.current[id]);
        delete timersRef.current[id];
      }
      setItems((prev) => prev.map((t) => (t.id === id ? { ...t, isExiting: true } : t)));
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
    (opportunityId: string, toastId: string) => {
      router.push(`/portal/pipeline/${opportunityId}`);
      dismiss(toastId);
    },
    [router, dismiss]
  );

  useEffect(() => {
    if (!tenantId?.trim()) return;
    seenRef.current = loadSeenIds();
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
    if (!url) return;

    const supabase = createClient();
    const channel = supabase
      .channel(`opportunities-portal-requests-${tenantId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "opportunities",
          filter: `tenant_id=eq.${tenantId}`,
        },
        async (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (!row?.id) return;
          const opportunityId = String(row.id);
          if (seenRef.current.has(opportunityId)) return;

          const cf = parseCustomFields(row.custom_fields);
          if (!isClientPortalRequest(cf)) return;

          const contactId = row.contact_id != null ? String(row.contact_id) : null;
          if (!contactId) return;

          seenRef.current.add(opportunityId);
          rememberSeenId(opportunityId);

          const caseType = typeof row.case_type === "string" ? row.case_type : "jiné";
          const title = typeof row.title === "string" ? row.title : "";
          const createdAt = typeof row.created_at === "string" ? row.created_at : new Date().toISOString();
          const accent = accentForCaseType(caseType);
          const Icon = iconForCaseType(caseType);
          const categoryLabel = caseTypeToLabel(caseType);
          const preview = previewFromRow(title, cf);
          const timeLabel = formatToastTime(createdAt);

          let clientName = "Klient";
          const nameRes = await getContactDisplayNameForAdvisorToast(contactId);
          if ("name" in nameRes) clientName = nameRes.name;

          const toastId = `prt-${opportunityId}-${Date.now()}`;
          const next: ToastRow = {
            id: toastId,
            opportunityId,
            clientName,
            categoryLabel,
            preview,
            timeLabel,
            accent,
            Icon,
            isExiting: false,
            progressMs: AUTO_DISMISS_MS,
          };

          setItems((prev) => [...prev.slice(-6), next]);
          scheduleAutoDismiss(toastId);
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
      Object.values(timersRef.current).forEach(clearTimeout);
      Object.values(exitTimersRef.current).forEach(clearTimeout);
      timersRef.current = {};
      exitTimersRef.current = {};
    };
  }, [tenantId, scheduleAutoDismiss]);

  useEffect(
    () => () => {
      Object.values(timersRef.current).forEach(clearTimeout);
      Object.values(exitTimersRef.current).forEach(clearTimeout);
    },
    []
  );

  if (items.length === 0) return null;

  return (
    <div
      className="pointer-events-none fixed bottom-24 right-4 z-[301] flex w-[calc(100%-2rem)] max-w-[400px] flex-col gap-3 md:bottom-6 md:right-6"
      aria-live="polite"
    >
      {items.map((t) => (
        <div
          key={t.id}
          role="button"
          tabIndex={0}
          onClick={() => openDetail(t.opportunityId, t.id)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === " ") {
              e.preventDefault();
              openDetail(t.opportunityId, t.id);
            }
          }}
          className={`pointer-events-auto relative w-full cursor-pointer overflow-hidden rounded-[24px] border border-white bg-white/95 text-left shadow-[0_24px_48px_-12px_rgba(0,0,0,0.15)] ring-1 ring-slate-900/5 backdrop-blur-2xl ${
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
                <span className="flex shrink-0 items-center gap-1 text-[10px] font-bold uppercase tracking-widest text-slate-400">
                  <Clock size={10} /> {t.timeLabel}
                </span>
              </div>
              <p className={`mb-1.5 font-[family-name:var(--font-jakarta)] text-xs font-bold ${ACCENT_SUB[t.accent]}`}>
                {t.categoryLabel}
              </p>
              <p className="line-clamp-2 text-[13px] font-medium leading-relaxed text-slate-500">{t.preview}</p>

              <div className="mt-4">
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    openDetail(t.opportunityId, t.id);
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
              className="-mr-1 -mt-1 shrink-0 rounded-lg p-1.5 text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-800"
              aria-label="Zavřít"
            >
              <X size={16} />
            </button>
          </div>

          <div className="absolute bottom-0 left-0 h-1 w-full bg-slate-100">
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
