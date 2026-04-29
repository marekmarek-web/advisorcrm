"use client";

import { useState, useEffect, type ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";
import {
  Calendar,
  CheckSquare,
  Briefcase,
  UserPlus,
  AlertCircle,
  Clock,
  ChevronRight,
  Calculator,
  FileText,
  PieChart,
  ArrowRight,
  Users,
  MessageSquare,
  StickyNote,
  CheckCircle2,
  LayoutDashboard,
  ListTodo,
  Sparkles,
  type LucideIcon,
} from "lucide-react";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import type { DashboardKpis } from "@/app/actions/dashboard";
import type { ServiceRecommendationWithContact } from "@/app/actions/service-engine";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import { formatMeetingNoteDomainLabel } from "@/lib/meeting-notes/domain-labels";
import { meetingNoteContentTitle as noteContentTitle } from "@/lib/meeting-notes/meeting-note-content";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import { TodayInCalendarWidget } from "@/app/components/dashboard/TodayInCalendarWidget";
import { getServiceCtaHref } from "@/lib/service-engine/cta";
import {
  MobileCard,
  MobileSectionHeader,
  StatusBadge,
  MobileLoadingState,
  ErrorState,
} from "@/app/shared/mobile-ui/primitives";
import { formatDisplayDateCs } from "@/lib/date/format-display-cs";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import type { DashboardSummary } from "@/lib/ai/dashboard-types";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

function formatCount(count: number, one: string, few: string, many: string): string {
  if (count === 1) return `1 ${one}`;
  if (count >= 2 && count <= 4) return `${count} ${few}`;
  return `${count} ${many}`;
}

function firstNameFromAdvisor(advisorName: string): string {
  const first = advisorName.trim().split(/\s+/)[0];
  return first || "poradce";
}

function AccentCard({
  tone,
  children,
  className,
}: {
  tone: "indigo" | "rose" | "emerald" | "amber" | "slate";
  children: ReactNode;
  className?: string;
}) {
  const topBorder = {
    indigo: "border-t-4 border-t-indigo-500",
    rose: "border-t-4 border-t-rose-500",
    emerald: "border-t-4 border-t-emerald-500",
    amber: "border-t-4 border-t-amber-500",
    slate: "border-t-4 border-t-slate-500",
  }[tone];
  return (
    <section
      className={cx(
        "relative overflow-hidden rounded-[30px] border border-[color:var(--wp-surface-card-border)] bg-white shadow-[0_18px_44px_-34px_rgba(15,23,42,.32)]",
        topBorder,
        className,
      )}
    >
      {children}
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Quick-action pill definitions                                      */
/* ------------------------------------------------------------------ */

type QuickActionItem =
  | { icon: LucideIcon; label: string; href?: string; action?: "newTask" | "newClient" | "newOpportunity" }
  | { brandAi: true; label: string; href: string };

const QUICK_ACTIONS: QuickActionItem[] = [
  { icon: CheckSquare, label: "Nový úkol", action: "newTask" },
  { icon: UserPlus, label: "Nový klient", action: "newClient" },
  { icon: Calendar, label: "Nová schůzka", href: "/portal/calendar?new=1" },
  { icon: Briefcase, label: "Nový případ", action: "newOpportunity" },
  { icon: MessageSquare, label: "Zpráva", href: "/portal/messages" },
  { icon: LayoutDashboard, label: "Tabule", href: "/portal/board" },
  { icon: Calculator, label: "Kalkulačky", href: "/portal/calculators" },
  { icon: PieChart, label: "Analýza", href: "/portal/analyses/financial" },
  { brandAi: true, label: "Kontrola smluv", href: "/portal/contracts/review" },
];

/* ------------------------------------------------------------------ */
/*  Shared widget card wrapper                                         */
/* ------------------------------------------------------------------ */

function _WidgetCard({
  icon: Icon,
  title,
  href,
  iconColor,
  borderColor,
  children,
}: {
  icon: LucideIcon;
  title: string;
  href?: string;
  iconColor?: string;
  borderColor?: string;
  children: ReactNode;
}) {
  return (
    <MobileCard className={cx("overflow-hidden", borderColor)}>
      <div className="flex items-center justify-between mb-3">
        <div className="flex items-center gap-2">
          <Icon size={16} className={iconColor ?? "text-[color:var(--wp-text-tertiary)]"} />
          <h3 className="text-xs font-black uppercase tracking-widest text-[color:var(--wp-text-secondary)]">{title}</h3>
        </div>
        {href ? (
          <Link href={href} className="text-[color:var(--wp-text-tertiary)] min-h-[44px] min-w-[44px] inline-flex items-center justify-center -mr-2">
            <ChevronRight size={16} />
          </Link>
        ) : null}
      </div>
      {children}
    </MobileCard>
  );
}

/* ------------------------------------------------------------------ */
/*  Per-widget renderers                                               */
/* ------------------------------------------------------------------ */

function useAIDashboardSummary() {
  const [summary, setSummary] = useState<DashboardSummary | null>(null);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [retryNonce, setRetryNonce] = useState(0);

  useEffect(() => {
    let cancelled = false;
    let started = false;
    const run = () => {
      if (cancelled || started) return;
      started = true;
      fetch("/api/ai/dashboard-summary")
        .then((r) => (r.ok ? r.json() : Promise.reject(new Error(String(r.status)))))
        .then((d) => {
          if (cancelled) return;
          if (d?.error) {
            setFetchError(typeof d.error === "string" ? d.error : "Interní náhled se nepodařilo načíst.");
            setSummary(null);
          } else {
            setFetchError(null);
            setSummary(d as DashboardSummary);
          }
        })
        .catch(() => {
          if (!cancelled) {
            setFetchError("Interní náhled se nepodařilo načíst.");
            setSummary(null);
          }
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    };
    const idleId =
      typeof requestIdleCallback !== "undefined"
        ? requestIdleCallback(run, { timeout: 2500 })
        : undefined;
    const t = window.setTimeout(run, 400);
    return () => {
      cancelled = true;
      window.clearTimeout(t);
      if (idleId !== undefined && typeof cancelIdleCallback !== "undefined") cancelIdleCallback(idleId);
    };
  }, [retryNonce]);

  const retry = () => {
    setLoading(true);
    setFetchError(null);
    setSummary(null);
    setRetryNonce((n) => n + 1);
  };

  return { summary, loading, fetchError, retry };
}

function _HeroDashboardCard() {
  return (
    <div
      className={cx(
        "relative overflow-hidden rounded-[2rem] border border-white/10 px-5 py-5 text-white shadow-[0_20px_50px_rgba(10,15,41,0.32)]",
        "bg-gradient-to-br from-[color:var(--wp-text)] via-[color:var(--wp-text)] to-indigo-950",
      )}
    >
      <div className="pointer-events-none absolute -right-10 -top-10 h-40 w-40 rounded-full bg-violet-500/20 blur-3xl" aria-hidden />
      <div className="pointer-events-none absolute -left-8 bottom-0 h-32 w-32 rounded-full bg-indigo-400/15 blur-2xl" aria-hidden />
      <div className="relative">
        <p className="text-[10px] font-black uppercase tracking-[0.14em] text-indigo-200/90">Přehled</p>
        <p className="mt-2 text-lg font-black leading-snug tracking-tight">Tady je váš prioritní přehled.</p>
        <p className="mt-2 text-xs font-medium leading-relaxed text-indigo-100/75">
          Interní souhrn úkolů, AI kontroly a nadcházející agendy — pouze pro vás, nikoli doporučení klientovi.
        </p>
      </div>
    </div>
  );
}

function PriorityLinkRow({
  href,
  title,
  description,
  badge,
  icon: Icon,
}: {
  href: string;
  title: string;
  description?: string;
  badge: ReactNode;
  icon: LucideIcon;
}) {
  return (
    <MobileCard className="overflow-hidden p-0 shadow-[var(--aidv-mobile-shadow-card-premium,var(--aidv-shadow-card-sm))]">
      <Link href={href} className="flex min-h-[44px] items-start gap-3 px-4 py-3.5 active:bg-black/[0.025]">
        <div className="mt-0.5 flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-50 to-violet-50 ring-1 ring-indigo-100/80">
          <Icon size={18} className="text-[color:var(--wp-text)]" strokeWidth={2} />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="font-bold text-[15px] leading-snug text-[color:var(--wp-text)]">{title}</span>
            {badge}
          </div>
          {description ? (
            <p className="mt-1 text-sm leading-snug text-[color:var(--wp-text-secondary)] line-clamp-2">{description}</p>
          ) : null}
        </div>
        <ChevronRight size={18} className="mt-1 shrink-0 text-[color:var(--wp-text-tertiary)]" aria-hidden />
      </Link>
    </MobileCard>
  );
}

function buildPriorityRows(
  kpis: DashboardKpis,
  summary: DashboardSummary | null,
  reviewHref: (id: string) => string,
) {
  type Row = {
    key: string;
    href: string;
    title: string;
    description?: string;
    badge: ReactNode;
    icon: LucideIcon;
  };
  const rows: Row[] = [];

  for (const t of kpis.overdueTasks.slice(0, 4)) {
    rows.push({
      key: `task-${t.id}`,
      href: "/portal/tasks?filter=overdue",
      title: t.title,
      description: t.contactName ? `${t.contactName} · po termínu` : "Po termínu",
      badge: <StatusBadge tone="danger">Po termínu</StatusBadge>,
      icon: ListTodo,
    });
  }

  for (const c of (summary?.contractsWaitingForReview ?? []).slice(0, 4)) {
    rows.push({
      key: `rev-${c.id}`,
      href: reviewHref(c.id),
      title: c.fileName || "Soubor ke kontrole",
      description: "Čeká na interní kontrolu",
      badge: (
        <span className="inline-flex items-center gap-1 rounded-lg border border-violet-200 bg-violet-50 px-2 py-0.5">
          <AiAssistantBrandIcon size={12} className="shrink-0 opacity-90" />
          <span className="text-[10px] font-black uppercase tracking-wide text-violet-800">AI kontrola</span>
        </span>
      ),
      icon: FileText,
    });
  }

  for (const row of kpis.sidePanelAgendaTimeline.slice(0, 5)) {
    const href =
      row.kind === "event"
        ? "/portal/calendar"
        : row.kind === "task"
          ? "/portal/tasks?filter=today"
          : "/portal/tasks";
    rows.push({
      key: row.id,
      href,
      title: row.title,
      description: `${row.relativeLabel ? row.relativeLabel.charAt(0).toUpperCase() + row.relativeLabel.slice(1) : "—"} · ${row.time}${row.sub ? ` · ${row.sub}` : ""}`,
      badge: <StatusBadge tone="info">{row.kind === "event" ? "Událost" : "Úkol"}</StatusBadge>,
      icon: row.kind === "event" ? Calendar : CheckSquare,
    });
  }

  const seen = new Set<string>();
  const deduped: Row[] = [];
  for (const r of rows) {
    if (seen.has(r.key)) continue;
    seen.add(r.key);
    deduped.push(r);
    if (deduped.length >= 10) break;
  }

  const pragueHoliday = kpis.czPublicHolidayToday;
  if (deduped.length === 0 && pragueHoliday) {
    deduped.push({
      key: "holiday",
      href: "/portal/calendar",
      title: pragueHoliday,
      description: "Státní svátek — zkontrolujte plán.",
      badge: <StatusBadge tone="neutral">Svátek</StatusBadge>,
      icon: Sparkles,
    });
  }

  return deduped;
}

function _KpiClientsStrip({
  serviceRecommendations,
  kpis,
}: {
  serviceRecommendations: ServiceRecommendationWithContact[];
  kpis: DashboardKpis;
}) {
  const chips: { key: string; label: string; href: string }[] = [];
  for (const r of serviceRecommendations.slice(0, 6)) {
    const name = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ").trim() || "Klient";
    const cta = getServiceCtaHref(r, r.contactId);
    chips.push({ key: `rec-${r.id}`, label: name, href: cta.href });
  }
  if (chips.length === 0) {
    for (const c of kpis.serviceDueContacts.slice(0, 6)) {
      chips.push({
        key: `svc-${c.id}`,
        label: `${c.firstName} ${c.lastName}`.trim(),
        href: `/portal/contacts/${c.id}`,
      });
    }
  }
  if (chips.length === 0) {
    return (
      <p className="text-[11px] font-medium leading-relaxed text-[color:var(--wp-text-secondary)]">
        Žádná aktivní péče ani servisní termín v tomto výřezu.
      </p>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((c) => (
        <Link
          key={c.key}
          href={c.href}
          className="max-w-full truncate rounded-full border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-1.5 text-[11px] font-bold text-[color:var(--wp-text-secondary)] shadow-sm active:scale-[0.99]"
        >
          {c.label}
        </Link>
      ))}
    </div>
  );
}

function AiInsightsPanel({
  summary,
  loading,
  fetchError,
  onRetry,
}: {
  summary: DashboardSummary | null;
  loading: boolean;
  fetchError: string | null;
  onRetry: () => void;
}) {
  /** Jen fronta AI review smluv — ne `suggestedActions` (tam jsou i úkoly a klienti). */
  const contractQueue = (summary?.contractsWaitingForReview ?? []).slice(0, 5);
  const prose = summary?.assistantSummaryText?.trim();

  if (loading) {
    return (
      <MobileCard className="border-indigo-100/80">
        <MobileLoadingState rows={3} variant="row" label="Načítám interní kontrolní náhled" />
      </MobileCard>
    );
  }

  if (fetchError) {
    return (
      <ErrorState
        title="Interní kontrolní náhled"
        description={fetchError}
        onRetry={onRetry}
        homeHref={false}
      />
    );
  }

  if (!summary) {
    return (
      <MobileCard>
        <p className="text-sm text-[color:var(--wp-text-secondary)]">Interní náhled není k dispozici.</p>
      </MobileCard>
    );
  }

  const hasBody = contractQueue.length > 0 || Boolean(prose);
  if (!hasBody) {
    return (
      <MobileCard className="border-indigo-50 bg-gradient-to-br from-white to-indigo-50/30">
        <div className="flex items-center gap-2">
          <AiAssistantBrandIcon size={22} className="shrink-0" />
          <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">
            Pro tento den nejsou další interní podněty z AI náhledu.
          </p>
        </div>
        <Link
          href="/portal/contracts/review"
          className="mt-3 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white"
        >
          <AiAssistantBrandIcon size={16} /> Kontrola smluv <ArrowRight size={14} />
        </Link>
      </MobileCard>
    );
  }

  return (
    <MobileCard className="border-indigo-100/80 bg-gradient-to-br from-white to-violet-50/25">
      <div className="flex items-center gap-2 mb-3">
        <AiAssistantBrandIcon size={22} className="shrink-0" />
        <h3 className="text-sm font-black tracking-tight text-[color:var(--wp-text)]">Interní kontrolní náhled</h3>
      </div>
      {contractQueue.length > 0 ? (
        <div className="space-y-2">
          <p className="text-[10px] font-black uppercase tracking-[0.12em] text-[color:var(--wp-text-tertiary)]">
            Čeká na interní kontrolu
          </p>
          <div className="space-y-1.5">
            {contractQueue.map((c) => (
              <Link
                key={c.id}
                href={`/portal/contracts/review/${encodeURIComponent(c.id)}`}
                className="flex min-h-[44px] items-center justify-between gap-2 rounded-xl border border-violet-100 bg-violet-50/40 px-3 py-2.5 text-sm font-semibold text-[color:var(--wp-text)] active:scale-[0.99]"
              >
                <span className="min-w-0 flex-1 truncate">{c.fileName?.trim() || "Soubor ke kontrole"}</span>
                <ArrowRight size={14} className="shrink-0 text-violet-500" aria-hidden />
              </Link>
            ))}
          </div>
        </div>
      ) : null}
      {prose ? (
        <details className="mt-3 rounded-xl border border-indigo-100 bg-white/80 px-3 py-2">
          <summary className="cursor-pointer list-none text-xs font-bold text-indigo-800">
            Textový souhrn (interní)
          </summary>
          <p className="mt-2 text-xs leading-relaxed text-[color:var(--wp-text-secondary)]">{prose}</p>
        </details>
      ) : null}
      <Link
        href="/portal/contracts/review"
        className="mt-4 flex min-h-[44px] w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 text-sm font-bold text-white"
      >
        <AiAssistantBrandIcon size={16} /> Otevřít kontrolu smluv <ArrowRight size={14} />
      </Link>
    </MobileCard>
  );
}

function _TasksWidget({ kpis }: { kpis: DashboardKpis }) {
  const all = [...kpis.overdueTasks, ...(kpis.tasksDueToday ?? [])].slice(0, 5);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = (d: string) => d < todayStr;
  const timeLabel = (due: string) => {
    if (due < todayStr) return "Po termínu";
    if (due === todayStr) return "Dnes";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (due === tomorrow.toISOString().slice(0, 10)) return "Zítra";
    return formatDisplayDateCs(due) || due;
  };

  if (all.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center text-emerald-500 mb-2 border border-emerald-100">
          <CheckCircle2 size={24} />
        </div>
        <p className="font-bold text-emerald-600 text-sm">Vše splněno!</p>
        <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">Máte čistý stůl.</p>
      </div>
    );
  }

  return (
    <div className="space-y-1">
      {all.map((t) => (
        <Link
          key={t.id}
          href={`/portal/tasks${isOverdue(t.dueDate) ? "?filter=overdue" : "?filter=today"}`}
          className="flex items-start gap-2.5 p-2.5 rounded-xl hover:bg-[color:var(--wp-surface-muted)] transition-colors group"
        >
          <span className="mt-0.5 w-4 h-4 rounded border-2 border-amber-300 shrink-0" />
          <div className="flex-1 min-w-0">
            <p className="text-sm font-bold text-[color:var(--wp-text)] truncate group-hover:text-indigo-600 transition-colors">
              {t.title}
            </p>
            <span
              className={cx(
                "text-[10px] font-black uppercase tracking-widest flex items-center gap-1",
                isOverdue(t.dueDate) ? "text-rose-500" : "text-amber-500"
              )}
            >
              <Clock size={10} /> {timeLabel(t.dueDate)}
              {t.contactName && (
                <span className="normal-case font-semibold text-[color:var(--wp-text-secondary)]"> · {t.contactName}</span>
              )}
            </span>
          </div>
        </Link>
      ))}
      <Link
        href="/portal/tasks"
        className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1 pt-1"
      >
        Všechny úkoly <ChevronRight size={12} />
      </Link>
    </div>
  );
}

function ActiveDealsWidget({ kpis }: { kpis: DashboardKpis }) {
  const atRisk = kpis.pipelineAtRisk.slice(0, 3);
  const step34 = (kpis.opportunitiesInStep3And4 ?? []).slice(0, 3);

  if (atRisk.length === 0 && step34.length === 0) {
    return (
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-12 h-12 bg-[color:var(--wp-surface-muted)] rounded-xl flex items-center justify-center text-[color:var(--wp-text-tertiary)] mb-2 border border-[color:var(--wp-surface-card-border)]">
          <Clock size={24} />
        </div>
        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">Žádné aktivní obchody.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2.5">
      {atRisk.map((o) => (
        <Link
          key={o.id}
          href={`/portal/pipeline/${o.id}`}
          className="block rounded-[22px] border border-white/80 bg-white/86 p-3.5 shadow-[0_12px_28px_-24px_rgba(15,23,42,.25)] ring-1 ring-[color:var(--wp-surface-card-border)]/35 active:scale-[0.99]"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 bg-orange-50 px-1.5 py-0.5 rounded">
            Ohrožení
          </span>
          <h4 className="font-bold text-sm text-[color:var(--wp-text)] mt-1.5">{o.title}</h4>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5 flex items-center gap-1">
            <Users size={11} /> {o.contactName ?? "—"}
          </p>
        </Link>
      ))}
      {step34.map((o) => (
        <Link
          key={o.id}
          href={`/portal/pipeline/${o.id}`}
          className="block rounded-[22px] border border-white/80 bg-white/86 p-3.5 shadow-[0_12px_28px_-24px_rgba(15,23,42,.25)] ring-1 ring-[color:var(--wp-surface-card-border)]/35 active:scale-[0.99]"
        >
          <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-1.5 py-0.5 rounded">
            {o.stageName}
          </span>
          <h4 className="font-bold text-sm text-[color:var(--wp-text)] mt-1.5">{o.title}</h4>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5 flex items-center gap-1">
            <Users size={11} /> {o.contactName ?? "—"}
          </p>
        </Link>
      ))}
      <Link
        href="/portal/pipeline"
        className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1 pt-1"
      >
        Obchody <ChevronRight size={12} />
      </Link>
    </div>
  );
}

function _ClientCareWidget({
  serviceRecommendations,
  kpis,
}: {
  serviceRecommendations: ServiceRecommendationWithContact[];
  kpis: DashboardKpis;
}) {
  const recs = serviceRecommendations.slice(0, 4);
  const service = kpis.serviceDueContacts.slice(0, 3);
  const ann = kpis.upcomingAnniversaries.slice(0, 3);
  const hasRecs = recs.length > 0;
  const hasLegacy = service.length > 0 || ann.length > 0;

  if (!hasRecs && !hasLegacy) {
    return <p className="text-sm py-3 text-[color:var(--wp-text-secondary)]">Žádná péče k zobrazení.</p>;
  }

  if (hasRecs) {
    return (
      <div className="space-y-2">
        {recs.map((r) => {
          const cta = getServiceCtaHref(r, r.contactId);
          const name =
            [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") || "Klient";
          const isRecOverdue = r.urgency === "overdue";
          return (
            <div
              key={r.id}
              className={cx(
                "flex items-center justify-between gap-2 p-2.5 rounded-xl border min-h-[44px]",
                isRecOverdue ? "bg-red-50/50 border-red-100/50" : "bg-amber-50/30 border-amber-100/50"
              )}
            >
              <div className="min-w-0 flex-1">
                <h4 className="font-bold text-sm text-[color:var(--wp-text)]">{name}</h4>
                <p className="text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">{r.title}</p>
              </div>
              <Link
                href={cta.href}
                className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center px-2.5 rounded-lg bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] border border-[color:var(--wp-surface-card-border)] text-xs font-semibold shrink-0"
              >
                {cta.label}
              </Link>
            </div>
          );
        })}
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {service.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/30 border border-amber-100/50 min-h-[44px]"
        >
          <div>
            <h4 className="font-bold text-sm text-[color:var(--wp-text)]">
              {c.firstName} {c.lastName}
            </h4>
            <p className="text-xs font-bold text-amber-600 flex items-center gap-1">
              <AlertCircle size={11} /> Servis ·{" "}
              {new Date(c.nextServiceDue).toLocaleDateString("cs-CZ")}
            </p>
          </div>
          <Link
            href={`/portal/contacts/${c.id}`}
            className="p-2 bg-[color:var(--wp-surface-card)] rounded-lg border border-[color:var(--wp-surface-card-border)] min-h-[44px] min-w-[44px] inline-flex items-center justify-center shrink-0"
          >
            <ChevronRight size={14} />
          </Link>
        </div>
      ))}
      {ann.map((c) => (
        <div
          key={c.id}
          className="flex items-center justify-between p-2.5 rounded-xl bg-amber-50/30 border border-amber-100/50 min-h-[44px]"
        >
          <div>
            <h4 className="font-bold text-sm text-[color:var(--wp-text)]">{c.partnerName ?? "—"}</h4>
            <p className="text-xs font-bold text-amber-600 flex items-center gap-1">
              <AlertCircle size={11} /> Výročí ·{" "}
              {formatDisplayDateCs(c.anniversaryDate) || c.anniversaryDate}
            </p>
          </div>
          <Link
            href={`/portal/contacts/${c.contactId}`}
            className="p-2 bg-[color:var(--wp-surface-card)] rounded-lg border border-[color:var(--wp-surface-card-border)] min-h-[44px] min-w-[44px] inline-flex items-center justify-center shrink-0"
          >
            <ChevronRight size={14} />
          </Link>
        </div>
      ))}
    </div>
  );
}

function FinancialAnalysesWidget({ analyses }: { analyses: FinancialAnalysisListItem[] }) {
  const formatAgo = (d: Date | string) => {
    const t = new Date(d).getTime();
    const diff = Math.floor((new Date().getTime() - t) / 86400000);
    if (diff === 0) return "Dnes";
    if (diff === 1) return "Včera";
    if (diff < 7) return `Před ${diff} dny`;
    return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" });
  };

  if (analyses.length === 0) {
    return <p className="text-sm py-3 text-[color:var(--wp-text-secondary)]">Žádné finanční analýzy.</p>;
  }

  return (
    <div className="space-y-2">
      {analyses.slice(0, 3).map((a) => (
        <Link
          key={a.id}
          href={`/portal/analyses/financial?id=${encodeURIComponent(a.id)}`}
          className="block p-3 rounded-xl border border-[color:var(--wp-surface-card-border)] hover:border-indigo-200 transition-all bg-[color:var(--wp-surface-card)] group"
        >
          <div className="flex justify-between items-start mb-1.5">
            <span className="p-1 bg-blue-50 text-blue-600 rounded-lg">
              <FileText size={14} />
            </span>
            <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
              {formatAgo(a.updatedAt)}
            </span>
          </div>
          <h4 className="font-bold text-sm text-[color:var(--wp-text)] group-hover:text-indigo-600 transition-colors">
            {a.analysisTypeLabel ?? "Analýza"}
          </h4>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">{a.clientName ?? "—"}</p>
          <div className="mt-2 pt-2 border-t border-[color:var(--wp-surface-card-border)] flex justify-between items-center">
            <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-1.5 py-0.5 rounded">
              {a.status === "completed"
                ? "Dokončeno"
                : a.status === "draft"
                  ? "Rozpracováno"
                  : a.status}
            </span>
            <ChevronRight
              size={12}
              className="text-[color:var(--wp-text-tertiary)] group-hover:text-indigo-600 transition-colors"
            />
          </div>
        </Link>
      ))}
      <Link
        href="/portal/analyses"
        className="text-xs font-bold text-indigo-600 hover:underline inline-flex items-center gap-1 pt-1"
      >
        Všechny analýzy <ChevronRight size={12} />
      </Link>
    </div>
  );
}

function MessagesWidget() {
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    import("@/app/actions/messages")
      .then((mod) => mod.getUnreadConversationsCount())
      .then((c) => setUnreadCount(c))
      .catch(() => {})
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="flex items-center gap-3 min-h-[52px] py-1">
        <div className="w-10 h-10 rounded-xl bg-[color:var(--wp-surface-muted)] animate-pulse shrink-0" />
        <div className="flex-1 space-y-2 min-w-0">
          <div className="h-6 bg-[color:var(--wp-surface-muted)] rounded-lg w-16 animate-pulse" />
          <div className="h-3 bg-[color:var(--wp-surface-muted)] rounded w-32 animate-pulse" />
        </div>
      </div>
    );
  }

  return (
    <div className="py-1 min-h-[52px]">
      <div className="flex items-center gap-3">
        <div className="w-10 h-10 rounded-xl bg-emerald-50 flex items-center justify-center text-emerald-500 border border-emerald-100">
          <MessageSquare size={20} />
        </div>
        <div>
          <p className="text-2xl font-black text-[color:var(--wp-text)] tabular-nums">{unreadCount}</p>
          <p className="text-xs text-[color:var(--wp-text-secondary)] font-bold">nepřečtených zpráv</p>
        </div>
      </div>
    </div>
  );
}

function NotesWidget({ notes }: { notes: MeetingNoteForBoard[] }) {
  if (notes.length === 0) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-[color:var(--wp-text-secondary)]">Žádné zápisky z posledních schůzek.</p>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      {notes.slice(0, 4).map((n) => {
        const title = noteContentTitle(n.content);
        const domainLabel = formatMeetingNoteDomainLabel(n.domain);
        const contact =
          n.contactName && n.contactName !== "Obecný zápisek" ? n.contactName : null;
        const meta = contact
          ? `${domainLabel} · ${new Date(n.meetingAt).toLocaleDateString("cs-CZ")} · ${contact}`
          : `${domainLabel} · ${new Date(n.meetingAt).toLocaleDateString("cs-CZ")}`;
        return (
          <div
            key={n.id}
            className="p-2.5 rounded-xl border border-amber-100 bg-amber-50/30"
          >
            <div className="flex justify-between items-start gap-2">
              <div className="min-w-0 flex-1">
                <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                  {title}
                </p>
                <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5 line-clamp-2">
                  {meta}
                </p>
              </div>
              <StickyNote size={14} className="text-amber-400 shrink-0 mt-0.5" />
            </div>
          </div>
        );
      })}
    </div>
  );
}

