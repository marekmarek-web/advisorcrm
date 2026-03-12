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
}

export const CALENDAR_EVENT_CATEGORIES: EventCategory[] = [
  { id: "schuzka", label: "Schůzka", icon: "📅", color: "#579bfc", calClass: "wp-cal-event--primary", tailwindClass: "bg-indigo-100 text-indigo-800 border-indigo-300" },
  { id: "telefonat", label: "Telefonát", icon: "📞", color: "#fdab3d", calClass: "wp-cal-event--warning", tailwindClass: "bg-blue-50 text-blue-700 border-blue-200" },
  { id: "kafe", label: "Kafe", icon: "☕", color: "#ff642e", calClass: "wp-cal-event--danger", tailwindClass: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "mail", label: "E-mail", icon: "✉️", color: "#a25ddc", calClass: "wp-cal-event--info", tailwindClass: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "ukol", label: "Úkol", icon: "✅", color: "#00c875", calClass: "wp-cal-event--success", tailwindClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { id: "priorita", label: "Priorita", icon: "⭐", color: "#e5534b", calClass: "wp-cal-event--danger", tailwindClass: "bg-rose-50 text-rose-700 border-rose-200" },
  { id: "servis", label: "Servis", icon: "🔧", color: "#00a86b", calClass: "wp-cal-event--success", tailwindClass: "bg-emerald-100 text-emerald-800 border-emerald-300" },
  { id: "interni", label: "Interní blok", icon: "🏢", color: "#6b7280", calClass: "wp-cal-event--muted", tailwindClass: "bg-slate-100 text-slate-700 border-slate-200" },
  { id: "administrativa", label: "Administrativa", icon: "📋", color: "#6366f1", calClass: "wp-cal-event--info", tailwindClass: "bg-amber-50 text-amber-700 border-amber-200" },
  { id: "review", label: "Review", icon: "📊", color: "#0ea5e9", calClass: "wp-cal-event--info", tailwindClass: "bg-sky-100 text-sky-800 border-sky-300" },
  { id: "followup", label: "Follow-up", icon: "🔄", color: "#8b5cf6", calClass: "wp-cal-event--info", tailwindClass: "bg-violet-100 text-violet-800 border-violet-300" },
  { id: "osobni", label: "Osobní blok", icon: "👤", color: "#64748b", calClass: "wp-cal-event--muted", tailwindClass: "bg-slate-100 text-slate-600 border-slate-200" },
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

/** Event status for display and edit. */
export const EVENT_STATUSES = [
  { id: "scheduled", label: "Naplánováno" },
  { id: "confirmed", label: "Potvrzeno" },
  { id: "done", label: "Hotovo" },
  { id: "cancelled", label: "Zrušeno" },
] as const;

export type EventStatusId = (typeof EVENT_STATUSES)[number]["id"];
