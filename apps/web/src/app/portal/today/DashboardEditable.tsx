"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckSquare,
  Briefcase,
  Users,
  UserPlus,
  AlertCircle,
  Phone,
  ChevronRight,
  Clock,
  Plus,
  GripVertical,
  Mail,
  Calculator,
  FileText,
  LayoutDashboard,
  ArrowUp,
  ArrowDown,
  Check,
  CheckCircle2,
  PieChart,
  Settings2,
  X,
  ChevronLeft,
  type LucideIcon,
} from "lucide-react";
import type { DashboardKpis } from "@/app/actions/dashboard";
import type { ServiceRecommendationWithContact } from "@/app/actions/service-engine";
import { getServiceCtaHref } from "@/lib/service-engine/cta";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import type { ProductionSummary } from "@/app/actions/production";
import { CalendarWidget } from "@/app/components/calendar/CalendarWidget";
import { MessengerPreview } from "@/app/components/dashboard/MessengerPreview";
import { DashboardCard } from "@/app/components/dashboard/DashboardCard";
import { DashboardMiniNotes } from "./DashboardMiniNotes";
import { DashboardAiAssistant } from "./DashboardAiAssistant";
import {
  WIDGET_IDS,
  DEFAULT_DASHBOARD_ORDER,
  WIDGET_LABELS,
  WIDGET_ICONS,
  WIDGET_HREF,
  WIDGET_SECTION,
  WIDGET_COLOR_IDS,
  WIDGET_COLOR_GRADIENT,
  WIDGET_COL_SPAN,
  WIDGET_TOP_BORDER_BY_SECTION,
  WIDGET_TOP_BORDER_BY_COLOR,
  type WidgetId,
  type WidgetColorId,
} from "./dashboard-config";

const STORAGE_KEY = "weplan_dashboard_widgets";

interface DashboardConfig {
  order: WidgetId[];
  hidden: WidgetId[];
  widgetColors?: Partial<Record<WidgetId, WidgetColorId>>;
}

function loadConfig(): DashboardConfig {
  if (typeof window === "undefined") {
    return { order: [...DEFAULT_DASHBOARD_ORDER], hidden: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { order: [...DEFAULT_DASHBOARD_ORDER], hidden: [] };
    const parsed = JSON.parse(raw) as DashboardConfig;
    const order = Array.isArray(parsed.order) ? parsed.order.filter((id) => WIDGET_IDS.includes(id)) : [...DEFAULT_DASHBOARD_ORDER];
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => WIDGET_IDS.includes(id)) : [];
    const missingOrder = WIDGET_IDS.filter((id) => !order.includes(id));
    const widgetColors = parsed.widgetColors && typeof parsed.widgetColors === "object"
      ? (Object.fromEntries(Object.entries(parsed.widgetColors).filter(([k, v]) => WIDGET_IDS.includes(k as WidgetId) && WIDGET_COLOR_IDS.includes(v as WidgetColorId))) as Partial<Record<WidgetId, WidgetColorId>>)
      : undefined;
    return { order: [...order, ...missingOrder], hidden, widgetColors };
  } catch {
    return { order: [...DEFAULT_DASHBOARD_ORDER], hidden: [] };
  }
}

function saveConfig(config: DashboardConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch { /* noop */ }
}

const KPI_COLORS = {
  emerald: {
    text: "text-emerald-600",
    hoverText: "group-hover:text-emerald-600",
    hoverBorder: "hover:border-emerald-200",
    iconBg: "bg-emerald-50",
    iconBorder: "border-emerald-100",
    iconText: "text-emerald-500",
  },
  blue: {
    text: "text-blue-600",
    hoverText: "group-hover:text-blue-600",
    hoverBorder: "hover:border-blue-200",
    iconBg: "bg-blue-50",
    iconBorder: "border-blue-100",
    iconText: "text-blue-500",
  },
  purple: {
    text: "text-purple-600",
    hoverText: "group-hover:text-purple-600",
    hoverBorder: "hover:border-purple-200",
    iconBg: "bg-purple-50",
    iconBorder: "border-purple-100",
    iconText: "text-purple-500",
  },
} as const;

const KPI_CARDS_V4: {
  key: keyof Pick<DashboardKpis, "meetingsToday" | "tasksOpen" | "opportunitiesOpen">;
  label: string;
  href: string;
  color: keyof typeof KPI_COLORS;
  Icon: LucideIcon;
}[] = [
  { key: "meetingsToday", label: "Schůzky dnes", href: "/portal/calendar", color: "emerald", Icon: Calendar },
  { key: "tasksOpen", label: "Úkoly ke splnění", href: "/portal/tasks", color: "blue", Icon: CheckSquare },
  { key: "opportunitiesOpen", label: "Otevřené případy", href: "/portal/pipeline", color: "purple", Icon: Briefcase },
];