function MobileDashboardHero({
  dateLabel,
  overdueCount,
  reviewCount,
  agendaCount,
  priorityCount,
}: {
  dateLabel: string;
  overdueCount: number;
  reviewCount: number;
  agendaCount: number;
  priorityCount: number;
}) {
  const hasAiReview = reviewCount > 0;
  const headline =
    overdueCount > 0 || hasAiReview
      ? `Dnes řešíte hlavně ${overdueCount > 0 ? "zpožděné úkoly" : "dnešní agendu"}${hasAiReview ? " a kontrolu smluv" : ""}.`
      : "Dnes je prostor projít agendu a posunout otevřené priority.";
  return (
    <section className="relative overflow-hidden rounded-[36px] bg-[color:var(--wp-text)] p-5 text-white shadow-[0_26px_70px_-24px_rgba(15,23,42,.58)]">
      <div className="absolute -bottom-28 left-4 h-72 w-72 rounded-full bg-violet-500/22 blur-[70px]" aria-hidden />

      <div className="relative">
        <div className="mb-6 flex items-start justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-full bg-white shadow-[0_12px_24px_-14px_rgba(15,23,42,.4)] ring-1 ring-black/10">
              <Image
                src="/logos/ai-button.png"
                alt=""
                width={128}
                height={128}
                sizes="48px"
                className="h-full w-full object-contain"
                priority={false}
              />
            </span>
            <div className="min-w-0">
              <p className="text-[10px] font-black uppercase tracking-[0.22em] text-white/55">Dnešní priority</p>
              <p className="mt-1 text-[13px] font-semibold text-white/64">{dateLabel}</p>
            </div>
          </div>
          <span className="shrink-0 rounded-full border border-white/15 bg-white/10 px-3 py-1.5 text-[11px] font-black text-white/78 backdrop-blur-md">
            {formatCount(priorityCount, "priorita", "priority", "priorit")}
          </span>
        </div>

        <h2 className="max-w-[285px] text-[30px] font-black leading-[1.04] tracking-tight">{headline}</h2>
        <p className="mt-4 max-w-[300px] text-[14px] font-semibold leading-6 text-white/58">
          Pracovní nástěnka vytahuje jen věci, které mají dopad na dnešní postup.
        </p>

        <div className="mt-6 grid grid-cols-3 gap-2.5">
          <div className="rounded-[22px] border border-white/10 bg-white/8 p-3 backdrop-blur-md">
            <p className="text-[26px] font-black leading-none">{overdueCount}</p>
            <p className="mt-2 text-[10px] font-bold leading-4 text-white/60">úkolů po termínu</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/8 p-3 backdrop-blur-md">
            <p className="text-[26px] font-black leading-none">{reviewCount}</p>
            <p className="mt-2 text-[10px] font-bold leading-4 text-white/60">smluv k revizi</p>
          </div>
          <div className="rounded-[22px] border border-white/10 bg-white/8 p-3 backdrop-blur-md">
            <p className="text-[26px] font-black leading-none">{agendaCount}</p>
            <p className="mt-2 text-[10px] font-bold leading-4 text-white/60">body agendy</p>
          </div>
        </div>

        <Link
          href={hasAiReview ? "/portal/contracts/review" : "/portal/tasks"}
          className="mt-5 flex min-h-[52px] w-full items-center justify-center gap-2 rounded-[20px] bg-gradient-to-r from-indigo-500 to-violet-600 text-[14px] font-black text-white shadow-[0_18px_34px_-18px_rgba(99,102,241,.82)] active:scale-[.98]"
        >
          <Sparkles size={18} />
          {hasAiReview ? "Otevřít kontrolu smluv" : "Otevřít priority"}
          <ArrowRight size={18} />
        </Link>
      </div>
    </section>
  );
}

