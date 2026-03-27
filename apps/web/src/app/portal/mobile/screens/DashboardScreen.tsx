"use client";

import { useState, useEffect, type ReactNode } from "react";
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
  Target,
  TrendingUp,
  StickyNote,
  CheckCircle2,
  LayoutDashboard,
  type LucideIcon,
} from "lucide-react";
import { AiAssistantBrandIcon } from "@/app/components/AiAssistantBrandIcon";
import type { DashboardKpis } from "@/app/actions/dashboard";
import type { ServiceRecommendationWithContact } from "@/app/actions/service-engine";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import type { ProductionSummary } from "@/app/actions/production";
import type { BusinessPlanWidgetData } from "@/app/portal/today/DashboardEditable";
import { TodayInCalendarWidget } from "@/app/components/dashboard/TodayInCalendarWidget";
import { getServiceCtaHref } from "@/lib/service-engine/cta";
import { MobileCard, MobileSection, MetricCard } from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
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
  { icon: LayoutDashboard, label: "Board", href: "/portal/board" },
  { icon: Calculator, label: "Kalkulačky", href: "/portal/calculators" },
  { icon: PieChart, label: "Analýza", href: "/portal/analyses/financial" },
  { brandAi: true, label: "AI Smlouvy", href: "/portal/contracts/review" },
];

/* ------------------------------------------------------------------ */
/*  Shared widget card wrapper                                         */
/* ------------------------------------------------------------------ */

function WidgetCard({
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

function AiAssistantWidget() {
  const [summary, setSummary] = useState<{
    assistantSummaryText?: string;
    urgentItems?: Array<{ type: string; entityId: string; title: string }>;
  } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetch("/api/ai/dashboard-summary")
      .then((r) => (r.ok ? r.json() : null))
      .then((d) => setSummary(d))
      .catch(() => null)
      .finally(() => setLoading(false));
  }, []);

  return (
    <MobileCard className="overflow-hidden border-white/20 bg-gradient-to-br from-[#0a0f29] to-indigo-950 text-white">
      <div className="flex items-center gap-2 mb-3">
        <div className="w-8 h-8 rounded-lg bg-[color:var(--wp-surface-card)]/10 flex items-center justify-center p-1">
          <AiAssistantBrandIcon size={22} className="max-w-full max-h-full" />
        </div>
        <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200">AI Asistent</h3>
      </div>

      {loading ? (
        <div className="animate-pulse space-y-2 min-h-[72px]">
          <div className="h-4 bg-[color:var(--wp-surface-card)]/10 rounded w-3/4" />
          <div className="h-4 bg-[color:var(--wp-surface-card)]/10 rounded w-1/2" />
          <div className="h-4 bg-[color:var(--wp-surface-card)]/10 rounded w-5/6" />
        </div>
      ) : summary?.assistantSummaryText ? (
        <>
          <p className="text-sm font-semibold text-white/90 leading-relaxed mb-3">
            {summary.assistantSummaryText}
          </p>
          {(summary.urgentItems ?? []).slice(0, 3).map((u) => (
            <Link
              key={`${u.type}-${u.entityId}`}
              href={
                u.type === "review"
                  ? `/portal/contracts/review/${u.entityId}`
                  : u.type === "task"
                    ? "/portal/tasks"
                    : u.type === "client"
                      ? `/portal/contacts/${u.entityId}`
                      : "#"
              }
              className="flex items-center justify-between w-full px-3 py-2 mb-1.5 bg-[color:var(--wp-surface-card)]/10 rounded-xl text-sm text-white/80 border border-white/10"
            >
              <span className="truncate flex-1">{u.title}</span>
              <ArrowRight size={12} className="shrink-0 ml-2 text-indigo-300" />
            </Link>
          ))}
        </>
      ) : (
        <p className="text-sm text-indigo-200">Vaše denní doporučení se načítají…</p>
      )}

      <Link
        href="/portal/contracts/review"
        className="mt-3 flex items-center justify-center gap-2 w-full min-h-[44px] rounded-xl bg-indigo-600 text-white text-sm font-bold"
      >
        <AiAssistantBrandIcon size={16} /> AI Smlouvy <ArrowRight size={14} />
      </Link>
    </MobileCard>
  );
}

