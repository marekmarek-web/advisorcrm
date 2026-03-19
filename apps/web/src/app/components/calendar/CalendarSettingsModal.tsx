"use client";

import { useState, useEffect } from "react";
import { Calendar, X, Check } from "lucide-react";
import type { CalendarSettings, CalendarPresetId, CalendarFontSize } from "@/app/portal/calendar/calendar-settings";
import { getPresetSettings, ensureAccentLight } from "@/app/portal/calendar/calendar-settings";
import { CALENDAR_EVENT_CATEGORIES } from "@/app/portal/calendar/event-categories";

const PRESET_OPTIONS: { id: CalendarPresetId; label: string }[] = [
  { id: "default", label: "Aidvisora výchozí" },
  { id: "minimal", label: "Minimal" },
  { id: "contrast", label: "Kontrastní" },
];

const FONT_SIZE_OPTIONS: { id: CalendarFontSize; label: string }[] = [
  { id: "small", label: "Malé" },
  { id: "base", label: "Střední" },
  { id: "large", label: "Velké" },
];

const ACCENT_COLORS = [
  { id: "blue", hex: "#485fed", ring: "ring-[#485fed]" },
  { id: "green", hex: "#10b981", ring: "ring-[#10b981]" },
  { id: "red", hex: "#ef4444", ring: "ring-[#ef4444]" },
  { id: "orange", hex: "#f59e0b", ring: "ring-[#f59e0b]" },
  { id: "dark", hex: "#334155", ring: "ring-[#334155]" },
];

const EVENT_COLOR_PALETTE = [
  "#60a5fa", "#fbbf24", "#fb923c", "#a78bfa", "#34d399",
  "#f43f5e", "#10b981", "#64748b", "#818cf8", "#0ea5e9",
];

export interface CalendarSettingsModalProps {
  open: boolean;
  onClose: () => void;
  initialSettings: CalendarSettings;
  onSave: (settings: CalendarSettings) => void;
}