function MobileDashboardAlert({ kpis }: { kpis: DashboardKpis }) {
  const risk = kpis.pipelineAtRisk[0] ?? null;
  if (!risk) {
    return (
      <AccentCard tone="emerald" className="p-5">
        <div className="flex items-center gap-3">
          <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100">
            <CheckCircle2 size={22} />
          </span>
          <div className="min-w-0">
            <h3 className="text-[18px] font-black text-[color:var(--wp-text)]">Bez urgentního obchodu</h3>
            <p className="mt-1 text-[13px] font-semibold text-[color:var(--wp-text-secondary)]">V aktuálním výřezu není obchod po termínu.</p>
          </div>
        </div>
      </AccentCard>
    );
  }

  return (
    <AccentCard tone="rose" className="p-5">
      <div className="mb-4 flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-black uppercase tracking-[0.18em] text-rose-500">Vyžaduje pozornost</p>
          <h3 className="mt-1 text-[20px] font-black tracking-tight text-[color:var(--wp-text)]">Obchodní případ po termínu</h3>
        </div>
        <span className="shrink-0 rounded-full bg-rose-50 px-3 py-1.5 text-[10px] font-black uppercase tracking-[0.08em] text-rose-600 ring-1 ring-rose-100">
          Po termínu
        </span>
      </div>

      <div className="rounded-[24px] border border-rose-100 bg-gradient-to-br from-white to-rose-50/70 p-4">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="line-clamp-2 text-[16px] font-black leading-snug text-[color:var(--wp-text)]">{risk.title}</p>
            <p className="mt-1 text-[13px] font-semibold text-[color:var(--wp-text-secondary)]">{risk.contactName ?? "Bez klienta"}</p>
            <p className="mt-2 text-[12px] font-bold text-rose-600">Termín: {formatDisplayDateCs(risk.expectedCloseDate) ?? risk.expectedCloseDate}</p>
          </div>
          <p className="shrink-0 text-right text-[12px] font-black text-[color:var(--wp-text-secondary)]">
            Hodnota<br />není v přehledu
          </p>
        </div>
      </div>

      <Link href={`/portal/pipeline/${risk.id}`} className="mt-4 flex min-h-[48px] items-center justify-center gap-2 rounded-[18px] bg-[color:var(--wp-text)] text-sm font-black text-white active:scale-[.98]">
        Otevřít detail <ArrowRight size={16} />
      </Link>
    </AccentCard>
  );
}

