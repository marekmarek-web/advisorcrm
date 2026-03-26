/**
 * Katalog rychlých akcí pro tlačítko „+ Nový“ v headeru a postranní Zap nabídku.
 * Jediný zdroj pravdy – sdílený mezi PortalShell, PortalSidebar a stránkou Nastavení.
 * icon: název pro mapování na Lucide ikonu v QuickNewMenu (UserPlus, Briefcase, CheckSquare, CalendarPlus, …).
 * iconColor: Tailwind třída pro barvu ikony (text-blue-500, text-amber-500, …).
 */
export type QuickActionId =
  | "new_task"
  | "new_meeting"
  | "new_contact"
  | "new_deal"
  | "calendar"
  | "mindmap"
  | "note"
  | "document"
  | "household";

export type QuickActionItem = {
  id: QuickActionId;
  label: string;
  href: string;
  /** Název ikony pro QuickNewMenu (UserPlus | Briefcase | CheckSquare | CalendarPlus | …) */
  iconName?: "UserPlus" | "Briefcase" | "CheckSquare" | "CalendarPlus" | "Calendar" | "Network" | "StickyNote" | "FileText" | "Building";
  /** Tailwind text color třída pro ikonu */
  iconColor?: string;
  /** Tailwind třídy pro hover animaci (1:1 jako sidebar), např. group-hover:scale-110 */
  hoverAnim?: string;
};

/** Výchozí pořadí: nejpoužívanější nahoře; „Dokument“ až dole. */
export const QUICK_ACTIONS_CATALOG: QuickActionItem[] = [
  { id: "note", label: "Rychlý zápisek", href: "/portal/notes", iconName: "StickyNote", iconColor: "text-amber-500", hoverAnim: "group-hover:translate-x-1" },
  { id: "new_task", label: "Rychlý úkol", href: "/portal/tasks#new-task-form", iconName: "CheckSquare", iconColor: "text-emerald-500", hoverAnim: "group-hover:rotate-12 group-hover:scale-110" },
  { id: "new_meeting", label: "Nová schůzka", href: "/portal/calendar?new=1", iconName: "CalendarPlus", iconColor: "text-indigo-500", hoverAnim: "group-hover:-translate-y-1 group-hover:scale-110" },
  { id: "new_contact", label: "Nový klient", href: "/portal/contacts?newClient=1", iconName: "UserPlus", iconColor: "text-blue-500", hoverAnim: "group-hover:scale-110" },
  { id: "new_deal", label: "Nový obchod", href: "/portal/pipeline", iconName: "Briefcase", iconColor: "text-amber-500", hoverAnim: "group-hover:rotate-[-12deg] group-hover:scale-110" },
  { id: "calendar", label: "Kalendář", href: "/portal/calendar", iconName: "Calendar", iconColor: "text-slate-500", hoverAnim: "group-hover:-translate-y-1 group-hover:scale-110" },
  { id: "mindmap", label: "Strategická mapa", href: "/portal/mindmap", iconName: "Network", iconColor: "text-slate-500", hoverAnim: "group-hover:-translate-y-1" },
  { id: "household", label: "Domácnost", href: "/portal/households", iconName: "Building", iconColor: "text-slate-500", hoverAnim: "group-hover:-translate-y-1" },
  { id: "document", label: "Dokument", href: "/portal/contacts", iconName: "FileText", iconColor: "text-slate-500", hoverAnim: "group-hover:scale-110" },
];

export const DEFAULT_QUICK_ACTIONS_ORDER: QuickActionId[] = QUICK_ACTIONS_CATALOG.map(
  (a) => a.id
);

export function getDefaultQuickActionsConfig(): {
  order: string[];
  visible: Record<string, boolean>;
} {
  const order = [...DEFAULT_QUICK_ACTIONS_ORDER];
  const visible: Record<string, boolean> = {};
  QUICK_ACTIONS_CATALOG.forEach((a) => {
    visible[a.id] = true;
  });
  return { order, visible };
}
