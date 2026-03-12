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
}

export const CALENDAR_EVENT_CATEGORIES: EventCategory[] = [
  { id: "schuzka", label: "Schůzka", icon: "📅", color: "#579bfc", calClass: "wp-cal-event--primary" },
  { id: "telefonat", label: "Telefonát", icon: "📞", color: "#fdab3d", calClass: "wp-cal-event--warning" },
  { id: "kafe", label: "Kafe", icon: "☕", color: "#ff642e", calClass: "wp-cal-event--danger" },
  { id: "mail", label: "E-mail", icon: "✉️", color: "#a25ddc", calClass: "wp-cal-event--info" },
  { id: "ukol", label: "Úkol", icon: "✅", color: "#00c875", calClass: "wp-cal-event--success" },
  { id: "priorita", label: "Priorita", icon: "⭐", color: "#e5534b", calClass: "wp-cal-event--danger" },
  { id: "servis", label: "Servis", icon: "🔧", color: "#00a86b", calClass: "wp-cal-event--success" },
  { id: "interni", label: "Interní blok", icon: "🏢", color: "#6b7280", calClass: "wp-cal-event--muted" },
  { id: "administrativa", label: "Administrativa", icon: "📋", color: "#6366f1", calClass: "wp-cal-event--info" },
  { id: "review", label: "Review", icon: "📊", color: "#0ea5e9", calClass: "wp-cal-event--info" },
  { id: "followup", label: "Follow-up", icon: "🔄", color: "#8b5cf6", calClass: "wp-cal-event--info" },
  { id: "osobni", label: "Osobní blok", icon: "👤", color: "#64748b", calClass: "wp-cal-event--muted" },
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