function MobileClientCareWidget({
  serviceRecommendations,
  kpis,
}: {
  serviceRecommendations: ServiceRecommendationWithContact[];
  kpis: DashboardKpis;
}) {
  const items = serviceRecommendations.slice(0, 3).map((r) => {
    const name = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ").trim() || "Klient";
    const cta = getServiceCtaHref(r, r.contactId);
    return { key: r.id, name, reason: r.title, href: cta.href, status: r.urgency === "overdue" ? "Po termínu" : "Servis" };
  });
  if (items.length === 0) {
    for (const c of kpis.serviceDueContacts.slice(0, 3)) {
      items.push({
        key: c.id,
        name: `${c.firstName} ${c.lastName}`.trim() || "Klient",
        reason: `Servis ${formatDisplayDateCs(c.nextServiceDue) ?? c.nextServiceDue}`,
        href: `/portal/contacts/${c.id}`,
        status: "Servis",
      });
    }
  }
  if (items.length === 0) {
    for (const c of kpis.upcomingAnniversaries.slice(0, 2)) {
      items.push({
        key: c.id,
        name: c.partnerName ?? c.contactName ?? "Klient",
        reason: `Výročí ${formatDisplayDateCs(c.anniversaryDate) ?? c.anniversaryDate}`,
        href: `/portal/contacts/${c.contactId}`,
        status: "Výročí",
      });
    }
  }

  return (
    <section>
      <MobileSectionHeader title="Péče o klienty" subtitle="Klienti, u kterých je potřeba udržet návaznost." />
      {items.length === 0 ? (
        <MobileCard className="p-5 text-center">
          <p className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">Žádná aktivní péče k zobrazení.</p>
        </MobileCard>
      ) : (
        <div className="space-y-3">
          {items.map((item) => (
            <Link key={item.key} href={item.href} className="flex min-h-[82px] items-center gap-3 rounded-[26px] border border-white/75 bg-white/84 p-3.5 shadow-[0_16px_34px_-28px_rgba(15,23,42,.3)] ring-1 ring-[color:var(--wp-surface-card-border)]/45 active:scale-[.99]">
              <span className="grid h-12 w-12 shrink-0 place-items-center rounded-[18px] bg-rose-50 text-rose-500 ring-1 ring-rose-100">
                <Users size={21} />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-[15px] font-black text-[color:var(--wp-text)]">{item.name}</span>
                <span className="mt-1 block truncate text-[12px] font-semibold text-[color:var(--wp-text-secondary)]">{item.reason}</span>
                <span className="mt-2 inline-flex rounded-full bg-rose-50 px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.08em] text-rose-600">{item.status}</span>
              </span>
              <span className="shrink-0 text-right text-[11px] font-black text-rose-600">
                Naplánovat<br />schůzku
              </span>
            </Link>
          ))}
        </div>
      )}
    </section>
  );
}

