import type { CSSProperties } from "react";

/**
 * Central map of calendar event categories and styles.
 * Single source of truth for activity types, colors, and CSS classes.
 */

export type EventCategoryId =
  | "schuzka"
  | "telefonat"
  | "kafe"
  | "mail"
  | "ukol"
  | "priorita"
  | "servis"
  | "interni"
  | "administrativa"
  | "review"
  | "followup"
  | "osobni";

export interface EventCategory {
  id: EventCategoryId;
  label: string;
  icon: string;
  color: string;
  /** CSS class for event block (e.g. wp-cal-event--primary) */
  calClass: string;
  /** Tailwind classes for kalendar.txt-style event blocks (bg-* text-* border-*) */
  tailwindClass: string;
  chipTheme: {
    active: string;
    inactive: string;
  };
}

export const CALENDAR_EVENT_CATEGORIES: EventCategory[] = [
  { id: "schuzka", label: "Schůzka", icon: "📅", color: "#579bfc", calClass: "wp-cal-event--primary", tailwindClass: "bg-indigo-100 text-indigo-800 border-indigo-300", chipTheme: { active: "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-200", inactive: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" } },
  { id: "telefonat", label: "Telefonát", icon: "📞", color: "#fdab3d", calClass: "wp-cal-event--warning", tailwindClass: "bg-blue-50 text-blue-700 border-blue-200", chipTheme: { active: "border-rose-500 bg-rose-500 text-white shadow-lg shadow-rose-200", inactive: "border-rose-200 bg-rose-50 text-rose-600 hover:bg-rose-100" } },
  { id: "kafe", label: "Kafe", icon: "☕", color: "#ff642e", calClass: "wp-cal-event--danger", tailwindClass: "bg-amber-50 text-amber-700 border-amber-200", chipTheme: { active: "border-amber-500 bg-amber-500 text-white shadow-lg shadow-amber-200", inactive: "border-amber-200 bg-amber-50 text-amber-700 hover:bg-amber-100" } },
  { id: "mail", label: "E-mail", icon: "✉️", color: "#a25ddc", calClass: "wp-cal-event--info", tailwindClass: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]", chipTheme: { active: "border-purple-600 bg-purple-600 text-white shadow-lg shadow-purple-200", inactive: "border-purple-200 bg-purple-50 text-purple-700 hover:bg-purple-100" } },
  { id: "ukol", label: "Úkol", icon: "✅", color: "#00c875", calClass: "wp-cal-event--success", tailwindClass: "bg-emerald-100 text-emerald-800 border-emerald-300", chipTheme: { active: "border-emerald-600 bg-emerald-600 text-white shadow-lg shadow-emerald-200", inactive: "border-emerald-200 bg-emerald-50 text-emerald-700 hover:bg-emerald-100" } },
  { id: "priorita", label: "Priorita", icon: "⭐", color: "#e5534b", calClass: "wp-cal-event--danger", tailwindClass: "bg-rose-50 text-rose-700 border-rose-200", chipTheme: { active: "border-red-600 bg-red-600 text-white shadow-lg shadow-red-200", inactive: "border-red-200 bg-red-50 text-red-700 hover:bg-red-100" } },
  { id: "servis", label: "Servis", icon: "🔧", color: "#00a86b", calClass: "wp-cal-event--success", tailwindClass: "bg-emerald-100 text-emerald-800 border-emerald-300", chipTheme: { active: "border-teal-600 bg-teal-600 text-white shadow-lg shadow-teal-200", inactive: "border-teal-200 bg-teal-50 text-teal-700 hover:bg-teal-100" } },
  { id: "interni", label: "Interní blok", icon: "🏢", color: "#6b7280", calClass: "wp-cal-event--muted", tailwindClass: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]", chipTheme: { active: "border-slate-600 bg-slate-600 text-white shadow-lg shadow-slate-200", inactive: "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]" } },
  { id: "administrativa", label: "Administrativa", icon: "📋", color: "#6366f1", calClass: "wp-cal-event--info", tailwindClass: "bg-amber-50 text-amber-700 border-amber-200", chipTheme: { active: "border-indigo-600 bg-indigo-600 text-white shadow-lg shadow-indigo-200", inactive: "border-indigo-200 bg-indigo-50 text-indigo-700 hover:bg-indigo-100" } },
  { id: "review", label: "Review", icon: "📊", color: "#0ea5e9", calClass: "wp-cal-event--info", tailwindClass: "bg-sky-100 text-sky-800 border-sky-300", chipTheme: { active: "border-sky-600 bg-sky-600 text-white shadow-lg shadow-sky-200", inactive: "border-sky-200 bg-sky-50 text-sky-700 hover:bg-sky-100" } },
  { id: "followup", label: "Follow-up", icon: "🔄", color: "#8b5cf6", calClass: "wp-cal-event--info", tailwindClass: "bg-violet-100 text-violet-800 border-violet-300", chipTheme: { active: "border-violet-600 bg-violet-600 text-white shadow-lg shadow-violet-200", inactive: "border-violet-200 bg-violet-50 text-violet-700 hover:bg-violet-100" } },
  { id: "osobni", label: "Osobní blok", icon: "👤", color: "#64748b", calClass: "wp-cal-event--muted", tailwindClass: "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] border-[color:var(--wp-surface-card-border)]", chipTheme: { active: "border-slate-500 bg-slate-500 text-white shadow-lg shadow-slate-200", inactive: "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]" } },
];

const byId = new Map<string, EventCategory>(
  CALENDAR_EVENT_CATEGORIES.map((c) => [c.id, c])
);

/** Get category by id; falls back to first (schuzka) if unknown. */
export function getEventCategory(id: string | null | undefined): EventCategory {
  if (!id) return CALENDAR_EVENT_CATEGORIES[0];
  return byId.get(id) ?? CALENDAR_EVENT_CATEGORIES[0];
}

export interface EventStyle {
  color: string;
  calClass: string;
  tailwindClass: string;
  icon: string;
  label: string;
}

/** Get style for rendering (color, class, icon, label). Optional colorOverride for per-event custom color. */
export function getEventStyle(
  categoryId: string | null | undefined,
  colorOverride?: string | null
): EventStyle {
  const cat = getEventCategory(categoryId);
  return {
    color: colorOverride?.trim() || cat.color,
    calClass: cat.calClass,
    tailwindClass: cat.tailwindClass,
    icon: cat.icon,
    label: cat.label,
  };
}

function hexToRgba(hex: string, alpha: number): string {
  const trimmed = hex.trim();
  const normalized = trimmed.startsWith("#") ? trimmed.slice(1) : trimmed;
  if (!/^[a-f\d]{6}$/i.test(normalized)) return hex;
  const r = Number.parseInt(normalized.slice(0, 2), 16);
  const g = Number.parseInt(normalized.slice(2, 4), 16);
  const b = Number.parseInt(normalized.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

export function getChipClasses(
  categoryId: string | null | undefined,
  isActive: boolean,
  colorOverride?: string | null,
): string {
  const cat = getEventCategory(categoryId);
  const base = "border transition-all";
  if (isActive && colorOverride?.trim()) {
    return `${base} text-white shadow-lg`;
  }
  return `${base} ${isActive ? cat.chipTheme.active : cat.chipTheme.inactive}`;
}

export function getChipInlineStyle(
  categoryId: string | null | undefined,
  isActive: boolean,
  colorOverride?: string | null,
): CSSProperties | undefined {
  if (!isActive || !colorOverride?.trim()) return undefined;
  return {
    backgroundColor: colorOverride,
    borderColor: colorOverride,
    boxShadow: `0 10px 25px -12px ${hexToRgba(colorOverride, 0.65)}`,
  };
}

/** Event status for display and edit. */
export const EVENT_STATUSES = [
  { id: "scheduled", label: "Naplánováno" },
  { id: "confirmed", label: "Potvrzeno" },
  { id: "done", label: "Hotovo" },
  { id: "cancelled", label: "Zrušeno" },
] as const;

export type EventStatusId = (typeof EVENT_STATUSES)[number]["id"];
