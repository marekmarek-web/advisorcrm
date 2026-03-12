"use client";

import { useState, useEffect, useCallback } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import {
  Calendar,
  CheckSquare,
  Briefcase,
  Users,
  CalendarClock,
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
import { WIDGET_IDS, WIDGET_LABELS, WIDGET_ICONS, WIDGET_HREF, type WidgetId } from "./dashboard-config";

const STORAGE_KEY = "weplan_dashboard_widgets";

interface DashboardConfig {
  order: WidgetId[];
  hidden: WidgetId[];
}

function loadConfig(): DashboardConfig {
  if (typeof window === "undefined") {
    return { order: [...WIDGET_IDS], hidden: [] };
  }
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { order: [...WIDGET_IDS], hidden: [] };
    const parsed = JSON.parse(raw) as DashboardConfig;
    const order = Array.isArray(parsed.order) ? parsed.order.filter((id) => WIDGET_IDS.includes(id)) : [...WIDGET_IDS];
    const hidden = Array.isArray(parsed.hidden) ? parsed.hidden.filter((id) => WIDGET_IDS.includes(id)) : [];
    const missingOrder = WIDGET_IDS.filter((id) => !order.includes(id));
    return { order: [...order, ...missingOrder], hidden };
  } catch {
    return { order: [...WIDGET_IDS], hidden: [] };
  }
}

function saveConfig(config: DashboardConfig) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(config));
  } catch {}
}

