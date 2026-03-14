"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CalendarPlus,
  CheckSquare,
  Briefcase,
  Users,
  UserPlus,
  Wrench,
  AlertCircle,
  Star,
  Target,
  Phone,
  ChevronRight,
  ArrowRight,
  Clock,
  Plus,
  GripVertical,
  Sparkles,
  MessageSquare,
  BarChart3,
  FileText,
  TrendingUp,
  LayoutDashboard,
  ArrowUp,
  ArrowDown,
  Check,
  type LucideIcon,
} from "lucide-react";
import type { DashboardKpis } from "@/app/actions/dashboard";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import type { FinancialAnalysisListItem } from "@/app/actions/financial-analyses";
import type { ProductionSummary } from "@/app/actions/production";
import { CalendarWidget } from "@/app/components/calendar/CalendarWidget";
import { MessengerPreview } from "@/app/components/dashboard/MessengerPreview";
import { DashboardCard } from "@/app/components/dashboard/DashboardCard";
import { DashboardMiniNotes } from "./DashboardMiniNotes";
import { DashboardAiAssistant } from "./DashboardAiAssistant";
import { WIDGET_IDS, DEFAULT_DASHBOARD_ORDER, WIDGET_LABELS, WIDGET_ICONS, WIDGET_HREF, WIDGET_SECTION, WIDGET_SECTION_BG, WIDGET_COLOR_IDS, WIDGET_COLOR_CLASS, WIDGET_COLOR_GRADIENT, type WidgetId, type WidgetColorId } from "./dashboard-config";

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
  } catch {}
}

/* KPI karty – lehký gradient, opacity cca 20 %, glow */
const KPI_THEMES = {
  green: { bg: "bg-emerald-500/20", glow: "bg-emerald-500", ring: "group-hover:ring-emerald-100", subtitle: "text-emerald-600" },
  blue: { bg: "bg-blue-500/20", glow: "bg-blue-500", ring: "group-hover:ring-blue-100", subtitle: "text-blue-600" },
  purple: { bg: "bg-violet-500/20", glow: "bg-violet-500", ring: "group-hover:ring-violet-100", subtitle: "text-violet-600" },
} as const;
const KPI_CARDS_V3: {
  key: keyof Pick<DashboardKpis, "meetingsToday" | "tasksOpen" | "opportunitiesOpen">;
  label: string;
  subtitle: string;
  href: string;
  theme: keyof typeof KPI_THEMES;
  Icon: LucideIcon;
}[] = [
  { key: "meetingsToday", label: "Schůzky dnes", subtitle: "Kalendář", href: "/portal/calendar", theme: "green", Icon: Calendar },
  { key: "tasksOpen", label: "Úkoly ke splnění", subtitle: "Úkoly", href: "/portal/tasks", theme: "blue", Icon: CheckSquare },
  { key: "opportunitiesOpen", label: "Otevřené případy", subtitle: "Pipeline", href: "/portal/pipeline", theme: "purple", Icon: Briefcase },
];

