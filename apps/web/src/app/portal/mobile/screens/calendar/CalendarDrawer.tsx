"use client";

import { Calendar, ChevronRight, Menu, Settings2, RefreshCw } from "lucide-react";
import { useEffect } from "react";
import { CALENDAR_EVENT_CATEGORIES } from "@/app/portal/calendar/event-categories";
import type { CalendarViewMode } from "./calendar-utils";
import { startOfDayLocal, startOfWeekLocal, viewModeLabel } from "./calendar-utils";
import { CalendarMiniMonth } from "./CalendarMiniMonth";

function cx(...c: Array<string | false | null | undefined>) {
  return c.filter(Boolean).join(" ");
}

export function CalendarDrawer({
  open,
  onClose,
  anchorDate,
  setAnchorDate,
  firstDayOfWeek,
  todayStr,
  view,
  setView,
  hiddenEventTypes,
  toggleEventTypeHidden,
  onOpenSettings,
  scrollSignalBump,
  onNavigatePeriod,
  onOpenGlobalAppMenu,
  googleConnected,
  onSyncCalendar,
  syncBusy,
}: {
  open: boolean;
  onClose: () => void;
  anchorDate: Date;
  setAnchorDate: (d: Date) => void;
  firstDayOfWeek: 0 | 1;
  todayStr: string;
  view: CalendarViewMode;
  setView: (v: CalendarViewMode) => void;
  hiddenEventTypes: Set<string>;
  toggleEventTypeHidden: (typeId: string) => void;
  onOpenSettings: () => void;
  scrollSignalBump: () => void;
  onNavigatePeriod: (direction: -1 | 1) => void;
  onOpenGlobalAppMenu?: () => void;
  googleConnected?: boolean;
  onSyncCalendar?: () => void;
  syncBusy?: boolean;
}) {
  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", h);
    return () => window.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open) return null;

  const viewOptions: { id: CalendarViewMode; label: string }[] = [
    { id: "day", label: "1 den" },
    { id: "3day", label: "3 dny" },
    { id: "week", label: "Týden" },
    { id: "agenda", label: "Agenda (týden)" },
  ];

  return (
    <>
      <button
        type="button"
        aria-label="Zavřít menu kalendáře"
        className="fixed inset-0 z-[95] bg-slate-900/40 backdrop-blur-[2px]"
        onClick={onClose}
      />
      <aside
        className="fixed inset-y-0 left-0 z-[96] flex w-[min(100%,380px)] max-w-[92vw] flex-col border-r border-slate-200 bg-white shadow-xl"
        role="dialog"
        aria-modal="true"
        aria-label="Kalendář — navigace"
      >
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <div className="flex items-center gap-2">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
              <Calendar size={18} />
            </div>
            <span className="font-black text-slate-900">Kalendář</span>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] min-w-[40px] rounded-lg border border-slate-200 text-sm font-bold text-slate-600"
          >
            Hotovo
          </button>
        </div>

        <div className="min-h-0 flex-1 space-y-5 overflow-y-auto px-4 py-4">
          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Zobrazení</p>
            <div className="grid grid-cols-2 gap-2">
              {viewOptions.map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  onClick={() => {
                    setView(opt.id);
                    onClose();
                  }}
                  className={cx(
                    "min-h-[48px] rounded-xl border px-3 text-left text-xs font-bold transition-colors active:scale-[0.99]",
                    view === opt.id
                      ? "border-indigo-200 bg-indigo-50 text-indigo-800"
                      : "border-slate-200 bg-white text-slate-800",
                  )}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <p className="mt-2 text-[10px] text-slate-500">Aktivní: {viewModeLabel(view)}</p>
          </div>

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Rychlé přesuny</p>
            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => {
                  setAnchorDate(startOfDayLocal(new Date()));
                  scrollSignalBump();
                  onClose();
                }}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-bold text-slate-800 active:bg-slate-50"
              >
                Přejít na dnes
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  const wk = startOfWeekLocal(startOfDayLocal(anchorDate), firstDayOfWeek);
                  setAnchorDate(wk);
                  onClose();
                }}
                className="flex min-h-[48px] items-center justify-between rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-bold text-slate-800 active:bg-slate-50"
              >
                Začátek tohoto týdne
                <ChevronRight size={16} className="text-slate-400" />
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigatePeriod(-1);
                  onClose();
                }}
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-xs font-bold text-slate-600"
              >
                ← Předchozí období
              </button>
              <button
                type="button"
                onClick={() => {
                  onNavigatePeriod(1);
                  onClose();
                }}
                className="flex min-h-[44px] items-center justify-center rounded-xl border border-slate-100 bg-slate-50 text-xs font-bold text-slate-600"
              >
                Následující období →
              </button>
            </div>
          </div>

          <CalendarMiniMonth
            anchorDate={anchorDate}
            firstDayOfWeek={firstDayOfWeek}
            todayStr={todayStr}
            onPickDay={(d) => {
              setAnchorDate(d);
              onClose();
            }}
          />

          <div>
            <p className="mb-2 text-[10px] font-black uppercase tracking-widest text-slate-400">Filtry typů</p>
            <p className="mb-2 text-xs text-slate-500">Skryté typy se nezobrazí v mřížce ani v agendě.</p>
            <div className="flex flex-col gap-1.5">
              {CALENDAR_EVENT_CATEGORIES.map((cat) => {
                const hidden = hiddenEventTypes.has(cat.id);
                return (
                  <button
                    key={cat.id}
                    type="button"
                    onClick={() => toggleEventTypeHidden(cat.id)}
                    className={cx(
                      "flex min-h-[44px] items-center gap-2 rounded-xl border px-3 text-left text-sm font-bold transition-colors active:scale-[0.99]",
                      hidden ? "border-slate-200 bg-slate-100 text-slate-400 line-through" : "border-slate-200 bg-white text-slate-800",
                    )}
                  >
                    <span>{cat.icon}</span>
                    <span className="flex-1">{cat.label}</span>
                    <span className="text-[10px] font-bold uppercase text-slate-400">{hidden ? "Vypnuto" : "Zapnuto"}</span>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="space-y-2 border-t border-slate-100 pt-4">
            {onOpenGlobalAppMenu ? (
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenGlobalAppMenu();
                }}
                className="flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-left text-sm font-bold text-slate-800 active:bg-slate-50"
              >
                <Menu size={18} className="text-slate-600" />
                Hlavní menu aplikace
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                onOpenSettings();
                onClose();
              }}
              className="flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-indigo-100 bg-indigo-50/80 px-3 text-left text-sm font-bold text-indigo-800"
            >
              <Settings2 size={18} />
              Nastavení vzhledu kalendáře
            </button>
            {!googleConnected ? (
              <a
                href="/api/integrations/google-calendar/connect"
                className="flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 text-sm font-bold text-slate-800"
              >
                <RefreshCw size={16} className="text-slate-500" />
                Připojit Google kalendář
              </a>
            ) : null}
            {googleConnected && onSyncCalendar ? (
              <button
                type="button"
                disabled={syncBusy}
                onClick={() => onSyncCalendar()}
                className="flex min-h-[48px] w-full items-center gap-2 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 text-left text-sm font-bold text-emerald-900 disabled:opacity-60"
              >
                <RefreshCw size={16} className={syncBusy ? "animate-spin text-emerald-700" : "text-emerald-700"} />
                {syncBusy ? "Synchronizuji…" : "Synchronizovat s Google"}
              </button>
            ) : null}
            {!onOpenGlobalAppMenu ? (
              <p className="text-[10px] leading-relaxed text-slate-500">
                Globální menu je v horní liště portálu (ikona menu).
              </p>
            ) : null}
          </div>
        </div>
      </aside>
    </>
  );
}
