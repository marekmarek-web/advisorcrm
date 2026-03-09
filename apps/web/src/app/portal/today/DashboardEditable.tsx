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
  Activity,
  AlertCircle,
  Star,
  Target,
  ChevronRight,
  Plus,
  type LucideIcon,
} from "lucide-react";
import type { DashboardKpis } from "@/app/actions/dashboard";
import type { MeetingNoteForBoard } from "@/app/actions/meeting-notes";
import { segmentLabel } from "@/app/lib/segment-labels";
import { CalendarWidget } from "@/app/components/calendar/CalendarWidget";
import { MessengerPreview } from "@/app/components/dashboard/MessengerPreview";
import { DashboardMiniNotes } from "./DashboardMiniNotes";

const STORAGE_KEY = "weplan_dashboard_widgets";

const WIDGET_IDS = [
  "todayEvents",
  "overdueTasks",
  "pipelineAtRisk",
  "anniversaries",
  "serviceDue",
  "recentActivity",
] as const;

const WIDGET_LABELS: Record<(typeof WIDGET_IDS)[number], string> = {
  todayEvents: "Dnešní schůzky",
  overdueTasks: "Po termínu",
  pipelineAtRisk: "Pipeline v ohrožení",
  anniversaries: "Blížící se výročí smluv",
  serviceDue: "Servis k provedení",
  recentActivity: "Poslední aktivita",
};

type WidgetId = (typeof WIDGET_IDS)[number];

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

/* ── P0-C: Colored KPI cards with prokliky (ikony = sidebar) ── */
const KPI_CARDS: {
  key: keyof Pick<DashboardKpis, "meetingsToday" | "tasksOpen" | "opportunitiesOpen" | "totalContacts">;
  label: string;
  href: string;
  bg: string;
  text: string;
  border: string;
  Icon: LucideIcon;
}[] = [
  { key: "meetingsToday", label: "Schůzky dnes", href: "/portal/calendar", bg: "#edf2ff", text: "#3b5bdb", border: "#c5d5ff", Icon: Calendar },
  { key: "tasksOpen", label: "Úkoly ke splnění", href: "/portal/tasks", bg: "#fff8e1", text: "#e68900", border: "#ffe082", Icon: CheckSquare },
  { key: "opportunitiesOpen", label: "Otevřené případy", href: "/portal/pipeline", bg: "#f3e8ff", text: "#7c3aed", border: "#d8b4fe", Icon: Briefcase },
  { key: "totalContacts", label: "Kontakty", href: "/portal/contacts", bg: "#ecfdf5", text: "#059669", border: "#a7f3d0", Icon: Users },
];

/* ── Widget ikony (stejné jako sidebar) ── */
const WIDGET_ICONS: Record<WidgetId, LucideIcon> = {
  todayEvents: Calendar,
  overdueTasks: CheckSquare,
  pipelineAtRisk: Briefcase,
  anniversaries: CalendarClock,
  serviceDue: Wrench,
  recentActivity: Activity,
};

