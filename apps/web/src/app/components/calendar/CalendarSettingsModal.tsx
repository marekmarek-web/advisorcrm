"use client";

import { useState, useEffect } from "react";
import { BaseModal } from "@/app/components/BaseModal";
import type { CalendarSettings, CalendarPresetId, TodayStyle, CalendarFontSize } from "@/app/portal/calendar/calendar-settings";
import { getPresetSettings, ensureAccentLight } from "@/app/portal/calendar/calendar-settings";

const PRESET_OPTIONS: { id: CalendarPresetId; label: string }[] = [
  { id: "default", label: "WePlan výchozí" },
  { id: "minimal", label: "Minimal" },
  { id: "contrast", label: "Kontrastní" },
];

const TODAY_STYLE_OPTIONS: { id: TodayStyle; label: string }[] = [
  { id: "pill", label: "Kolečko" },
  { id: "underline", label: "Podtržení" },
  { id: "background", label: "Podbarvení" },
];

const FONT_SIZE_OPTIONS: { id: CalendarFontSize; label: string }[] = [
  { id: "small", label: "Malé" },
  { id: "base", label: "Střední" },
  { id: "large", label: "Velké" },
];

const ACCENT_SWATCHES = [
  "#485fed",
  "#00a86b",
  "#e5534b",
  "#fdab3d",
  "#4a4a4a",
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

  return (
    <BaseModal open={open} onClose={onClose} title="Nastavení kalendáře" maxWidth="md">
      <form onSubmit={handleSubmit} className="flex flex-col">
        <div className="px-5 py-4 space-y-5 overflow-y-auto max-h-[70vh]">
          {/* Předvolby */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--wp-text)" }}>
              Předvolby
            </label>
            <div className="flex flex-wrap gap-2">
              {PRESET_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => handlePresetChange(id)}
                  className="px-3 py-1.5 rounded-[var(--wp-radius-sm)] text-sm border transition-colors"
                  style={{
                    borderColor: form.preset === id ? "var(--wp-cal-accent)" : "var(--wp-border)",
                    background: form.preset === id ? "var(--wp-cal-accent-light)" : "transparent",
                    color: form.preset === id ? "var(--wp-cal-accent)" : "var(--wp-text)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Barvy – accent */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--wp-text)" }}>
              Barva zvýraznění
            </label>
            <div className="flex flex-wrap items-center gap-3">
              {ACCENT_SWATCHES.map((color) => (
                <button
                  key={color}
                  type="button"
                  onClick={() => handleAccentChange(color)}
                  className="w-8 h-8 rounded-full border-2 border-white shadow-sm transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    borderColor: form.accent === color ? "var(--wp-text)" : "transparent",
                  }}
                  aria-label={color}
                />
              ))}
              <label className="flex items-center gap-2">
                <input
                  type="color"
                  value={form.accent}
                  onChange={(e) => handleAccentChange(e.target.value)}
                  className="w-8 h-8 rounded cursor-pointer border border-gray-300"
                />
                <input
                  type="text"
                  value={form.accent}
                  onChange={(e) => handleAccentChange(e.target.value)}
                  className="wp-input w-24 text-sm font-mono"
                  placeholder="#485fed"
                />
              </label>
            </div>
          </div>

          {/* Čísla a formát */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--wp-text)" }}>
              Čísla a formát
            </label>
            <div className="space-y-3">
              <div>
                <span className="text-xs text-[var(--wp-text-muted)] block mb-1">První den týdne</span>
                <div className="flex gap-2">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="firstDayOfWeek"
                      checked={form.firstDayOfWeek === 1}
                      onChange={() => setForm((f) => ({ ...f, firstDayOfWeek: 1 }))}
                      className="rounded-full"
                    />
                    <span className="text-sm">Pondělí</span>
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="radio"
                      name="firstDayOfWeek"
                      checked={form.firstDayOfWeek === 0}
                      onChange={() => setForm((f) => ({ ...f, firstDayOfWeek: 0 }))}
                      className="rounded-full"
                    />
                    <span className="text-sm">Neděle</span>
                  </label>
                </div>
              </div>
              <label className="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.showWeekNumbers}
                  onChange={(e) => setForm((f) => ({ ...f, showWeekNumbers: e.target.checked }))}
                  className="rounded"
                />
                <span className="text-sm">Zobrazit čísla týdne</span>
              </label>
            </div>
          </div>

          {/* Typografie */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--wp-text)" }}>
              Velikost písma v kalendáři
            </label>
            <div className="flex flex-wrap gap-2">
              {FONT_SIZE_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, fontSize: id }))}
                  className="px-3 py-1.5 rounded-[var(--wp-radius-sm)] text-sm border transition-colors"
                  style={{
                    borderColor: form.fontSize === id ? "var(--wp-cal-accent)" : "var(--wp-border)",
                    background: form.fontSize === id ? "var(--wp-cal-accent-light)" : "transparent",
                    color: form.fontSize === id ? "var(--wp-cal-accent)" : "var(--wp-text)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Označování – dnešek */}
          <div>
            <label className="block text-sm font-medium mb-2" style={{ color: "var(--wp-text)" }}>
              Označení dnešního dne
            </label>
            <div className="flex flex-wrap gap-2">
              {TODAY_STYLE_OPTIONS.map(({ id, label }) => (
                <button
                  key={id}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, todayStyle: id }))}
                  className="px-3 py-1.5 rounded-[var(--wp-radius-sm)] text-sm border transition-colors"
                  style={{
                    borderColor: form.todayStyle === id ? "var(--wp-cal-accent)" : "var(--wp-border)",
                    background: form.todayStyle === id ? "var(--wp-cal-accent-light)" : "transparent",
                    color: form.todayStyle === id ? "var(--wp-cal-accent)" : "var(--wp-text)",
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          </div>
        </div>

        <div className="px-5 py-4 border-t flex justify-end gap-2" style={{ borderColor: "var(--wp-border)" }}>
          <button type="button" onClick={onClose} className="wp-btn" style={{ background: "var(--wp-bg)", color: "var(--wp-text)" }}>
            Zrušit
          </button>
          <button type="submit" className="wp-btn wp-btn-primary">
            Uložit
          </button>
        </div>
      </form>
    </BaseModal>
  );
}
