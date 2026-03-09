/**
 * Calendar settings: type, defaults, presets, load/save to localStorage.
 * Key: weplan_calendar_settings
 */

export type CalendarPresetId = "default" | "minimal" | "contrast";

export type TodayStyle = "pill" | "underline" | "background";

export type CalendarFontSize = "small" | "base" | "large";

export interface CalendarSettings {
  preset: CalendarPresetId;
  accent: string;
  accentLight: string;
  firstDayOfWeek: 0 | 1;
  showWeekNumbers: boolean;
  fontSize: CalendarFontSize;
  todayStyle: TodayStyle;
}

const STORAGE_KEY = "weplan_calendar_settings";

function hexToRgba(hex: string, alpha: number): string {
  const m = hex.match(/^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i);
  if (!m) return hex;
  const r = parseInt(m[1], 16);
  const g = parseInt(m[2], 16);
  const b = parseInt(m[3], 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export const DEFAULT_SETTINGS: CalendarSettings = {
  preset: "default",
  accent: "#485fed",
  accentLight: "rgba(72, 95, 237, 0.12)",
  firstDayOfWeek: 1,
  showWeekNumbers: true,
  fontSize: "base",
  todayStyle: "pill",
};

export const CALENDAR_PRESETS: Record<CalendarPresetId, CalendarSettings> = {
  default: {
    ...DEFAULT_SETTINGS,
    preset: "default",
    accent: "#485fed",
    accentLight: "rgba(72, 95, 237, 0.12)",
    todayStyle: "pill",
    fontSize: "base",
  },
  minimal: {
    ...DEFAULT_SETTINGS,
    preset: "minimal",
    accent: "#4a4a4a",
    accentLight: "rgba(74, 74, 74, 0.1)",
    todayStyle: "underline",
    fontSize: "small",
  },
  contrast: {
    ...DEFAULT_SETTINGS,
    preset: "contrast",
    accent: "#00a86b",
    accentLight: "rgba(0, 168, 107, 0.15)",
    todayStyle: "background",
    fontSize: "base",
  },
};

export function loadCalendarSettings(): CalendarSettings {
  if (typeof window === "undefined") return { ...DEFAULT_SETTINGS };
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULT_SETTINGS };
    const parsed = JSON.parse(raw) as Partial<CalendarSettings>;
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      firstDayOfWeek: parsed.firstDayOfWeek === 0 ? 0 : 1,
    };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveCalendarSettings(settings: CalendarSettings): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore
  }
}

/** Apply preset to current form values (for modal). */
export function getPresetSettings(presetId: CalendarPresetId): CalendarSettings {
  return { ...CALENDAR_PRESETS[presetId] };
}

/** Derive accentLight from accent hex if not provided. */
export function ensureAccentLight(accent: string, accentLight?: string): string {
  if (accentLight) return accentLight;
  return hexToRgba(accent.startsWith("#") ? accent : `#${accent}`, 0.12);
}