export function DashboardEditable({ kpis, initialNotes = [] }: { kpis: DashboardKpis; initialNotes?: MeetingNoteForBoard[] }) {
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

  const widgetHref: Partial<Record<WidgetId, string>> = {
    todayEvents: "/portal/calendar",
    overdueTasks: "/portal/tasks",
    pipelineAtRisk: "/portal/pipeline",
    anniversaries: "/portal/contacts",
    serviceDue: "/portal/contacts",
  };

  const renderWidgetContent = (id: WidgetId) => {
    switch (id) {
      case "todayEvents":
        return kpis.todayEvents.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--wp-text-muted)" }}>Žádné schůzky na dnes.</p>
        ) : (
          <ul className="space-y-2">
            {kpis.todayEvents.map((ev) => (
              <li key={ev.id} className="flex items-center gap-3 text-sm">
                <span className="text-xs font-mono px-1.5 py-0.5 rounded min-w-[40px] text-center" style={{ color: "var(--wp-text-muted)", background: "var(--wp-bg)" }}>
                  {new Date(ev.startAt).toLocaleTimeString("cs-CZ", { hour: "2-digit", minute: "2-digit" })}
                </span>
                <span className="font-medium" style={{ color: "var(--wp-text)" }}>{ev.title}</span>
                {ev.contactName && <span className="text-xs" style={{ color: "var(--wp-text-muted)" }}>({ev.contactName})</span>}
              </li>
            ))}
          </ul>
        );
      case "overdueTasks":
        return kpis.overdueTasks.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--wp-success)" }}>Vše splněno!</p>
        ) : (
          <ul className="space-y-2">
            {kpis.overdueTasks.slice(0, 5).map((t) => (
              <li key={t.id} className="flex items-center gap-2 text-sm">
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "rgba(229,83,75,0.1)", color: "var(--wp-danger)" }}>
                  {new Date(t.dueDate).toLocaleDateString("cs-CZ", { day: "numeric", month: "numeric" })}
                </span>
                <span className="font-medium truncate" style={{ color: "var(--wp-text)" }}>{t.title}</span>
                {t.contactName && <span className="text-xs truncate ml-auto" style={{ color: "var(--wp-text-muted)" }}>({t.contactName})</span>}
              </li>
            ))}
          </ul>
        );
      case "pipelineAtRisk":
        return kpis.pipelineAtRisk.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--wp-text-muted)" }}>Žádné případy v ohrožení.</p>
        ) : (
          <ul className="space-y-2">
            {kpis.pipelineAtRisk.slice(0, 5).map((o) => (
              <li key={o.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium truncate" style={{ color: "var(--wp-text)" }}>{o.title}</span>
                {o.contactName && <span className="text-xs truncate" style={{ color: "var(--wp-text-muted)" }}>({o.contactName})</span>}
                <span className="text-xs ml-auto whitespace-nowrap" style={{ color: "var(--wp-text-muted)" }}>{new Date(o.expectedCloseDate).toLocaleDateString("cs-CZ")}</span>
              </li>
            ))}
          </ul>
        );
      case "anniversaries":
        return kpis.upcomingAnniversaries.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--wp-text-muted)" }}>Žádná výročí v blízké době.</p>
        ) : (
          <ul className="space-y-2">
            {kpis.upcomingAnniversaries.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <span className="font-medium truncate" style={{ color: "var(--wp-text)" }}>{c.partnerName ?? "—"}</span>
                <span className="shrink-0 rounded px-1.5 py-0.5 text-[10px] font-medium" style={{ background: "var(--wp-cal-accent-light)", color: "var(--wp-cal-accent)" }}>{segmentLabel(c.segment)}</span>
                <span className="text-xs ml-auto whitespace-nowrap" style={{ color: "var(--wp-text-muted)" }}>{new Date(c.anniversaryDate).toLocaleDateString("cs-CZ")}</span>
                <span className="text-xs truncate" style={{ color: "var(--wp-text-muted)" }}>({c.contactName})</span>
              </li>
            ))}
          </ul>
        );
      case "serviceDue":
        return kpis.serviceDueContacts.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--wp-text-muted)" }}>Žádný servis k provedení.</p>
        ) : (
          <ul className="space-y-2">
            {kpis.serviceDueContacts.slice(0, 5).map((c) => (
              <li key={c.id} className="flex items-center gap-2 text-sm">
                <Link href={`/portal/contacts/${c.id}`} className="font-medium hover:underline truncate" style={{ color: "var(--wp-cal-accent)" }}>
                  {c.firstName} {c.lastName}
                </Link>
                <span className="text-xs ml-auto whitespace-nowrap" style={{ color: "var(--wp-text-muted)" }}>{new Date(c.nextServiceDue).toLocaleDateString("cs-CZ")}</span>
              </li>
            ))}
          </ul>
        );
      case "recentActivity": {
        const actionLabels: Record<string, string> = {
          status_change: "Změna stavu",
          won: "Výhra obchodu",
          lost: "Ztráta obchodu",
          edit: "Úprava",
          create: "Vytvoření",
          product_change: "Změna produktu",
          stage_change: "Změna fáze",
        };
        const entityLabels: Record<string, string> = {
          contact: "Kontakt",
          opportunity: "Obchod",
          contract: "Smlouva",
          board_item: "Položka boardu",
          task: "Úkol",
        };
        return kpis.recentActivity.length === 0 ? (
          <p className="text-sm py-3" style={{ color: "var(--wp-text-muted)" }}>Zatím žádná aktivita.</p>
        ) : (
          <ul className="space-y-2">
            {kpis.recentActivity.slice(0, 6).map((a) => {
              const actionText = actionLabels[a.action] ?? a.action;
              const meta = a.meta as { label?: string; stageId?: string; newValue?: string } | undefined;
              const suffix = meta?.label ? ` na ${meta.label}` : meta?.newValue ? ` na ${meta.newValue}` : "";
              const entityText = entityLabels[a.entityType] ?? a.entityType;
              return (
                <li key={a.id} className="flex items-center gap-3 text-sm">
                  <span className="text-xs font-mono min-w-[70px]" style={{ color: "var(--wp-text-muted)" }}>
                    {new Date(a.createdAt).toLocaleString("cs-CZ", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })}
                  </span>
                  <span className="font-medium" style={{ color: "var(--wp-text)" }}>{actionText}{suffix}</span>
                  <span className="text-xs" style={{ color: "var(--wp-text-muted)" }}>{entityText}</span>
                </li>
              );
            })}
          </ul>
        );
      }
      default:
        return null;
    }
  };

  return (
    <div className="flex flex-col md:flex-row flex-1 min-h-0 w-full" style={{ gap: 0, animation: "wp-fade-in 0.3s ease" }}>
      {/* ── Left panel: projects section ── */}
      <div className="wp-projects-section flex-1 min-w-0">
        {/* Header – dashboardv2: Moje nástěnka, datum s dnem v týdnu, Upravit + ChevronRight */}
        <div className="flex items-center justify-between mb-6">
          <div>
            <h2 className="text-3xl font-black text-slate-900 m-0">Moje nástěnka</h2>
            <p className="text-sm font-bold text-slate-500 mt-1 m-0">
              {new Date().toLocaleDateString("cs-CZ", { weekday: "long", day: "numeric", month: "long", year: "numeric" })}
            </p>
          </div>
          <button type="button" onClick={openCustomize} className="flex items-center gap-1 text-sm font-bold text-indigo-600 hover:underline">
            Upravit <ChevronRight size={16} />
          </button>
        </div>

        {/* P0-C: Colored KPI cards – live, klikatelné */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 sm:gap-4 mb-6">
          {KPI_CARDS.map((card) => {
            const IconComponent = card.Icon;
            return (
              <Link
                key={card.key}
                href={card.href}
                className="flex flex-col rounded-2xl p-3 sm:p-4 transition-all hover:shadow-md border min-h-[80px] sm:min-h-0"
                style={{ background: card.bg, borderColor: card.border, textDecoration: "none" }}
              >
                <div className="flex items-center gap-2">
                  <IconComponent size={20} strokeWidth={1.8} className="shrink-0 sm:w-[22px] sm:h-[22px]" style={{ color: card.text }} />
                  <span className="text-xl sm:text-2xl font-bold" style={{ color: card.text }}>{kpis[card.key]}</span>
                </div>
                <span className="text-xs font-medium mt-1" style={{ color: card.text, opacity: 0.85 }}>{card.label}</span>
              </Link>
            );
          })}
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
              href: "/portal/contacts",
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
                      className={`flex items-center gap-4 p-4 rounded-2xl border transition-shadow hover:shadow-md ${a.className}`}
                    >
                      <div className="bg-white/60 p-2 rounded-xl shadow-sm shrink-0">
                        <Icon size={20} />
                      </div>
                      <div className="min-w-0">
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

        {/* Widget grid */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 overflow-y-auto pb-6">
          {visibleOrder.map((id) => {
            const href = widgetHref[id];
            const WidgetIconComponent = WIDGET_ICONS[id];
            const header = (
              <div className="flex items-center justify-between mb-3">
                <h2 className="text-sm font-semibold flex items-center gap-2" style={{ color: "var(--wp-text)" }}>
                  <span className="touch-none cursor-grab active:cursor-grabbing" style={{ color: "var(--wp-text-muted)", opacity: 0.5 }} aria-hidden>⋮⋮</span>
                  {WidgetIconComponent && (
                    <span className="flex items-center justify-center rounded-[var(--wp-radius-sm)] p-1 shrink-0" style={{ background: "var(--wp-bg)", color: "var(--wp-text-muted)" }}>
                      <WidgetIconComponent size={18} strokeWidth={1.8} />
                    </span>
                  )}
                  {WIDGET_LABELS[id]}
                </h2>
              </div>
            );
            const body = renderWidgetContent(id);
            return (
              <div
                key={id}
                draggable
                onDragStart={(e) => handleDragStart(e, id)}
                onDragEnd={handleDragEnd}
                onDragOver={handleDragOver}
                onDrop={(e) => handleDrop(e, id)}
                className={`wp-card cursor-grab active:cursor-grabbing rounded-2xl p-4 ${draggedWidgetId === id ? "opacity-50" : ""} ${draggedWidgetId ? "border-dashed" : ""} ${href ? "border-b-[3px] border-b-indigo-500" : ""}`}
              >
                {href ? (
                  <Link href={href} className="block -m-4 p-4 rounded-2xl hover:bg-black/5 transition-colors text-inherit no-underline" aria-label={`Přejít na ${WIDGET_LABELS[id]}`}>
                    {header}
                    {body}
                  </Link>
                ) : (
                  <>
                    {header}
                    {body}
                  </>
                )}
              </div>
            );
          })}
        </div>

        {/* Mini Vision Board – dole na nástěnce */}
        <DashboardMiniNotes initialNotes={initialNotes} />
      </div>

      {/* ── Right panel: sidecalendar layout – sticky sidebar + patička Nová aktivita ── */}
      <aside className="w-full lg:w-[380px] mt-4 lg:mt-0 flex-shrink-0 flex flex-col border-t lg:border-t-0 lg:border-l border-slate-100 bg-white sticky top-[73px] h-[calc(100vh-73px)]">
        <div className="flex-1 overflow-y-auto p-4 lg:p-6">
          <CalendarWidget onNewActivity={() => router.push("/portal/calendar?new=1")} />
          <MessengerPreview />
        </div>
        <div className="border-t border-slate-100 bg-slate-50/50 p-4 lg:p-6 flex-shrink-0">
          <button
            type="button"
            onClick={() => router.push("/portal/calendar?new=1")}
            className="w-full py-4 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase flex items-center justify-center gap-2 transition-colors"
          >
            <Plus size={20} /> Nová aktivita
          </button>
        </div>
      </aside>

      {/* Customize modal */}
      {customizeOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30" onClick={() => setCustomizeOpen(false)}>
          <div
            className="wp-card w-full max-w-md p-5 shadow-xl"
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