function MobileQuickActions({
  actionCallbacks,
}: {
  actionCallbacks: Record<string, () => void>;
}) {
  return (
    <section className="space-y-3">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-[12px] font-black uppercase tracking-[0.16em] text-[color:var(--wp-text-secondary)]">
            Rychlé akce
          </p>
          <p className="mt-1 text-[12px] font-semibold text-[color:var(--wp-text-secondary)]">
            Nejčastější kroky hned po otevření nástěnky.
          </p>
        </div>
      </div>
      <div className="grid grid-cols-4 gap-2.5">
        {QUICK_ACTIONS.slice(0, 4).map((qa, i) => {
          const cls =
            "flex min-h-[78px] flex-col items-center justify-center gap-2 rounded-[24px] border border-white/85 bg-white/90 px-2 text-center text-[10px] font-black text-[color:var(--wp-text-secondary)] shadow-[0_14px_30px_-26px_rgba(15,23,42,.26)] ring-1 ring-[color:var(--wp-surface-card-border)]/35 backdrop-blur-xl active:scale-95";
          const iconEl =
            "brandAi" in qa && qa.brandAi ? (
              <AiAssistantBrandIcon size={20} className="shrink-0" />
            ) : (
              (() => {
                const QIcon = (qa as Extract<QuickActionItem, { icon: LucideIcon }>).icon;
                return <QIcon size={20} className="shrink-0" />;
              })()
            );
          if (qa.href) {
            return (
              <Link key={i} href={qa.href} className={cls}>
                {iconEl}
                <span className="leading-tight">{qa.label}</span>
              </Link>
            );
          }
          return (
            <button
              key={i}
              type="button"
              onClick={() => "action" in qa && qa.action && actionCallbacks[qa.action]?.()}
              className={cls}
            >
              {iconEl}
              <span className="leading-tight">{qa.label}</span>
            </button>
          );
        })}
      </div>
    </section>
  );
}