const WIDGET_ICON_COLORS: Partial<Record<WidgetId, string>> = {
  myTasks: "text-amber-500",
  messages: "text-emerald-500",
  activeDeals: "text-purple-500",
  production: "text-indigo-400",
  businessPlan: "text-blue-500",
  clientCare: "text-violet-500",
  financialAnalyses: "text-blue-600",
};

export type BusinessPlanWidgetData = {
  periodLabel: string;
  overallHealth: string;
  metrics: { metricType: string; label: string; actual: number; target: number; health: string; unit: string }[];
};

export function DashboardEditable({
  kpis,
  serviceRecommendations = [],
  initialNotes = [],
  advisorName = null,
  initialAnalyses = [],
  productionSummary = null,
  productionError = null,
  businessPlanWidgetData = null,
}: {
  kpis: DashboardKpis;
  serviceRecommendations?: ServiceRecommendationWithContact[];
  initialNotes?: MeetingNoteForBoard[];
  advisorName?: string | null;
  initialAnalyses?: FinancialAnalysisListItem[];
  productionSummary?: ProductionSummary | null;
  productionError?: string | null;
  businessPlanWidgetData?: BusinessPlanWidgetData | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<DashboardConfig>({ order: [...DEFAULT_DASHBOARD_ORDER], hidden: [] });
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<WidgetId[]>([]);
  const [editHidden, setEditHidden] = useState<Set<WidgetId>>(new Set());
  const [editWidgetColors, setEditWidgetColors] = useState<Partial<Record<WidgetId, WidgetColorId>>>({});

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const openCustomize = useCallback(() => {
    setEditOrder([...config.order]);
    setEditHidden(new Set(config.hidden));
    setEditWidgetColors(config.widgetColors ? { ...config.widgetColors } : {});
    setCustomizeOpen(true);
  }, [config]);

  const saveCustomize = useCallback(() => {
    const newConfig: DashboardConfig = {
      order: editOrder,
      hidden: Array.from(editHidden),
      widgetColors: Object.keys(editWidgetColors).length ? editWidgetColors : undefined,
    };
    setConfig(newConfig);
    saveConfig(newConfig);
    setCustomizeOpen(false);
  }, [editOrder, editHidden, editWidgetColors]);

  const moveUp = (id: WidgetId) => {
    const i = editOrder.indexOf(id);
    if (i <= 0) return;
    const next = [...editOrder];
    [next[i - 1], next[i]] = [next[i], next[i - 1]];
    setEditOrder(next);
  };

  const moveDown = (id: WidgetId) => {
    const i = editOrder.indexOf(id);
    if (i < 0 || i >= editOrder.length - 1) return;
    const next = [...editOrder];
    [next[i], next[i + 1]] = [next[i + 1], next[i]];
    setEditOrder(next);
  };

  const toggleVisible = (id: WidgetId) => {
    setEditHidden((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const setWidgetColor = (id: WidgetId, color: WidgetColorId | null) => {
    setEditWidgetColors((prev) => {
      const next = { ...prev };
      if (color === null) {
        delete next[id];
      } else {
        next[id] = color;
      }
      return next;
    });
  };

  const visibleOrder = config.order.filter((id) => !config.hidden.includes(id));

  const [draggedWidgetId, setDraggedWidgetId] = useState<WidgetId | null>(null);

  const handleDragStart = useCallback((e: React.DragEvent, id: WidgetId) => {
    e.dataTransfer.effectAllowed = "move";
    e.dataTransfer.setData("text/plain", id);
    e.dataTransfer.setData("application/x-widget-id", id);
    setDraggedWidgetId(id);
  }, []);

  const handleDragEnd = useCallback(() => {
    setDraggedWidgetId(null);
  }, []);

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent, overId: WidgetId) => {
      e.preventDefault();
      const draggedId = e.dataTransfer.getData("application/x-widget-id") as WidgetId | "";
      setDraggedWidgetId(null);
      if (!draggedId || !WIDGET_IDS.includes(draggedId) || draggedId === overId) return;
      const order = [...config.order];
      const from = order.indexOf(draggedId);
      const to = order.indexOf(overId);
      if (from === -1 || to === -1) return;
      order.splice(from, 1);
      order.splice(to, 0, draggedId);
      const newConfig: DashboardConfig = { ...config, order };
      setConfig(newConfig);
      saveConfig(newConfig);
    },
    [config],
  );

  const renderWidgetContent = (id: WidgetId) => {
    switch (id) {
      case "aiAssistant":
        return <DashboardAiAssistant />;
      case "myTasks": {
        const all = [...kpis.overdueTasks, ...(kpis.tasksDueToday ?? [])].slice(0, 7);
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
        return all.length === 0 ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-16 h-16 bg-white rounded-full flex items-center justify-center shadow-sm border border-amber-100 mb-4 text-emerald-500">
              <CheckCircle2 size={32} />
            </div>
            <p className="font-bold text-emerald-600 mb-1">Vše splněno!</p>
            <p className="text-sm font-medium text-amber-800/60 mb-6">Máte čistý stůl. Užijte si kávu nebo přidejte nový úkol.</p>
          </div>
        ) : (
          <div className="flex flex-col flex-1">
            <div className="space-y-3 flex-1">
              {all.map((t) => (
                <Link
                  key={t.id}
                  href={`/portal/tasks${isOverdue(t.dueDate) ? "?filter=overdue" : "?filter=today"}`}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-white/60 transition-colors border border-transparent hover:border-amber-200 group no-underline text-inherit"
                >
                  <span className="mt-0.5 w-5 h-5 rounded-md border-2 border-amber-300 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 leading-tight mb-1 group-hover:text-indigo-600 transition-colors truncate">{t.title}</p>
                    <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isOverdue(t.dueDate) ? "text-rose-500" : "text-amber-500"}`}>
                      <Clock size={10} /> {timeLabel(t.dueDate)}
                      {t.contactName && <span className="normal-case font-semibold text-slate-500 truncate"> · {t.contactName}</span>}
                    </span>
                  </div>
                </Link>
              ))}
            </div>
          </div>
        );
      }
      case "messages":
        return <MessengerPreview embedded />;
      case "activeDeals": {
        const atRisk = kpis.pipelineAtRisk.slice(0, 3);
        const step34 = (kpis.opportunitiesInStep3And4 ?? []).slice(0, 4);
        const show = atRisk.length > 0 || step34.length > 0;
        return !show ? (
          <div className="flex-1 flex flex-col items-center justify-center text-center">
            <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 mb-3 border border-slate-100">
              <Clock size={24} />
            </div>
            <p className="text-sm font-medium text-slate-500 mb-4">Žádné aktivní obchody.</p>
          </div>
        ) : (
          <div className="flex flex-col h-full">
            <div className="space-y-3 flex-1">
              {atRisk.map((o) => (
                <Link key={o.id} href={`/portal/pipeline/${o.id}`} className="block p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-orange-600 bg-orange-50 px-2 py-0.5 rounded">Ohrožení</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-800">{o.title}</h4>
                  <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1"><Users size={12} /> {o.contactName ?? "—"}</p>
                </Link>
              ))}
              {step34.map((o) => (
                <Link key={o.id} href={`/portal/pipeline/${o.id}`} className="block p-3 rounded-xl border border-slate-100 bg-slate-50/50 hover:bg-white hover:shadow-sm transition-all group">
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-[10px] font-black uppercase tracking-widest text-indigo-600 bg-indigo-50 px-2 py-0.5 rounded">{o.stageName}</span>
                  </div>
                  <h4 className="font-bold text-sm text-slate-800">{o.title}</h4>
                  <p className="text-xs font-medium text-slate-500 mt-0.5 flex items-center gap-1"><Users size={12} /> {o.contactName ?? "—"}</p>
                </Link>
              ))}
            </div>
          </div>
        );
      }
      case "production": {
        const totalPremium = productionSummary?.totalPremium ?? 0;
        const totalAnnual = productionSummary?.totalAnnual ?? 0;
        const totalCount = productionSummary?.totalCount ?? 0;
        const periodLabel = productionSummary?.periodLabel ?? "";
        const target: number | null = null;
        const pct = target && target > 0 ? Math.round((totalPremium / target) * 100) : 0;
        if (productionError) {
          return (
            <div className="flex flex-col h-full justify-center items-center text-center">
              <p className="text-sm text-rose-600 mb-2">{productionError}</p>
              <Link href="/portal/production" className="text-xs font-bold text-indigo-600 hover:underline">
                Otevřít produkci →
              </Link>
            </div>
          );
        }
        if (productionSummary === null) {
          return (
            <div className="flex flex-col h-full justify-center">
              <div className="animate-pulse space-y-4">
                <div className="h-8 bg-slate-200 rounded w-3/4 mx-auto" />
                <div className="h-10 bg-slate-100 rounded w-1/2 mx-auto" />
                <div className="h-3 bg-slate-100 rounded-full" />
              </div>
            </div>
          );
        }
        if (totalCount === 0) {
          return (
            <div className="flex-1 flex flex-col items-center justify-center text-center">
              <div className="w-12 h-12 bg-slate-50 rounded-xl flex items-center justify-center text-slate-300 mb-3 border border-slate-100">
                <PieChart size={24} />
              </div>
              <p className="text-sm font-medium text-slate-500 mb-4">Žádná produkce za tento měsíc.</p>
            </div>
          );
        }
        return (
          <div className="flex flex-col h-full justify-center">
            <div className="text-center mb-6">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">
                Produkce {periodLabel}
              </span>
              <div className="text-3xl font-black text-slate-900">{totalPremium.toLocaleString("cs-CZ")} Kč</div>
              <div className="text-xs font-bold text-slate-500 mt-1">
                Roční ekvivalent: {totalAnnual.toLocaleString("cs-CZ")} Kč · {totalCount} smluv
              </div>
              {target != null && target > 0 && (
                <div className="text-xs font-bold text-slate-500 mt-0.5">Cíl: {Number(target).toLocaleString("cs-CZ")} Kč</div>
              )}
            </div>
            {target != null && target > 0 && (
              <>
                <div className="mb-2 flex justify-between text-xs font-bold">
                  <span className="text-indigo-600">{pct}% splněno</span>
                </div>
                <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden flex shadow-inner">
                  <div className="h-full bg-indigo-500 border-r border-white/20 transition-all" style={{ width: `${Math.min(pct, 100)}%` }} />
                </div>
              </>
            )}
          </div>
        );
      }
      case "businessPlan": {
        const data = businessPlanWidgetData;
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
            <div className="flex flex-col h-full justify-center">
              <p className="text-sm py-3 text-slate-500 mb-2">Zatím nemáš nastavený business plán.</p>
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
          <div className="flex flex-col h-full justify-center">
            <div className="mb-3 flex items-center justify-between">
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                {data.periodLabel}
              </span>
              <span className="text-[10px] font-bold px-2 py-0.5 rounded bg-slate-100 text-slate-600">
                {HEALTH_LABELS[data.overallHealth] ?? data.overallHealth}
              </span>
            </div>
            <div className="space-y-2 mb-4">
              {data.metrics.map((m) => (
                <div key={m.metricType} className="flex justify-between items-center text-sm">
                  <span className="font-medium text-slate-700 truncate">{m.label}</span>
                  <span className="text-slate-600 shrink-0 ml-2">
                    {formatVal(m.actual, m.unit)} / {formatVal(m.target, m.unit)}
                  </span>
                </div>
              ))}
            </div>
            <Link
              href="/portal/business-plan"
              className="text-xs font-semibold text-indigo-600 hover:underline min-h-[44px] inline-flex items-center"
            >
              Otevřít business plán →
            </Link>
          </div>
        );
      }
      case "clientCare": {
        const recs = serviceRecommendations.slice(0, 5);
        const service = kpis.serviceDueContacts.slice(0, 3);
        const ann = kpis.upcomingAnniversaries.slice(0, 3);
        const hasRecs = recs.length > 0;
        const hasLegacy = service.length > 0 || ann.length > 0;
        const hasAny = hasRecs || hasLegacy;
        if (!hasAny) {
          return <p className="text-sm py-3 text-slate-500">Žádná péče k zobrazení.</p>;
        }
        if (hasRecs) {
          return (
            <div className="flex flex-col h-full overflow-hidden">
              <div className="space-y-3 flex-1 overflow-y-auto">
                {recs.map((r) => {
                  const cta = getServiceCtaHref(r, r.contactId);
                  const name = [r.contactFirstName, r.contactLastName].filter(Boolean).join(" ") || "Klient";
                  const isRecOverdue = r.urgency === "overdue";
                  return (
                    <div
                      key={r.id}
                      className={`flex flex-col sm:flex-row sm:items-center justify-between gap-2 p-3 rounded-xl border min-h-[44px] ${
                        isRecOverdue ? "bg-red-50/50 border-red-100/50" : "bg-amber-50/30 border-amber-100/50"
                      }`}
                    >
                      <div className="min-w-0">
                        <h4 className="font-bold text-sm text-slate-800">{name}</h4>
                        <p className="text-xs font-bold text-slate-600 mt-0.5 truncate">{r.title}</p>
                        {r.dueDate && (
                          <p className="text-xs text-slate-500 mt-0.5">
                            {new Date(r.dueDate).toLocaleDateString("cs-CZ")}
                          </p>
                        )}
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <Link
                          href={cta.href}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center gap-1 px-3 py-2 rounded-lg bg-white text-slate-700 border border-slate-200 text-sm font-semibold hover:bg-indigo-50 hover:border-indigo-200 transition-colors"
                        >
                          {cta.label}
                        </Link>
                        <Link
                          href={`/portal/contacts/${r.contactId}`}
                          className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center p-2 bg-white text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg shadow-sm transition-colors"
                          aria-label="Otevřít klienta"
                        >
                          <ChevronRight size={16} />
                        </Link>
                      </div>
                    </div>
                  );
                })}
              </div>
              <Link
                href="/portal/today"
                className="text-xs font-semibold text-indigo-600 hover:underline mt-2 inline-block"
              >
                Servisní přehled
              </Link>
            </div>
          );
        }
        return (
          <div className="flex flex-col h-full">
            <div className="space-y-3 flex-1">
              {service.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50/30 border border-amber-100/50 min-h-[44px]">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{c.firstName} {c.lastName}</h4>
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5"><AlertCircle size={12} /> Servis · {new Date(c.nextServiceDue).toLocaleDateString("cs-CZ")}</p>
                  </div>
                  <Link href={`/portal/contacts/${c.id}`} className="p-2 bg-white text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg shadow-sm transition-colors shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center" aria-label="Otevřít kontakt"><Phone size={14} /></Link>
                </div>
              ))}
              {ann.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50/30 border border-amber-100/50 min-h-[44px]">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{c.partnerName ?? "—"}</h4>
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5"><AlertCircle size={12} /> Výročí · {c.contactName} · {new Date(c.anniversaryDate).toLocaleDateString("cs-CZ")}</p>
                  </div>
                  <Link href={`/portal/contacts/${c.contactId}`} className="p-2 bg-white text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg shadow-sm transition-colors shrink-0 min-h-[44px] min-w-[44px] inline-flex items-center justify-center" aria-label="Otevřít kontakt"><Phone size={14} /></Link>
                </div>
              ))}
            </div>
          </div>
        );
      }
      case "financialAnalyses": {
        const formatAgo = (d: Date) => {
          const diff = Math.floor((Date.now() - d.getTime()) / 86400000);
          if (diff === 0) return "Dnes";
          if (diff === 1) return "Včera";
          if (diff < 7) return `Před ${diff} dny`;
          return new Date(d).toLocaleDateString("cs-CZ", { day: "numeric", month: "short" });
        };
        return initialAnalyses.length === 0 ? (
          <p className="text-sm py-3 text-slate-500">Žádné finanční analýzy.</p>
        ) : (
          <div className="space-y-3 flex-1">
            {initialAnalyses.slice(0, 3).map((a) => (
              <Link
                key={a.id}
                href={`/portal/analyses/financial?id=${encodeURIComponent(a.id)}`}
                className="block p-4 rounded-xl border border-slate-200 hover:border-indigo-300 hover:shadow-md transition-all bg-gradient-to-br from-white to-slate-50 group"
              >
                <div className="flex justify-between items-start mb-2">
                  <span className="p-1.5 bg-blue-50 text-blue-600 rounded-lg"><FileText size={16} /></span>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">{formatAgo(new Date(a.updatedAt))}</span>
                </div>
                <h4 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors">Analýza</h4>
                <p className="text-xs font-medium text-slate-500 mt-1">{a.clientName ?? "—"}</p>
                <div className="mt-4 pt-3 border-t border-slate-100 flex justify-between items-center">
                  <span className="text-[10px] font-bold text-amber-600 bg-amber-50 px-2 py-0.5 rounded">{a.status === "completed" ? "Dokončeno" : a.status === "draft" ? "Rozpracováno" : a.status}</span>
                  <ChevronRight size={14} className="text-slate-300 group-hover:text-indigo-600 transition-colors" />
                </div>
              </Link>
            ))}
          </div>
        );
      }
      case "notes":
        return <DashboardMiniNotes initialNotes={initialNotes} />;
      default:
        return null;
    }
  };

  const greetingName = advisorName?.trim() || "poradce";
  const dateLabel = new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex-1 min-h-0 bg-[#f8fafc] text-slate-800 relative overflow-y-auto animate-[wp-fade-in_0.3s_ease]">
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Plus+Jakarta+Sans:wght@500;700;800;900&display=swap');
        .font-display { font-family: 'Plus Jakarta Sans', sans-serif; }
        .bg-dot-grid {
          background-image: radial-gradient(#cbd5e1 1px, transparent 0);
          background-size: 32px 32px;
        }
        .hide-scrollbar::-webkit-scrollbar { display: none; }
        .hide-scrollbar { -ms-overflow-style: none; scrollbar-width: none; }
        @keyframes slideInRight {
          from { transform: translateX(100%); }
          to { transform: translateX(0); }
        }
        .animate-slide-in-right { animation: slideInRight 0.25s ease-out; }
      `}</style>

      <main className="max-w-[1400px] mx-auto p-4 sm:p-6 md:p-8 bg-dot-grid min-h-[calc(100vh-73px)]">

        {/* 1. GREETING + TOP CONTROLS */}
        <div className="mb-10">
          <div className="flex flex-wrap items-start justify-between gap-4 mb-2">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight font-display">
              Dobrý den, {greetingName} 👋
            </h1>
            <div className="flex items-center gap-3">
              <button
                type="button"
                onClick={() => setDrawerOpen((v) => !v)}
                className="text-sm font-bold text-slate-600 hover:text-slate-800 bg-white border border-slate-200 px-4 py-2 rounded-xl transition-colors flex items-center gap-2 shadow-sm min-h-[44px]"
              >
                <Calendar size={16} /> {drawerOpen ? "Skrýt kalendář" : "Kalendář"}
              </button>
              <button
                type="button"
                onClick={openCustomize}
                className="text-sm font-bold text-indigo-600 hover:text-indigo-800 bg-indigo-50 px-4 py-2 rounded-xl transition-colors flex items-center gap-2 min-h-[44px]"
              >
                <Settings2 size={16} /> Upravit nástěnku
              </button>
            </div>
          </div>
          <p className="text-sm font-medium text-slate-500 mb-8">Dnes je {dateLabel}. Zde je váš přehled.</p>

          <div className="flex flex-wrap items-center gap-3">
            {([
              { icon: UserPlus, label: "Nový klient", href: "/portal/contacts?newClient=1" },
              { icon: Calendar, label: "Nová schůzka", href: "/portal/calendar?new=1" },
              { icon: CheckSquare, label: "Nový úkol", href: "/portal/tasks" },
              { icon: Mail, label: "Napsat zprávu", href: "/portal/messages" },
              { icon: Calculator, label: "Kalkulačky", href: "/portal/calculators" },
              { icon: PieChart, label: "Finanční analýza", href: "/portal/analyses/financial" },
              { icon: Calendar, label: "Kalendář", href: "/portal/calendar" },
            ] as { icon: LucideIcon; label: string; href: string }[]).map((btn, i) => (
              <Link
                key={i}
                href={btn.href}
                className="flex items-center gap-2 px-4 py-2.5 bg-white border border-slate-200 text-slate-600 rounded-xl text-xs font-bold hover:bg-slate-50 hover:border-indigo-200 hover:text-indigo-600 transition-all shadow-sm min-h-[44px]"
              >
                <btn.icon size={16} className="opacity-70" />
                {btn.label}
              </Link>
            ))}
          </div>
        </div>

        {/* 2. KPI CARDS */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-8">
          {KPI_CARDS_V4.map((card) => {
            const c = KPI_COLORS[card.color];
            const Icon = card.Icon;
            return (
              <Link
                key={card.key}
                href={card.href}
                className={`bg-white rounded-[24px] p-6 border border-slate-100 flex items-center justify-between group ${c.hoverBorder} hover:-translate-y-0.5 transition-all cursor-pointer no-underline`}
              >
                <div>
                  <div className={`flex items-center gap-2 mb-2 ${c.text}`}>
                    <Icon size={16} />
                    <span className="text-[10px] font-black uppercase tracking-widest">{card.label}</span>
                  </div>
                  <div className={`text-4xl font-display font-black text-slate-900 leading-none ${c.hoverText} transition-colors tabular-nums`}>
                    {kpis[card.key]}
                  </div>
                </div>
                <div className={`w-12 h-12 rounded-2xl ${c.iconBg} border ${c.iconBorder} flex items-center justify-center ${c.iconText}`}>
                  <Icon size={24} />
                </div>
              </Link>
            );
          })}
        </div>

        {/* 3. BENTO WIDGET GRID */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-12 gap-6 pb-8">
          {visibleOrder.map((id) => {
            const isAiAssistant = id === "aiAssistant";
            const isMyTasks = id === "myTasks";
            const isNotes = id === "notes";
            const colSpan = `${WIDGET_COL_SPAN[id]}${isAiAssistant || isNotes ? " md:col-span-2" : ""}`;
            const dragClass = `${draggedWidgetId === id ? "opacity-60 scale-[0.98]" : ""} ${draggedWidgetId && draggedWidgetId !== id ? "border-dashed border-indigo-200" : ""}`;

            if (isAiAssistant) {
              return (
                <div
                  key={id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, id)}
                  className={`${colSpan} ${dragClass} transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01]`}
                >
                  <div className="relative">
                    <span
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, id); }}
                      onDragEnd={handleDragEnd}
                      className="absolute top-4 right-4 z-10 p-2 min-h-[44px] min-w-[44px] rounded-lg bg-white/10 hover:bg-white/20 cursor-grab active:cursor-grabbing transition-colors shrink-0 inline-flex items-center justify-center"
                      aria-label="Chytit a přesunout widget"
                    >
                      <GripVertical size={16} className="text-indigo-200" />
                    </span>
                    <DashboardAiAssistant />
                  </div>
                </div>
              );
            }

            if (isMyTasks) {
              const body = renderWidgetContent(id);
              return (
                <div
                  key={id}
                  onDragOver={handleDragOver}
                  onDrop={(e) => handleDrop(e, id)}
                  className={`${colSpan} ${dragClass} transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01]`}
                >
                  <div className="bg-white rounded-[32px] border border-slate-100 border-t-4 border-t-amber-500 p-6 sm:p-8 relative flex flex-col min-h-[280px]">
                    <div className="flex items-center justify-between mb-6">
                      <h3 className="font-bold text-amber-900 flex items-center gap-2">
                        <CheckSquare size={18} className="text-amber-500" /> Moje úkoly
                      </h3>
                      <div className="flex items-center gap-1">
                        <Link href="/portal/tasks" className="p-2 text-amber-400 hover:text-amber-600 transition-colors min-h-[44px] min-w-[44px] inline-flex items-center justify-center">
                          <Plus size={20} />
                        </Link>
                        <span
                          draggable
                          onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, id); }}
                          onDragEnd={handleDragEnd}
                          className="p-2 min-h-[44px] min-w-[44px] text-amber-300 hover:text-amber-500 cursor-grab active:cursor-grabbing rounded transition-colors inline-flex items-center justify-center"
                          aria-label="Chytit a přesunout widget"
                        >
                          <GripVertical size={16} />
                        </span>
                      </div>
                    </div>
                    {body}
                    <Link
                      href="/portal/tasks"
                      className="mt-auto pt-4 inline-flex items-center gap-1.5 px-4 py-2.5 rounded-xl border border-amber-200 bg-amber-50 text-amber-700 font-bold text-xs uppercase tracking-widest hover:bg-amber-100 hover:border-amber-300 transition-colors min-h-[44px] w-fit"
                    >
                      Zobrazit všechny úkoly <ChevronRight size={14} />
                    </Link>
                  </div>
                </div>
              );
            }

            const body = renderWidgetContent(id);
            const WidgetIconComponent = WIDGET_ICONS[id];
            const footerLink = WIDGET_HREF[id];
            const footerLabel = id === "production" ? "Otevřít produkci" : id === "activeDeals" ? "Otevřít Board" : id === "clientCare" ? "Servisní přehled" : id === "financialAnalyses" ? "Všechny analýzy" : id === "businessPlan" ? "Otevřít business plán" : "Více";
            const topBorderClass = config.widgetColors?.[id]
              ? WIDGET_TOP_BORDER_BY_COLOR[config.widgetColors[id]!]
              : WIDGET_TOP_BORDER_BY_SECTION[WIDGET_SECTION[id]];

            return (
              <div
                key={id}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, id)}
                className={`${colSpan} ${dragClass} transition-all duration-200 hover:-translate-y-0.5 hover:scale-[1.01]`}
              >
                <DashboardCard
                  title={WIDGET_LABELS[id]}
                  icon={WidgetIconComponent}
                  footerLink={footerLink}
                  footerLabel={footerLabel}
                  backgroundClass="bg-white"
                  topBorderClass={topBorderClass}
                  iconColorClass={WIDGET_ICON_COLORS[id]}
                  rightElement={
                    <span
                      draggable
                      onDragStart={(e) => { e.stopPropagation(); handleDragStart(e, id); }}
                      onDragEnd={handleDragEnd}
                      className="p-2 min-h-[44px] min-w-[44px] text-slate-200 hover:text-slate-400 cursor-grab active:cursor-grabbing rounded transition-colors shrink-0 inline-flex items-center justify-center"
                      aria-label="Chytit a přesunout widget"
                    >
                      <GripVertical size={16} />
                    </span>
                  }
                >
                  {body}
                </DashboardCard>
              </div>
            );
          })}
        </div>

      </main>

      {/* Right-side panel: narrow strip (icon + arrow) when closed, expands to calendar + messages when open. No overlay, no blur. */}
      <aside
        className="fixed right-0 top-[73px] bottom-0 z-20 flex flex-col bg-white border-l border-slate-200 transition-[width] duration-200 ease-out overflow-hidden"
        style={{ width: drawerOpen ? 380 : 56 }}
      >
        <button
          type="button"
          onClick={() => setDrawerOpen((v) => !v)}
          className="flex items-center justify-center gap-1 w-14 h-14 shrink-0 border-b border-slate-100 text-slate-600 hover:text-indigo-600 hover:bg-indigo-50/50 transition-colors min-h-[56px]"
          aria-label={drawerOpen ? "Skrýt kalendář" : "Zobrazit kalendář"}
        >
          <Calendar size={20} />
          {drawerOpen ? <ChevronLeft size={18} className="ml-0.5" /> : <ChevronRight size={18} className="ml-0.5" />}
        </button>
        {drawerOpen && (
          <>
            <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-5 hide-scrollbar">
              <section className="space-y-3">
                <h3 className="text-xs font-bold text-slate-500 uppercase tracking-wider">Kalendář</h3>
                <CalendarWidget hideTitle onNewActivity={() => router.push("/portal/calendar?new=1")} />
              </section>
              <section className="pt-4 border-t border-slate-100">
                <MessengerPreview />
              </section>
            </div>
            <div className="border-t border-slate-200 p-4 flex-shrink-0">
              <button
                type="button"
                onClick={() => router.push("/portal/calendar?new=1")}
                className="w-full min-h-[48px] py-3 px-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-xl font-bold text-sm flex items-center justify-center gap-2 transition-colors active:scale-[0.98]"
              >
                <Plus size={18} /> Nová aktivita
              </button>
            </div>
          </>
        )}
      </aside>

      {/* Customize modal */}
      {customizeOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
          onClick={() => setCustomizeOpen(false)}
          role="dialog"
          aria-modal="true"
          aria-labelledby="dashboard-customize-title"
        >
          <style>{`
            .dashboard-edit-custom-check {
              appearance: none;
              width: 22px;
              height: 22px;
              border: 2px solid #cbd5e1;
              border-radius: 6px;
              background-color: white;
              cursor: pointer;
              position: relative;
              transition: all 0.2s ease;
              box-shadow: inset 0 2px 4px 0 rgba(0,0,0,0.02);
            }
            .dashboard-edit-custom-check:checked {
              background-color: #4f46e5;
              border-color: #4f46e5;
              box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3);
            }
            .dashboard-edit-custom-check:checked::after {
              content: '';
              position: absolute;
              left: 6px;
              top: 2px;
              width: 6px;
              height: 12px;
              border: solid white;
              border-width: 0 2.5px 2.5px 0;
              transform: rotate(45deg);
            }
            .dashboard-edit-scroll::-webkit-scrollbar { display: none; }
            .dashboard-edit-scroll { -ms-overflow-style: none; scrollbar-width: none; }
          `}</style>
          <div
            className="w-full max-w-[800px] bg-white rounded-[32px] shadow-2xl shadow-indigo-900/10 border border-slate-100 overflow-hidden relative"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="absolute top-0 left-0 w-[500px] h-[500px] bg-gradient-to-br from-indigo-400/20 to-purple-400/20 rounded-full blur-[80px] pointer-events-none -translate-x-1/2 -translate-y-1/2" aria-hidden />
            <div className="px-10 py-8 border-b border-slate-50 relative z-10">
              <div className="flex items-center gap-4 mb-2">
                <div className="w-12 h-12 rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 text-white flex items-center justify-center shadow-lg shadow-indigo-200">
                  <LayoutDashboard size={24} />
                </div>
                <h2 id="dashboard-customize-title" className="text-2xl font-black text-slate-900 tracking-tight">Upravit nástěnku</h2>
              </div>
              <p className="text-sm font-medium text-slate-500 pl-16">
                Zaškrtněte viditelné widgety, zvolte barvu a použijte šipky pro pořadí.
              </p>
            </div>
            <div className="p-6 md:p-10 space-y-2 relative z-10 max-h-[55vh] overflow-y-auto dashboard-edit-scroll">
              {editOrder.map((id, index) => {
                const defaultSection = WIDGET_SECTION[id];
                const sectionColorId: WidgetColorId = defaultSection === "A" ? "emerald" : defaultSection === "B" ? "blue" : defaultSection === "C" ? "violet" : "slate";
                const currentColor = editWidgetColors[id] ?? sectionColorId;
                const isVisible = !editHidden.has(id);
                return (
                  <div
                    key={id}
                    className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-2xl transition-all duration-300 group ${
                      isVisible
                        ? "bg-white border border-slate-200 shadow-sm hover:shadow-md hover:border-indigo-200"
                        : "bg-slate-50/50 border border-slate-100 opacity-60 grayscale-[0.5]"
                    }`}
                  >
                    <label className="flex items-center gap-4 cursor-pointer flex-1 sm:w-1/3 min-w-0">
                      <input
                        type="checkbox"
                        checked={isVisible}
                        onChange={() => toggleVisible(id)}
                        className="dashboard-edit-custom-check shrink-0"
                        aria-label={WIDGET_LABELS[id]}
                      />
                      <span className={`text-base transition-colors ${isVisible ? "font-bold text-slate-800" : "font-medium text-slate-400 line-through"}`}>
                        {WIDGET_LABELS[id]}
                      </span>
                    </label>
                    <div className="flex items-center gap-3 flex-wrap">
                      {WIDGET_COLOR_IDS.map((c) => {
                        const g = WIDGET_COLOR_GRADIENT[c];
                        const isSelected = currentColor === c;
                        return (
                          <button
                            key={c}
                            type="button"
                            onClick={() => setWidgetColor(id, c)}
                            disabled={!isVisible}
                            className={`w-11 h-11 min-h-[44px] min-w-[44px] rounded-full transition-all duration-300 border-[3px] shadow-sm ${g.bgClass} ${
                              isSelected ? `ring-2 ring-offset-2 ${g.ringClass} border-white scale-110 shadow-md` : "border-white/80 hover:scale-110 hover:shadow-md"
                            } ${!isVisible ? "cursor-not-allowed opacity-50" : ""}`}
                            aria-label={`Barva ${c}`}
                            aria-pressed={isSelected}
                          />
                        );
                      })}
                    </div>
                    <div className="flex items-center gap-2 opacity-30 group-hover:opacity-100 transition-opacity justify-end sm:w-20">
                      <button
                        type="button"
                        onClick={() => moveUp(id)}
                        disabled={index === 0}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                        aria-label="Posunout nahoru"
                      >
                        <ArrowUp size={20} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(id)}
                        disabled={index === editOrder.length - 1}
                        className="min-h-[44px] min-w-[44px] inline-flex items-center justify-center rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                        aria-label="Posunout dolů"
                      >
                        <ArrowDown size={20} strokeWidth={2.5} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div className="px-10 py-6 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-4 relative z-10">
              <button
                type="button"
                onClick={() => setCustomizeOpen(false)}
                className="px-6 py-3 bg-transparent text-slate-600 font-bold text-sm rounded-xl hover:bg-slate-200 transition-colors min-h-[44px]"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={saveCustomize}
                className="flex items-center gap-2 px-8 py-3 bg-gradient-to-r from-indigo-600 to-purple-600 text-white rounded-xl text-sm font-black tracking-wide shadow-lg shadow-indigo-900/20 hover:shadow-xl hover:scale-[1.02] transition-all active:scale-95 min-h-[44px]"
              >
                <Check size={18} /> Uložit
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