export function CalendarSettingsModal({
  open,
  onClose,
  initialSettings,
  onSave,
}: CalendarSettingsModalProps) {
  const [form, setForm] = useState<CalendarSettings>({ ...initialSettings });

  useEffect(() => {
    if (open) setForm({ ...initialSettings });
  }, [open, initialSettings]);

  const handlePresetChange = (presetId: CalendarPresetId) => {
    const next = getPresetSettings(presetId);
    setForm({ ...next });
  };

  const handleAccentChange = (accent: string) => {
    setForm((prev) => ({
      ...prev,
      accent,
      accentLight: ensureAccentLight(accent, prev.accentLight),
    }));
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const toSave: CalendarSettings = {
      ...form,
      accentLight: form.accentLight || ensureAccentLight(form.accent),
    };
    onSave(toSave);
    onClose();
  };

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center p-4 sm:p-8 bg-slate-900/40 backdrop-blur-sm">
      <style>{`
        .cal-settings-check {
          appearance: none; width: 20px; height: 20px; border: 2px solid #cbd5e1;
          border-radius: 6px; background-color: white; cursor: pointer;
          position: relative; transition: all 0.2s ease;
        }
        .cal-settings-check:checked { background-color: #4f46e5; border-color: #4f46e5; box-shadow: 0 4px 10px rgba(79, 70, 229, 0.3); }
        .cal-settings-check:checked::after {
          content: ''; position: absolute; left: 5px; top: 1px; width: 6px; height: 11px;
          border: solid white; border-width: 0 2.5px 2.5px 0; transform: rotate(45deg);
        }
        .cal-settings-radio {
          appearance: none; width: 20px; height: 20px; border: 2px solid #cbd5e1;
          border-radius: 50%; background-color: white; cursor: pointer;
          position: relative; transition: all 0.2s ease;
        }
        .cal-settings-radio:checked { border-color: #4f46e5; }
        .cal-settings-radio:checked::after {
          content: ''; position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
          width: 10px; height: 10px; background-color: #4f46e5; border-radius: 50%;
        }
        .cal-settings-scroll::-webkit-scrollbar { display: none; }
        .cal-settings-scroll { -ms-overflow-style: none; scrollbar-width: none; }
      `}</style>

      <div
        className="w-full max-w-[640px] bg-white rounded-[32px] shadow-2xl shadow-indigo-900/10 border border-slate-100 overflow-hidden flex flex-col max-h-[90vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="px-8 py-6 border-b border-slate-100 flex items-center justify-between bg-slate-50/50 flex-shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-50 text-indigo-600 flex items-center justify-center shadow-inner">
              <Calendar size={20} />
            </div>
            <h2 className="text-xl font-black text-slate-900 tracking-tight">Nastavení kalendáře</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full flex items-center justify-center text-slate-400 hover:bg-slate-200 hover:text-slate-700 transition-colors"
          >
            <X size={18} />
          </button>
        </div>

        {/* Content */}
        <form onSubmit={handleSubmit} className="flex flex-col flex-1 min-h-0">
          <div className="p-8 overflow-y-auto cal-settings-scroll space-y-10 flex-1">

            {/* Predvolby */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Předvolby</h3>
              <div className="flex flex-wrap gap-2">
                {PRESET_OPTIONS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => handlePresetChange(t.id)}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all border
                      ${form.preset === t.id ? "bg-indigo-50 border-indigo-500 text-indigo-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}
                    `}
                  >
                    {t.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Barva zvyrazneni */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Barva zvýraznění</h3>
              <div className="flex flex-wrap items-center gap-4">
                <div className="flex items-center gap-3">
                  {ACCENT_COLORS.map((color) => (
                    <button
                      key={color.id}
                      type="button"
                      onClick={() => handleAccentChange(color.hex)}
                      style={{ backgroundColor: color.hex }}
                      className={`w-9 h-9 rounded-full transition-all border-2 border-white shadow-sm
                        ${form.accent === color.hex ? `ring-2 ring-offset-2 ${color.ring} scale-110` : "hover:scale-110"}
                      `}
                    />
                  ))}
                </div>
                <div className="flex items-center gap-2 bg-slate-50 p-1.5 rounded-xl border border-slate-200 w-36">
                  <div className="w-6 h-6 rounded-lg border border-slate-200 shadow-inner" style={{ backgroundColor: form.accent }} />
                  <input
                    type="text"
                    value={form.accent}
                    onChange={(e) => handleAccentChange(e.target.value)}
                    className="bg-transparent border-none outline-none text-sm font-bold text-slate-700 w-full uppercase"
                  />
                </div>
              </div>
            </div>

            {/* Cisla a format */}
            <div className="space-y-5">
              <h3 className="text-sm font-bold text-slate-800">Čísla a formát</h3>
              <div className="space-y-3">
                <p className="text-xs font-bold text-slate-500 uppercase tracking-widest">První den týdne</p>
                <div className="flex items-center gap-6">
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="firstDay"
                      checked={form.firstDayOfWeek === 1}
                      onChange={() => setForm((f) => ({ ...f, firstDayOfWeek: 1 }))}
                      className="cal-settings-radio"
                    />
                    <span className={`text-sm transition-colors ${form.firstDayOfWeek === 1 ? "font-bold text-slate-800" : "font-medium text-slate-600 group-hover:text-slate-800"}`}>Pondělí</span>
                  </label>
                  <label className="flex items-center gap-3 cursor-pointer group">
                    <input
                      type="radio"
                      name="firstDay"
                      checked={form.firstDayOfWeek === 0}
                      onChange={() => setForm((f) => ({ ...f, firstDayOfWeek: 0 }))}
                      className="cal-settings-radio"
                    />
                    <span className={`text-sm transition-colors ${form.firstDayOfWeek === 0 ? "font-bold text-slate-800" : "font-medium text-slate-600 group-hover:text-slate-800"}`}>Neděle</span>
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-3 cursor-pointer group mt-2">
                <input
                  type="checkbox"
                  checked={form.showWeekNumbers}
                  onChange={(e) => setForm((f) => ({ ...f, showWeekNumbers: e.target.checked }))}
                  className="cal-settings-check"
                />
                <span className={`text-sm transition-colors ${form.showWeekNumbers ? "font-bold text-slate-800" : "font-medium text-slate-600 group-hover:text-slate-800"}`}>Zobrazit čísla týdne</span>
              </label>
            </div>

            {/* Velikost pisma */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Velikost písma v kalendáři</h3>
              <div className="flex flex-wrap gap-2">
                {FONT_SIZE_OPTIONS.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setForm((f) => ({ ...f, fontSize: s.id }))}
                    className={`px-5 py-2.5 rounded-xl text-sm font-bold transition-all border
                      ${form.fontSize === s.id ? "bg-blue-50 border-blue-500 text-blue-700 shadow-sm" : "bg-white border-slate-200 text-slate-600 hover:bg-slate-50"}
                    `}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {/* Cara aktualniho casu */}
            <div className="space-y-3">
              <h3 className="text-sm font-bold text-slate-800">Čára aktuálního času</h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 w-12 pl-2">Barva</span>
                  <div className="w-6 h-6 rounded-md border border-slate-200 shrink-0" style={{ backgroundColor: form.currentTimeLineColor ?? "#e5534b" }} />
                  <input
                    type="text"
                    value={form.currentTimeLineColor ?? "#e5534b"}
                    onChange={(e) => setForm((f) => ({ ...f, currentTimeLineColor: e.target.value }))}
                    className="bg-transparent border-none outline-none text-sm font-bold text-slate-700 w-full uppercase"
                  />
                </div>
                <div className="flex items-center gap-3 bg-slate-50 p-2 rounded-xl border border-slate-200">
                  <span className="text-xs font-bold text-slate-500 w-16 pl-2">Tloušťka</span>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={form.currentTimeLineWidth ?? 2}
                    onChange={(e) => setForm((f) => ({ ...f, currentTimeLineWidth: Math.min(5, Math.max(1, Number(e.target.value) || 2)) }))}
                    className="bg-transparent border-none outline-none text-sm font-bold text-slate-700 w-full"
                  />
                  <span className="text-xs font-bold text-slate-400 pr-3">px</span>
                </div>
              </div>
            </div>

            {/* Barvy typu udalosti */}
            <div className="space-y-4 pt-2">
              <div>
                <h3 className="text-sm font-bold text-slate-800">Barvy typů událostí</h3>
                <p className="text-xs font-medium text-slate-500 mt-1">Vyberte barvu z palety. Klik na stejnou barvu zruší výběr (výchozí barva typu).</p>
              </div>
              <div className="space-y-5">
                {CALENDAR_EVENT_CATEGORIES.filter((c) => ["schuzka", "telefonat", "kafe", "mail"].includes(c.id)).map((cat) => {
                  const current = form.eventTypeColors?.[cat.id] ?? cat.color;
                  return (
                    <div key={cat.id} className="flex flex-col sm:flex-row sm:items-center gap-3">
                      <div className="w-24 text-sm font-bold text-slate-700 shrink-0">{cat.label}</div>
                      <div className="flex items-center gap-2.5 overflow-x-auto cal-settings-scroll pb-1">
                        <div
                          className="w-6 h-6 rounded-md shrink-0 border border-slate-200 transition-all"
                          style={{ backgroundColor: current }}
                        />
                        <div className="w-px h-6 bg-slate-200 mx-1" />
                        {EVENT_COLOR_PALETTE.map((c) => {
                          const isSelected = current === c;
                          return (
                            <button
                              key={c}
                              type="button"
                              onClick={() =>
                                setForm((f) => {
                                  const next = { ...(f.eventTypeColors ?? {}) };
                                  if (next[cat.id] === c) delete next[cat.id];
                                  else next[cat.id] = c;
                                  return { ...f, eventTypeColors: Object.keys(next).length ? next : undefined };
                                })
                              }
                              className={`w-7 h-7 rounded-full shrink-0 transition-all border-2 border-white
                                ${isSelected ? "ring-2 ring-blue-500 shadow-sm scale-110" : "hover:scale-110 shadow-sm"}
                              `}
                              style={{ backgroundColor: c }}
                            />
                          );
                        })}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="px-8 py-5 bg-slate-50/80 border-t border-slate-100 flex items-center justify-end gap-3 flex-shrink-0">
            <button
              type="button"
              onClick={onClose}
              className="px-6 py-2.5 bg-white border border-slate-200 text-slate-700 rounded-xl text-sm font-bold hover:bg-slate-50 transition-colors shadow-sm"
            >
              Zrušit
            </button>
            <button
              type="submit"
              className="flex items-center gap-2 px-8 py-2.5 bg-[#0060ff] text-white rounded-xl text-sm font-bold shadow-md shadow-blue-500/20 hover:bg-[#0050d0] transition-colors"
            >
              <Check size={16} /> Uložit
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