function TasksWidget({ kpis }: { kpis: DashboardKpis }) {
  const all = [...kpis.overdueTasks, ...(kpis.tasksDueToday ?? [])].slice(0, 5);
  const todayStr = new Date().toISOString().slice(0, 10);
  const isOverdue = (d: string) => d < todayStr;
  const timeLabel = (due: string) => {
    if (due < todayStr) return "Po termínu";
    if (due === todayStr) return "Dnes";
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    if (due === tomorrow.toISOString().slice(0, 10)) return "Zítra";
    return new Date(due).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
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
    <div className="space-y-2">
      {atRisk.map((o) => (
        <Link
          key={o.id}
          href={`/portal/pipeline/${o.id}`}
          className="block p-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 hover:bg-[color:var(--wp-surface-card)] transition-colors"
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
          className="block p-2.5 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]/50 hover:bg-[color:var(--wp-surface-card)] transition-colors"
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

function ProductionWidget({
  productionSummary,
  productionError,
}: {
  productionSummary: ProductionSummary | null;
  productionError: string | null;
}) {
  if (productionError) {
    return (
      <div className="text-center py-4">
        <p className="text-sm text-rose-600 mb-2">{productionError}</p>
        <Link href="/portal/production" className="text-xs font-bold text-indigo-600 hover:underline">
          Otevřít produkci →
        </Link>
      </div>
    );
  }
  if (!productionSummary) {
    return (
      <div className="animate-pulse space-y-3 py-2 min-h-[80px] flex flex-col justify-center">
        <div className="h-3 bg-[color:var(--wp-surface-card-border)] rounded w-2/3 mx-auto" />
        <div className="h-8 bg-[color:var(--wp-surface-card-border)] rounded-lg w-3/4 mx-auto" />
        <div className="h-3 bg-[color:var(--wp-surface-muted)] rounded w-1/2 mx-auto" />
      </div>
    );
  }
  if (productionSummary.totalCount === 0) {
    return (
      <div className="flex flex-col items-center text-center py-4">
        <div className="w-12 h-12 bg-[color:var(--wp-surface-muted)] rounded-xl flex items-center justify-center text-[color:var(--wp-text-tertiary)] mb-2 border border-[color:var(--wp-surface-card-border)]">
          <PieChart size={24} />
        </div>
        <p className="text-sm font-medium text-[color:var(--wp-text-secondary)]">Žádná produkce za tento měsíc.</p>
      </div>
    );
  }
  return (
    <div className="text-center py-2">
      <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] block mb-1">
        Produkce {productionSummary.periodLabel}
      </span>
      <div className="text-2xl font-black text-[color:var(--wp-text)]">
        {productionSummary.totalPremium.toLocaleString("cs-CZ")} Kč
      </div>
      <div className="text-xs font-bold text-[color:var(--wp-text-secondary)] mt-1">
        Roční: {productionSummary.totalAnnual.toLocaleString("cs-CZ")} Kč · {productionSummary.totalCount} smluv
      </div>
      <Link
        href="/portal/production"
        className="text-xs font-bold text-indigo-600 hover:underline mt-3 inline-flex items-center gap-1"
      >
        Detail <ChevronRight size={12} />
      </Link>
    </div>
  );
}

function BusinessPlanWidget({ data }: { data: BusinessPlanWidgetData | null }) {
  const HEALTH_LABELS: Record<string, string> = {
    achieved: "Splněno",
    exceeded: "Překročeno",
    on_track: "Podle plánu",
    slight_slip: "Mírný skluz",
    significant_slip: "Výrazný skluz",
    no_data: "—",
    not_applicable: "—",
  };
  const formatVal = (v: number, unit: string) =>
    unit === "czk" ? `${Math.round(v).toLocaleString("cs-CZ")} Kč` : String(Math.round(v));

  if (!data) {
    return (
      <div className="py-4">
        <p className="text-sm text-[color:var(--wp-text-secondary)] mb-2">Zatím nemáte nastavený business plán.</p>
        <Link
          href="/portal/business-plan"
          className="text-sm font-semibold text-indigo-600 hover:underline min-h-[44px] inline-flex items-center"
        >
          Nastavit plán →
        </Link>
      </div>
    );
  }

  return (
    <div className="py-1">
      <div className="flex items-center justify-between mb-3">
        <span className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)]">
          {data.periodLabel}
        </span>
        <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]">
          {HEALTH_LABELS[data.overallHealth] ?? data.overallHealth}
        </span>
      </div>
      <div className="space-y-2">
        {data.metrics.map((m) => (
          <div key={m.metricType} className="flex justify-between items-center text-sm">
            <span className="font-medium text-[color:var(--wp-text-secondary)] truncate">{m.label}</span>
            <span className="text-[color:var(--wp-text-secondary)] shrink-0 ml-2 text-xs">
              {formatVal(m.actual, m.unit)} / {formatVal(m.target, m.unit)}
            </span>
          </div>
        ))}
      </div>
      <Link
        href="/portal/business-plan"
        className="text-xs font-bold text-indigo-600 hover:underline mt-3 inline-flex items-center gap-1"
      >
        Otevřít plán <ChevronRight size={12} />
      </Link>
    </div>
  );
}

function ClientCareWidget({
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
              {new Date(c.anniversaryDate).toLocaleDateString("cs-CZ")}
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
  const formatAgo = (d: Date) => {
    const diff = Math.floor((Date.now() - new Date(d).getTime()) / 86400000);
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
      {notes.slice(0, 4).map((n) => (
        <div
          key={n.id}
          className="p-2.5 rounded-xl border border-amber-100 bg-amber-50/30"
        >
          <div className="flex justify-between items-start">
            <div className="min-w-0 flex-1">
              <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                {n.contactName || "Zápis"}
              </p>
              <p className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">
                {n.domain} · {new Date(n.meetingAt).toLocaleDateString("cs-CZ")}
              </p>
            </div>
            <StickyNote size={14} className="text-amber-400 shrink-0 mt-0.5" />
          </div>
        </div>
      ))}
    </div>
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
  productionSummary: ProductionSummary | null;
  productionError: string | null;
  businessPlanWidgetData: BusinessPlanWidgetData | null;
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
  productionSummary,
  productionError,
  businessPlanWidgetData,
  deviceClass,
  onNewTask,
  onNewClient,
  onNewOpportunity,
}: DashboardScreenProps) {
  const dateLabel = new Date().toLocaleDateString("cs-CZ", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });
  const isTablet = deviceClass === "tablet";
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

  return (
    <div className="space-y-4">
      <style>{`
        .dash-scroll-strip::-webkit-scrollbar { display: none; }
        .dash-scroll-strip { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      {/* Greeting */}
      <MobileSection>
        <h1 className="text-xl font-black text-[color:var(--wp-text)] tracking-tight">
          Dobrý den, {advisorName.split(" ")[0]} 👋
        </h1>
        <p className="text-xs text-[color:var(--wp-text-secondary)] font-medium mt-0.5 first-letter:uppercase">
          {dateLabel}
        </p>
      </MobileSection>

      <TodayInCalendarWidget
        czPublicHolidayToday={kpis.czPublicHolidayToday}
        czNameDaysToday={kpis.czNameDaysToday}
        birthdaysToday={kpis.birthdaysToday}
      />

      <MobileSection title="Dnes v kalendáři">
        <MobileCard className="border-indigo-100/80 bg-gradient-to-br from-white to-indigo-50/40">
          <p className="text-sm font-bold text-[color:var(--wp-text)]">
            {todayAgendaCount === 0 ? "Dnes nic naplánováno" : `${todayAgendaLabel} — schůzky a úkoly`}
          </p>
          <p className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">Otevřete kalendář nebo dnešní úkoly.</p>
          <div className="mt-3 flex flex-wrap gap-2">
            <Link
              href="/portal/calendar"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 text-xs font-black uppercase tracking-wide text-white active:scale-[0.99] sm:flex-none"
            >
              <Calendar size={16} aria-hidden />
              Kalendář
            </Link>
            <Link
              href="/portal/tasks?filter=today"
              className="inline-flex min-h-[44px] flex-1 items-center justify-center gap-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 text-xs font-bold text-[color:var(--wp-text-secondary)] active:scale-[0.99] sm:flex-none"
            >
              <CheckSquare size={16} aria-hidden />
              Úkoly dnes
            </Link>
          </div>
        </MobileCard>
      </MobileSection>

      {/* Quick Actions -- horizontal scroll, 8 pills */}
      <div className="dash-scroll-strip flex gap-2 overflow-x-auto pb-1 -mx-4 px-4">
        {QUICK_ACTIONS.map((qa, i) => {
          const cls =
            "flex items-center gap-1.5 px-3 py-2 bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl text-xs font-bold text-[color:var(--wp-text-secondary)] whitespace-nowrap shrink-0 min-h-[40px] active:scale-95 transition-transform";
          const iconEl =
            "brandAi" in qa && qa.brandAi ? (
              <AiAssistantBrandIcon size={14} className="opacity-70 shrink-0" />
            ) : (
              (() => {
                const QIcon = (qa as Extract<QuickActionItem, { icon: LucideIcon }>).icon;
                return <QIcon size={14} className="opacity-70" />;
              })()
            );
          if (qa.href) {
            return (
              <Link key={i} href={qa.href} className={cls}>
                {iconEl}
                {qa.label}
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
              {qa.label}
            </button>
          );
        })}
      </div>

      {/* KPI Cards */}
      <MobileSection title="Přehled">
        <div className={cx("grid gap-2", isTablet ? "grid-cols-4" : "grid-cols-2")}>
          <MetricCard label="Schůzky dnes" value={kpis.meetingsToday} />
          <MetricCard
            label="Otevřené úkoly"
            value={kpis.tasksOpen}
            tone={kpis.overdueTasks.length > 0 ? "warning" : "default"}
          />
          <MetricCard label="Otevřené případy" value={kpis.opportunitiesOpen} />
          <MetricCard label="Kontakty" value={kpis.totalContacts} />
        </div>
      </MobileSection>

      {/* Widget Grid — min-heights reduce layout shift as async widgets resolve */}
      <div className={cx("grid gap-3", isTablet ? "grid-cols-2" : "grid-cols-1")}>
        {/* AI Assistant -- spans full width on tablet */}
        <div className={cx("min-h-[140px]", isTablet ? "col-span-2" : "")}>
          <AiAssistantWidget />
        </div>

        <div className="min-h-[120px]">
          <WidgetCard
            icon={CheckSquare}
            title="Moje úkoly"
            href="/portal/tasks"
            iconColor="text-amber-500"
            borderColor="border-t-4 border-t-emerald-500"
          >
            <TasksWidget kpis={kpis} />
          </WidgetCard>
        </div>

        <div className="min-h-[120px]">
          <WidgetCard
            icon={Briefcase}
            title="Aktivní obchody"
            href="/portal/pipeline"
            iconColor="text-purple-500"
            borderColor="border-t-4 border-t-blue-500"
          >
            <ActiveDealsWidget kpis={kpis} />
          </WidgetCard>
        </div>

        <div className="min-h-[120px]">
          <WidgetCard
            icon={TrendingUp}
            title="Produkce"
            href="/portal/production"
            iconColor="text-indigo-400"
            borderColor="border-t-4 border-t-blue-500"
          >
            <ProductionWidget
              productionSummary={productionSummary}
              productionError={productionError}
            />
          </WidgetCard>
        </div>

        <div className="min-h-[120px]">
          <WidgetCard
            icon={Target}
            title="Plnění plánu"
            href="/portal/business-plan"
            iconColor="text-blue-500"
            borderColor="border-t-4 border-t-blue-500"
          >
            <BusinessPlanWidget data={businessPlanWidgetData} />
          </WidgetCard>
        </div>

        <div className="min-h-[120px]">
          <WidgetCard
            icon={AlertCircle}
            title="Péče o klienty"
            href="/portal/contacts"
            iconColor="text-violet-500"
            borderColor="border-t-4 border-t-violet-500"
          >
            <ClientCareWidget
              serviceRecommendations={serviceRecommendations}
              kpis={kpis}
            />
          </WidgetCard>
        </div>

        <div className="min-h-[120px]">
          <WidgetCard
            icon={FileText}
            title="Finanční analýzy"
            href="/portal/analyses"
            iconColor="text-blue-600"
            borderColor="border-t-4 border-t-[color:var(--wp-text-tertiary)]"
          >
            <FinancialAnalysesWidget analyses={initialAnalyses} />
          </WidgetCard>
        </div>

        <div className="min-h-[60px]">
          <WidgetCard
            icon={MessageSquare}
            title="Zprávy"
            href="/portal/messages"
            iconColor="text-emerald-500"
            borderColor="border-t-4 border-t-emerald-500"
          >
            <MessagesWidget />
          </WidgetCard>
        </div>

        {/* Notes -- spans full width on tablet */}
        <div className={cx("min-h-[120px]", isTablet ? "col-span-2" : "")}>
          <WidgetCard
            icon={StickyNote}
            title="Zápisky"
            href="/portal/notes"
            iconColor="text-amber-500"
            borderColor="border-t-4 border-t-[color:var(--wp-text-tertiary)]"
          >
            <NotesWidget notes={initialNotes} />
          </WidgetCard>
        </div>
      </div>
    </div>
  );
}