export function DashboardEditable({
  kpis,
  initialNotes = [],
  advisorName = null,
  initialAnalyses = [],
  productionSummary = null,
  productionError = null,
}: {
  kpis: DashboardKpis;
  initialNotes?: MeetingNoteForBoard[];
  advisorName?: string | null;
  initialAnalyses?: FinancialAnalysisListItem[];
  productionSummary?: ProductionSummary | null;
  productionError?: string | null;
}) {
  const router = useRouter();
  const [config, setConfig] = useState<DashboardConfig>({ order: [...DEFAULT_DASHBOARD_ORDER], hidden: [] });
  const [customizeOpen, setCustomizeOpen] = useState(false);
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
    [config]
  );

  const renderWidgetContent = (id: WidgetId) => {
    switch (id) {
      case "aiAssistant":
        return <DashboardAiAssistant />;
      case "summaryDay": {
        const overdue = kpis.overdueTasks.length;
        const dueToday = kpis.tasksDueToday?.length ?? 0;
        const risk = kpis.pipelineAtRisk.length;
        const events = kpis.todayEvents.length;
        const parts: string[] = [];
        if (overdue > 0) parts.push(`${overdue} urgentní ${overdue === 1 ? "úkol" : overdue < 5 ? "úkoly" : "úkolů"}`);
        if (dueToday > 0 && overdue === 0) parts.push(`${dueToday} úkolů na dnes`);
        if (risk > 0) parts.push(`${risk} obchodů v ohrožení`);
        if (events > 0) parts.push(`${events} schůzek dnes`);
        const summary = parts.length > 0
          ? `Dnes máte ${parts.join(", ")}. Doporučuji nejdříve vyřešit ${overdue > 0 ? "zpožděné úkoly" : risk > 0 ? "obchody v ohrožení" : "dnešní agendu"}.`
          : "Dnes nemáte urgentní položky. Prohlédněte si kalendář nebo úkoly.";
        return (
          <div className="bg-gradient-to-br from-[#1a1c2e] to-indigo-950 p-6 rounded-3xl text-white shadow-xl shadow-indigo-900/10 relative overflow-hidden h-full flex flex-col justify-center min-h-[240px]">
            <Sparkles className="absolute -top-6 -right-6 w-32 h-32 text-indigo-500/20" aria-hidden />
            <div className="relative z-10">
              <div className="flex items-center gap-2 mb-3">
                <div className="p-2 bg-indigo-500/30 rounded-lg text-indigo-300"><Sparkles size={16} /></div>
                <h3 className="text-xs font-black uppercase tracking-widest text-indigo-200">AI Asistent</h3>
              </div>
              <p className="text-sm font-medium leading-relaxed text-indigo-50 mb-5">{summary}</p>
              <Link
                href="/portal/calendar"
                className="flex items-center justify-between w-full px-4 py-3 bg-white/10 hover:bg-white/20 transition-colors rounded-xl text-sm font-bold backdrop-blur-sm border border-white/10 text-white no-underline"
              >
                Přejít na dnešní agendu <ArrowRight size={16} />
              </Link>
            </div>
          </div>
        );
      }
      case "myTasks": {
        const all = [...kpis.overdueTasks, ...(kpis.tasksDueToday ?? [])].slice(0, 7);
        const todayStr = new Date().toISOString().slice(0, 10);
        const isOverdue = (d: string) => d < todayStr;
        const isToday = (d: string) => d === todayStr;
        const timeLabel = (due: string) => {
          if (due < todayStr) return "Po termínu";
          if (due === todayStr) return "Dnes";
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          if (due === tomorrow.toISOString().slice(0, 10)) return "Zítra";
          return new Date(due).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" });
        };
        return all.length === 0 ? (
          <p className="text-sm py-3 text-emerald-600 font-medium">Vše splněno!</p>
        ) : (
          <div className="flex flex-col h-full">
            <div className="space-y-3 flex-1">
              {all.map((t) => (
                <Link
                  key={t.id}
                  href={`/portal/tasks${isOverdue(t.dueDate) ? "?filter=overdue" : "?filter=today"}`}
                  className="flex items-start gap-3 p-3 rounded-xl hover:bg-slate-50 transition-colors border border-transparent hover:border-slate-100 group no-underline text-inherit"
                >
                  <span className="mt-0.5 w-5 h-5 rounded-md border-2 border-slate-300 shrink-0" aria-hidden />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-bold text-slate-800 leading-tight mb-1 group-hover:text-indigo-600 transition-colors truncate">{t.title}</p>
                    <span className={`text-[10px] font-black uppercase tracking-widest flex items-center gap-1 ${isOverdue(t.dueDate) ? "text-rose-500" : "text-slate-400"}`}>
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
          <p className="text-sm py-3 text-slate-500">Žádné aktivní obchody.</p>
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
        const target: number | null = null; // cíl zatím "—"
        const pct = target && target > 0 ? Math.round((totalPremium / target) * 100) : 0;
        if (productionError) {
          return (
            <div className="flex flex-col h-full justify-center">
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
            <div className="flex flex-col h-full justify-center">
              <p className="text-sm py-3 text-slate-500">Žádná produkce za tento měsíc.</p>
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
      case "clientCare": {
        const service = kpis.serviceDueContacts.slice(0, 3);
        const ann = kpis.upcomingAnniversaries.slice(0, 3);
        const hasAny = service.length > 0 || ann.length > 0;
        return !hasAny ? (
          <p className="text-sm py-3 text-slate-500">Žádná péče k zobrazení.</p>
        ) : (
          <div className="flex flex-col h-full">
            <div className="space-y-3 flex-1">
              {service.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50/30 border border-amber-100/50">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{c.firstName} {c.lastName}</h4>
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5"><AlertCircle size={12} /> Servis · {new Date(c.nextServiceDue).toLocaleDateString("cs-CZ")}</p>
                  </div>
                  <Link href={`/portal/contacts/${c.id}`} className="p-2 bg-white text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg shadow-sm transition-colors shrink-0" aria-label="Zavolat"><Phone size={14} /></Link>
                </div>
              ))}
              {ann.map((c) => (
                <div key={c.id} className="flex items-center justify-between p-3 rounded-xl bg-amber-50/30 border border-amber-100/50">
                  <div>
                    <h4 className="font-bold text-sm text-slate-800">{c.partnerName ?? "—"}</h4>
                    <p className="text-xs font-bold text-amber-600 flex items-center gap-1 mt-0.5"><AlertCircle size={12} /> Výročí · {c.contactName} · {new Date(c.anniversaryDate).toLocaleDateString("cs-CZ")}</p>
                  </div>
                  <Link href={`/portal/contacts/${c.contactId}`} className="p-2 bg-white text-slate-600 hover:text-indigo-600 border border-slate-200 rounded-lg shadow-sm transition-colors shrink-0" aria-label="Otevřít kontakt"><Phone size={14} /></Link>
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
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full gap-0 lg:gap-12 animate-[wp-fade-in_0.3s_ease] bg-[#f8fafc] relative">
      <style>{`
        .dashboard-hub-bg {
          background-image:
            linear-gradient(to right, rgba(99, 102, 241, 0.03) 1px, transparent 1px),
            linear-gradient(to bottom, rgba(99, 102, 241, 0.03) 1px, transparent 1px);
          background-size: 40px 40px;
        }
      `}</style>
      {/* Left panel: main content */}
      <div className="wp-projects-section dashboard-hub-bg flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8 lg:pr-4">
        {/* V3: Úvod – pozdrav a datum */}
        <div className="flex flex-wrap items-end justify-between gap-4 mb-6">
          <div>
            <h1 className="text-2xl sm:text-3xl font-black text-slate-900 m-0 tracking-tight">
              Dobrý den, {greetingName} 👋
            </h1>
            <p className="text-sm font-bold text-slate-500 mt-1 m-0">Dnes je {dateLabel}. Zde je váš přehled.</p>
          </div>
          <button
            type="button"
            onClick={openCustomize}
            className="min-h-[44px] flex items-center gap-1 text-sm font-bold text-indigo-600 hover:text-indigo-800 hover:underline px-2 -mx-2 rounded-lg"
          >
            Upravit nástěnku <ChevronRight size={16} />
          </button>
        </div>

        {/* KPI karty – zmenšené, opacity 20 %, glow v pravém horním rohu */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-8">
          {KPI_CARDS_V3.map((card) => {
            const theme = KPI_THEMES[card.theme];
            const Icon = card.Icon;
            return (
              <Link
                key={card.key}
                href={card.href}
                className={`group relative rounded-3xl p-4 sm:p-5 border border-slate-100 shadow-md flex flex-col justify-center min-h-[80px] no-underline overflow-hidden transition-all duration-200 hover:shadow-lg ${theme.bg} ring-4 ring-transparent ${theme.ring}`}
              >
                <div className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[60px] opacity-0 group-hover:opacity-25 transition-opacity duration-500 ${theme.glow}`} aria-hidden />
                <div className="relative z-10 flex items-center gap-2 mb-1">
                  <div className={`w-8 h-8 rounded-xl flex items-center justify-center text-white shadow-sm ${card.theme === "green" ? "bg-emerald-500" : card.theme === "blue" ? "bg-blue-500" : "bg-violet-500"}`}>
                    <Icon size={18} />
                  </div>
                  <span className="text-[10px] font-black uppercase tracking-widest text-slate-500">{card.label}</span>
                </div>
                <div className="relative z-10 flex items-end gap-3 mb-0.5">
                  <span className="text-2xl font-black tracking-tight text-slate-900 tabular-nums">{kpis[card.key]}</span>
                </div>
                <span className={`text-xs font-bold ${theme.subtitle}`}>{card.subtitle}</span>
              </Link>
            );
          })}
        </div>

        {/* Rychlé vstupy – animace ikon 1:1 jako v main sidebaru (hoverAnim na obalu ikony) */}
        <div className="mb-6 rounded-3xl border border-slate-100 bg-white shadow-md p-5 sm:p-6">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-4">Rychlé vstupy</h3>
          <div className="flex flex-wrap gap-3 justify-center">
            <Link href="/portal/contacts?newClient=1" className="group min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200">
              <span className="flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110"><UserPlus size={18} /></span> Nový klient
            </Link>
            <Link href="/portal/calendar?new=1" className="group min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200">
              <span className="flex items-center justify-center shrink-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-110"><CalendarPlus size={18} /></span> Nová schůzka
            </Link>
            <Link href="/portal/tasks" className="group min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200">
              <span className="flex items-center justify-center shrink-0 transition-all duration-300 group-hover:rotate-12 group-hover:scale-110"><CheckSquare size={18} /></span> Nový úkol
            </Link>
            <Link href="/portal/messages" className="group min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200">
              <span className="flex items-center justify-center shrink-0 transition-all duration-300 origin-top group-hover:rotate-[20deg]"><MessageSquare size={18} /></span> Napsat zprávu
            </Link>
            <Link href="/portal/calculators" className="group min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200">
              <span className="flex items-center justify-center shrink-0 transition-all duration-300 group-hover:rotate-12 group-hover:scale-110"><BarChart3 size={18} /></span> Kalkulačky
            </Link>
            <Link href="/portal/analyses/financial" className="group min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200">
              <span className="flex items-center justify-center shrink-0 transition-all duration-300 group-hover:scale-110 group-hover:rotate-6"><Target size={18} /></span> Finanční analýza
            </Link>
            <Link href="/portal/calendar" className="group min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-indigo-50 hover:border-indigo-200">
              <span className="flex items-center justify-center shrink-0 transition-all duration-300 group-hover:-translate-y-1 group-hover:scale-110"><Calendar size={18} /></span> Kalendář
            </Link>
          </div>
        </div>

        {/* Focus Alerts – pouze z kpis */}
        {(() => {
          const todayStr = new Date().toISOString().slice(0, 10);
          const anniversariesToday = kpis.upcomingAnniversaries.filter((a) => a.anniversaryDate.slice(0, 10) === todayStr);
          const alerts: { id: string; title: string; desc: string; href: string; className: string; Icon: LucideIcon }[] = [];
          if (kpis.overdueTasks.length > 0) {
            alerts.push({
              id: "overdue",
              title: "Úkoly po termínu",
              desc: `Máte ${kpis.overdueTasks.length} zpožděných úkolů`,
              href: "/portal/tasks",
              className: "text-rose-600 bg-rose-50 border-rose-100",
              Icon: AlertCircle,
            });
          }
          if (anniversariesToday.length > 0) {
            const first = anniversariesToday[0];
            alerts.push({
              id: "anniversary",
              title: "Dnes má výročí smlouvy",
              desc: `${first.partnerName ?? "Smlouva"} (${first.contactName})`,
              href: `/portal/contacts/${first.contactId}`,
              className: "text-amber-600 bg-amber-50 border-amber-100",
              Icon: Star,
            });
          }
          if (kpis.pipelineAtRisk.length > 0) {
            alerts.push({
              id: "pipeline",
              title: "Pipeline v ohrožení",
              desc: `${kpis.pipelineAtRisk.length} obchodů po plánovaném termínu uzavření`,
              href: "/portal/pipeline",
              className: "text-orange-600 bg-orange-50 border-orange-100",
              Icon: AlertCircle,
            });
          }
          if (alerts.length === 0) return null;
          return (
            <div className="mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Vyžaduje pozornost</h3>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {alerts.map((a) => {
                  const Icon = a.Icon;
                  return (
                    <Link
                      key={a.id}
                      href={a.href}
                      className={`flex items-center gap-4 p-4 rounded-3xl border border-slate-100 shadow-md transition-all hover:shadow-lg min-h-[72px] ${a.className}`}
                    >
                      <div className="bg-white/70 p-2.5 rounded-xl shadow-sm shrink-0">
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <h4 className="font-bold text-sm leading-tight mb-0.5">{a.title}</h4>
                        <p className="text-xs font-semibold opacity-80 truncate">{a.desc}</p>
                      </div>
                    </Link>
                  );
                })}
              </div>
            </div>
          );
        })()}

        {/* Dnešní priority – úkoly (overdue + due today) + obchody krok 3 a 4 */}
        {(() => {
          const priorityTasks = [...kpis.overdueTasks, ...(kpis.tasksDueToday ?? [])].slice(0, 7);
          const priorityOpps = kpis.opportunitiesInStep3And4 ?? [];
          if (priorityTasks.length === 0 && priorityOpps.length === 0) return null;
          return (
            <div className="mb-6">
              <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Dnešní priority</h3>
              <div className="rounded-3xl border border-slate-100 bg-white shadow-md overflow-hidden">
                <div className="grid grid-cols-1 md:grid-cols-2 divide-y md:divide-y-0 md:divide-x divide-slate-100">
                  {priorityTasks.length > 0 && (
                    <div className="p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 text-slate-500">
                        <Target size={14} className="text-indigo-600" /> To-Do List · Úkoly
                      </h4>
                      <ul className="space-y-2">
                        {priorityTasks.map((t) => (
                          <li key={t.id}>
                            <Link
                              href="/portal/tasks"
                              className="flex items-center gap-2 text-sm group p-2 rounded-xl hover:bg-slate-50 transition-colors"
                            >
                              <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: kpis.overdueTasks.some((o) => o.id === t.id) ? "rgba(229,83,75,0.1)" : "var(--wp-bg)", color: kpis.overdueTasks.some((o) => o.id === t.id) ? "var(--wp-danger)" : "var(--wp-text-muted)" }}>
                                {new Date(t.dueDate).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}
                              </span>
                              <span className="font-medium truncate group-hover:underline text-slate-800">{t.title}</span>
                              {t.contactName && <span className="text-xs truncate ml-auto text-slate-500">({t.contactName})</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <Link href="/portal/tasks" className="text-xs font-semibold mt-2 inline-block text-indigo-600 hover:underline">Všechny úkoly →</Link>
                    </div>
                  )}
                  {priorityOpps.length > 0 && (
                    <div className="p-4">
                      <h4 className="text-xs font-bold uppercase tracking-wider mb-3 flex items-center gap-2 text-slate-500">
                        <Briefcase size={14} className="text-indigo-600" /> Před uzavřením / Realizace
                      </h4>
                      <ul className="space-y-2">
                        {priorityOpps.slice(0, 5).map((o) => (
                          <li key={o.id}>
                            <Link href={`/portal/pipeline/${o.id}`} className="flex items-center gap-2 text-sm group p-2 rounded-xl hover:bg-slate-50 transition-colors">
                              <span className="font-medium truncate group-hover:underline text-slate-800">{o.title}</span>
                              <span className="text-[10px] shrink-0 px-1.5 py-0.5 rounded bg-slate-100 text-slate-500">{o.stageName}</span>
                              {o.contactName && <span className="text-xs truncate ml-auto text-slate-500">({o.contactName})</span>}
                            </Link>
                          </li>
                        ))}
                      </ul>
                      <Link href="/portal/pipeline" className="text-xs font-semibold mt-2 inline-block text-indigo-600 hover:underline">Všechny obchody →</Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })()}

        {/* Widget grid – premium cards, drag-and-drop */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-8">
          {visibleOrder.map((id) => {
            const WidgetIconComponent = WIDGET_ICONS[id];
            const footerLink = WIDGET_HREF[id];
            const footerLabel = id === "production" ? "Otevřít produkci" : id === "activeDeals" ? "Otevřít Board" : id === "myTasks" ? "Zobrazit všechny úkoly" : id === "clientCare" ? "Servisní přehled" : id === "financialAnalyses" ? "Všechny analýzy" : "Více";
            const body = renderWidgetContent(id);
            const isNotesFullWidth = id === "notes";
            const cardBg = config.widgetColors?.[id] ? WIDGET_COLOR_CLASS[config.widgetColors[id]] : WIDGET_SECTION_BG[WIDGET_SECTION[id]];
            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => handleDragStart(e, id)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, id)}
                className={`w-full rounded-3xl overflow-hidden transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${cardBg} ${isNotesFullWidth ? "md:col-span-2 xl:col-span-3" : ""} ${draggedWidgetId === id ? "opacity-60 scale-[0.98]" : ""} ${draggedWidgetId && draggedWidgetId !== id ? "border-dashed border-indigo-200" : ""}`}
              >
                <DashboardCard
                  title={WIDGET_LABELS[id]}
                  icon={WidgetIconComponent}
                  footerLink={footerLink}
                  footerLabel={footerLabel}
                  backgroundClass="bg-transparent"
                  rightElement={
                    <span className="p-1 text-slate-200 hover:text-slate-400 cursor-grab active:cursor-grabbing rounded transition-colors touch-none shrink-0" aria-label="Chytit a přesunout">
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

      </div>

      {/* Right panel: side calendar – vizuálně oddělená plocha */}
      <aside className="w-full lg:w-[380px] mt-10 lg:mt-0 flex-shrink-0 flex flex-col border-t border-slate-200 lg:border lg:border-slate-100 lg:rounded-[24px] lg:shadow-sm bg-slate-50/50 lg:bg-white sticky top-[73px] h-[calc(100vh-73px)] overflow-hidden lg:ml-2">
        <div className="flex-1 overflow-y-auto p-5 lg:p-6 space-y-6 bg-white lg:bg-white">
          <section className="space-y-4">
            <h3 className="text-sm font-bold text-slate-500 uppercase tracking-wider">Kalendář</h3>
            <CalendarWidget onNewActivity={() => router.push("/portal/calendar?new=1")} />
          </section>
          <section className="pt-6 border-t border-slate-100">
            <MessengerPreview />
          </section>
        </div>
        <div className="border-t border-slate-200 bg-white p-5 lg:p-6 flex-shrink-0">
          <button
            type="button"
            onClick={() => router.push("/portal/calendar?new=1")}
            className="w-full min-h-[52px] py-4 px-6 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase flex items-center justify-center gap-2 shadow-lg shadow-indigo-900/20 hover:shadow-xl transition-all active:scale-[0.98]"
          >
            <Plus size={20} /> Nová aktivita
          </button>
        </div>
      </aside>

      {/* Customize modal – Upravit nástěnku (design 2026) */}
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
                            className={`w-9 h-9 rounded-full transition-all duration-300 border-[3px] shadow-sm ${g.bgClass} ${
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
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
                        aria-label="Posunout nahoru"
                      >
                        <ArrowUp size={20} strokeWidth={2.5} />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveDown(id)}
                        disabled={index === editOrder.length - 1}
                        className="p-1.5 rounded-lg text-slate-500 hover:text-indigo-600 hover:bg-indigo-50 disabled:opacity-20 disabled:hover:bg-transparent disabled:hover:text-slate-500 transition-colors"
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