/* ------------------------------------------------------------------ */
/*  Main DashboardScreen                                               */
/* ------------------------------------------------------------------ */

export interface DashboardScreenProps {
  kpis: DashboardKpis;
  advisorName: string;
  serviceRecommendations: ServiceRecommendationWithContact[];
  initialNotes: MeetingNoteForBoard[];
  initialAnalyses: FinancialAnalysisListItem[];
  deviceClass: DeviceClass;
  onNewTask: () => void;
  onNewClient: () => void;
  onNewOpportunity: () => void;
}

export function DashboardScreen({
  kpis,
  advisorName,
  serviceRecommendations,
  initialNotes,
  initialAnalyses,
  deviceClass,
  onNewTask,
  onNewClient,
  onNewOpportunity,
}: DashboardScreenProps) {
  const ai = useAIDashboardSummary();
  const pragueDate = new Date(`${kpis.pragueTodayYmd}T12:00:00`);
  const dateLabelRaw = new Intl.DateTimeFormat("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  }).format(pragueDate);
  const dateLabel = dateLabelRaw
    .split(/\s+/)
    .map((part) => part.toLocaleUpperCase("cs-CZ"))
    .join(" ");
  void deviceClass;
  const todayAgendaCount = kpis.todayEvents.length + kpis.tasksDueToday.length;
  const todayAgendaLabel =
    todayAgendaCount === 0
      ? ""
      : todayAgendaCount === 1
        ? "1 položka"
        : todayAgendaCount >= 2 && todayAgendaCount <= 4
          ? `${todayAgendaCount} položky`
          : `${todayAgendaCount} položek`;
  const actionCallbacks: Record<string, () => void> = {
    newTask: onNewTask,
    newClient: onNewClient,
    newOpportunity: onNewOpportunity,
  };

  const reviewHref = (id: string) => `/portal/contracts/review/${encodeURIComponent(id)}`;
  const priorityRows = buildPriorityRows(kpis, ai.summary, reviewHref);
  const reviewCount = ai.fetchError ? 0 : (ai.summary?.contractsWaitingForReview?.length ?? 0);
  const priorityCount = kpis.overdueTasks.length + reviewCount + todayAgendaCount;

  return (
      <div className="-mx-5 -mt-3 min-h-full w-[calc(100%+2.5rem)] min-w-0 space-y-7 overflow-x-hidden bg-white px-5 pb-7 pt-3">
        <section className="space-y-2 pt-2">
          <p className="text-xs font-black uppercase tracking-[0.16em] text-[color:var(--wp-text-secondary)]">{dateLabel}</p>
          <h1 className="text-[32px] font-black leading-tight tracking-tight text-[color:var(--wp-text)]">
            Dobrý den, {firstNameFromAdvisor(advisorName)}
          </h1>
        </section>

        <MobileQuickActions actionCallbacks={actionCallbacks} />

        <MobileDashboardHero
          dateLabel={dateLabelRaw}
          overdueCount={kpis.overdueTasks.length}
          reviewCount={reviewCount}
          agendaCount={todayAgendaCount}
          priorityCount={priorityCount}
        />

        <MobileDashboardAlert kpis={kpis} />

        <MobileClientCareWidget serviceRecommendations={serviceRecommendations} kpis={kpis} />

        <section className="space-y-4">
          <MobileSectionHeader
            title="Priority"
            subtitle="Interní práce podle CRM — ověřte detaily před sdělením klientovi."
            action={
              <Link href="/portal/tasks" className="text-[11px] font-black uppercase tracking-wide text-indigo-600">
                Úkoly →
              </Link>
            }
          />
          {priorityRows.length === 0 ? (
            <AccentCard tone="indigo" className="p-5 text-center">
              <p className="text-sm font-semibold text-[color:var(--wp-text-secondary)]">
                Žádné položky v prioritní frontě podle aktuálního CRM výřezu.
              </p>
              <Link href="/portal/tasks" className="mt-4 inline-flex min-h-[44px] items-center rounded-[16px] bg-[color:var(--wp-text)] px-5 text-xs font-black uppercase tracking-wide text-white">
                Otevřít úkoly
              </Link>
            </AccentCard>
          ) : (
            <div className="space-y-3">
              {priorityRows.slice(0, 6).map((row) => (
                <PriorityLinkRow
                  key={row.key}
                  href={row.href}
                  title={row.title}
                  description={row.description}
                  badge={row.badge}
                  icon={row.icon}
                />
              ))}
            </div>
          )}
        </section>

        <section className="space-y-4">
          <MobileSectionHeader title="Kontrola smluv" subtitle="Jen položky, které čekají na poradce. Bez technických hlášek." />
          <AiInsightsPanel summary={ai.summary} loading={ai.loading} fetchError={ai.fetchError} onRetry={ai.retry} />
        </section>

        <section className="space-y-4">
          <MobileSectionHeader title="Obchodní příležitosti" subtitle="Rizika a nejbližší obchodní krok podle CRM." />
          <AccentCard tone="indigo" className="p-4">
            <ActiveDealsWidget kpis={kpis} />
          </AccentCard>
        </section>

        <section className="space-y-4">
          <MobileSectionHeader title="Dnes v kalendáři" subtitle="Časové body, které ovlivní dnešní práci." />
          <TodayInCalendarWidget
            czPublicHolidayToday={kpis.czPublicHolidayToday}
            czNameDaysToday={kpis.czNameDaysToday}
            birthdaysToday={kpis.birthdaysToday}
            pragueTodayYmd={kpis.pragueTodayYmd}
          />
          <MobileCard className="border-indigo-100/80 bg-gradient-to-br from-white to-indigo-50/40 p-5">
            <p className="text-[17px] font-black text-[color:var(--wp-text)]">
              {todayAgendaCount === 0 ? "Dnes nic naplánováno" : `${todayAgendaLabel} v agendě`}
            </p>
            <p className="mt-1 text-[13px] font-semibold text-[color:var(--wp-text-secondary)]">
              Otevřete kalendář nebo dnešní úkoly.
            </p>
            <div className="mt-4 grid grid-cols-2 gap-2">
              <Link href="/portal/calendar" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[16px] bg-indigo-600 px-4 text-xs font-black uppercase tracking-wide text-white active:scale-[0.99]">
                <Calendar size={16} aria-hidden />
                Kalendář
              </Link>
              <Link href="/portal/tasks?filter=today" className="inline-flex min-h-[44px] items-center justify-center gap-2 rounded-[16px] border border-[color:var(--wp-surface-card-border)] bg-white px-4 text-xs font-bold text-[color:var(--wp-text-secondary)] active:scale-[0.99]">
                <CheckSquare size={16} aria-hidden />
                Úkoly dnes
              </Link>
            </div>
          </MobileCard>
        </section>

        <section className="space-y-4">
          <MobileSectionHeader
            title="Finanční analýzy"
            subtitle="Rozpracované výstupy a klientské podklady."
            action={
              <Link href="/portal/analyses" className="text-[11px] font-black uppercase tracking-wide text-indigo-600">
                Vše →
              </Link>
            }
          />
          <AccentCard tone="indigo" className="p-5">
            <FinancialAnalysesWidget analyses={initialAnalyses} />
          </AccentCard>
        </section>

        <section className="space-y-4">
          <MobileSectionHeader title="Zprávy a zápisky" subtitle="Komunikace a poslední interní poznámky." />
          <AccentCard tone="emerald" className="p-5">
            <MessagesWidget />
          </AccentCard>
          <AccentCard tone="amber" className="p-5">
            <NotesWidget notes={initialNotes} />
          </AccentCard>
        </section>
      </div>
  );
}