/* V3 1:1 mockup: bílé KPI karty, malý label + velké číslo + podtitul */
const KPI_CARDS_V3: {
  key: keyof Pick<DashboardKpis, "meetingsToday" | "tasksOpen" | "opportunitiesOpen">;
  label: string;
  subtitle: string;
  href: string;
  subtitleColor: string; // Tailwind text-* for subtitle
  Icon: LucideIcon;
}[] = [
  { key: "meetingsToday", label: "Schůzky dnes", subtitle: "Kalendář", href: "/portal/calendar", subtitleColor: "text-emerald-600", Icon: Calendar },
  { key: "tasksOpen", label: "Úkoly ke splnění", subtitle: "Úkoly", href: "/portal/tasks", subtitleColor: "text-blue-600", Icon: CheckSquare },
  { key: "opportunitiesOpen", label: "Otevřené případy", subtitle: "Pipeline", href: "/portal/pipeline", subtitleColor: "text-indigo-600", Icon: Briefcase },
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
  const [config, setConfig] = useState<DashboardConfig>({ order: [...WIDGET_IDS], hidden: [] });
  const [customizeOpen, setCustomizeOpen] = useState(false);
  const [editOrder, setEditOrder] = useState<WidgetId[]>([]);
  const [editHidden, setEditHidden] = useState<Set<WidgetId>>(new Set());

  useEffect(() => {
    setConfig(loadConfig());
  }, []);

  const openCustomize = useCallback(() => {
    setEditOrder([...config.order]);
    setEditHidden(new Set(config.hidden));
    setCustomizeOpen(true);
  }, [config]);

  const saveCustomize = useCallback(() => {
    const newConfig: DashboardConfig = {
      order: editOrder,
      hidden: Array.from(editHidden),
    };
    setConfig(newConfig);
    saveConfig(newConfig);
    setCustomizeOpen(false);
  }, [editOrder, editHidden]);

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
          <div className="bg-gradient-to-br from-[#1a1c2e] to-indigo-950 p-6 rounded-[24px] text-white shadow-xl shadow-indigo-900/10 relative overflow-hidden h-full flex flex-col justify-center min-h-[240px]">
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
                <div className="text-xs font-bold text-slate-500 mt-0.5">Cíl: {target.toLocaleString("cs-CZ")} Kč</div>
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
      default:
        return null;
    }
  };

  const greetingName = advisorName?.trim() || "poradce";
  const dateLabel = new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" });

  return (
    <div className="flex flex-col lg:flex-row flex-1 min-h-0 w-full gap-0 lg:gap-12 animate-[wp-fade-in_0.3s_ease] bg-[#f8fafc]">
      {/* Left panel: main content */}
      <div className="wp-projects-section flex-1 min-w-0 overflow-y-auto px-4 sm:px-6 lg:px-8 py-5 sm:py-6 lg:py-8 lg:pr-4">
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

        {/* V3 1:1: bílé KPI karty – malý label, velké číslo, podtitul */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 mb-8">
          {KPI_CARDS_V3.map((card) => (
            <Link
              key={card.key}
              href={card.href}
              className="bg-white rounded-[24px] p-6 border border-slate-100 shadow-sm flex flex-col justify-center hover:shadow-md transition-shadow min-h-[100px] no-underline"
            >
              <span className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-1 block">{card.label}</span>
              <div className="flex items-end gap-3 mb-1">
                <span className="text-3xl font-black tracking-tight text-slate-900 tabular-nums">{kpis[card.key]}</span>
              </div>
              <span className={`text-xs font-bold ${card.subtitleColor}`}>{card.subtitle}</span>
            </Link>
          ))}
        </div>

        {/* V3: Rychlé vstupy – karta ve stylu V3 */}
        <div className="mb-6 rounded-[24px] border border-slate-100 bg-white shadow-sm p-4 sm:p-5">
          <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400 mb-3">Rychlé vstupy</h3>
          <div className="flex flex-wrap gap-3">
            <Link
              href="/portal/contacts/new"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <Users size={18} /> Nový klient
            </Link>
            <Link
              href="/portal/calendar?new=1"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <CalendarClock size={18} /> Nová schůzka
            </Link>
            <Link
              href="/portal/tasks"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <CheckSquare size={18} /> Nový úkol
            </Link>
            <Link
              href="/portal/messages"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <MessageSquare size={18} /> Napsat zprávu
            </Link>
            <Link
              href="/portal/calculators"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <BarChart3 size={18} /> Kalkulačky
            </Link>
            <Link
              href="/portal/analyses/financial"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <Target size={18} /> Finanční analýza
            </Link>
            <Link
              href="/portal/calendar"
              className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2.5 rounded-xl border border-slate-200 bg-white text-slate-700 text-sm font-semibold shadow-sm hover:bg-slate-50 hover:border-indigo-200 transition-colors"
            >
              <Calendar size={18} /> Kalendář
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
                      className={`flex items-center gap-4 p-4 rounded-[24px] border border-slate-100 shadow-sm transition-all hover:shadow-md min-h-[72px] ${a.className}`}
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
              <div className="rounded-[24px] border border-slate-100 bg-white shadow-sm overflow-hidden">
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

        {/* Widget grid – DashboardCard + drag-and-drop, sections A–D order preserved by visibleOrder */}
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-6 pb-8">
          {visibleOrder.map((id) => {
            const WidgetIconComponent = WIDGET_ICONS[id];
            const footerLink = WIDGET_HREF[id];
            const footerLabel = id === "production" ? "Otevřít produkci" : id === "activeDeals" ? "Otevřít Board" : id === "myTasks" ? "Zobrazit všechny úkoly" : id === "clientCare" ? "Servisní přehled" : id === "financialAnalyses" ? "Všechny analýzy" : "Více";
            const body = renderWidgetContent(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => handleDragStart(e, id)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, id)}
                className={`hover:shadow-md transition-shadow ${draggedWidgetId === id ? "opacity-60 scale-[0.98]" : ""} ${draggedWidgetId && draggedWidgetId !== id ? "border-dashed border-indigo-200" : ""}`}
              >
                <DashboardCard
                  title={WIDGET_LABELS[id]}
                  icon={WidgetIconComponent}
                  footerLink={footerLink}
                  footerLabel={footerLabel}
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

        {/* Zápisky – dole na nástěnce */}
        <div className="mb-8">
          <DashboardMiniNotes initialNotes={initialNotes} />
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

      {/* Customize modal */}
      {customizeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40" onClick={() => setCustomizeOpen(false)}>
          <div
            className="w-full max-w-md p-6 rounded-[24px] border border-slate-100 bg-white shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-base font-semibold mb-4" style={{ color: "var(--wp-text)" }}>Upravit nástěnku</h3>
            <p className="text-xs mb-4" style={{ color: "var(--wp-text-muted)" }}>Zaškrtněte viditelné widgety a použijte šipky pro pořadí.</p>
            <ul className="space-y-2">
              {editOrder.map((id) => (
                <li key={id} className="flex items-center gap-2 py-1.5 last:border-0" style={{ borderBottom: "1px solid var(--wp-border)" }}>
                  <input
                    type="checkbox"
                    checked={!editHidden.has(id)}
                    onChange={() => toggleVisible(id)}
                    className="rounded"
                    style={{ borderColor: "var(--wp-border)" }}
                  />
                  <span className="flex-1 text-sm" style={{ color: "var(--wp-text)" }}>{WIDGET_LABELS[id]}</span>
                  <button type="button" onClick={() => moveUp(id)} className="p-1" style={{ color: "var(--wp-text-muted)" }} aria-label="Nahoru">↑</button>
                  <button type="button" onClick={() => moveDown(id)} className="p-1" style={{ color: "var(--wp-text-muted)" }} aria-label="Dolů">↓</button>
                </li>
              ))}
            </ul>
            <div className="flex justify-end gap-2 mt-4 pt-4" style={{ borderTop: "1px solid var(--wp-border)" }}>
              <button type="button" onClick={() => setCustomizeOpen(false)} className="wp-btn wp-btn-ghost">Zrušit</button>
              <button type="button" onClick={saveCustomize} className="wp-btn wp-btn-primary">Uložit</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
