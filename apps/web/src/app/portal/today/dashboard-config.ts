/**
 * Dashboard widget registry and section mapping.
 * Sections: A = Dnes a teď, B = Obchod a výkon, C = Servis a klienti, D = Přehled a akce.
 */
import type { LucideIcon } from "lucide-react";
import {
  Sparkles,
  CheckSquare,
  MessageSquare,
  Briefcase,
  TrendingUp,
  Wrench,
  FileText,
} from "lucide-react";

export const WIDGET_IDS = [
  "aiAssistant",
  "summaryDay",
  "myTasks",
  "messages",
  "activeDeals",
  "production",
  "clientCare",
  "financialAnalyses",
  "notes",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

/** Výchozí pořadí widgetů – Zápisky úplně dole, přes celou šířku */
export const DEFAULT_DASHBOARD_ORDER: WidgetId[] = [
  "summaryDay",
  "aiAssistant",
  "myTasks",
  "messages",
  "activeDeals",
  "production",
  "clientCare",
  "financialAnalyses",
  "notes",
];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  aiAssistant: "AI asistent",
  summaryDay: "Shrnutí dne",
  myTasks: "Moje úkoly",
  messages: "Zprávy od klientů",
  activeDeals: "Aktivní obchody",
  production: "Produkce",
  clientCare: "Péče o klienty",
  financialAnalyses: "Finanční analýzy",
  notes: "Zápisky",
};

export const WIDGET_ICONS: Record<WidgetId, LucideIcon> = {
  aiAssistant: Sparkles,
  summaryDay: Sparkles,
  myTasks: CheckSquare,
  messages: MessageSquare,
  activeDeals: Briefcase,
  production: TrendingUp,
  clientCare: Wrench,
  financialAnalyses: FileText,
  notes: FileText,
};

/** Section for content hierarchy: A = Dnes a teď, B = Obchod a výkon, C = Servis a klienti, D = Přehled a akce */
export type DashboardSection = "A" | "B" | "C" | "D";

export const WIDGET_SECTION: Record<WidgetId, DashboardSection> = {
  aiAssistant: "A",
  summaryDay: "A",
  myTasks: "A",
  messages: "A",
  activeDeals: "B",
  production: "B",
  clientCare: "C",
  financialAnalyses: "D",
  notes: "D",
};

/** Lehce barevné pozadí gridů podle sekce (opacity max 20 %) */
export const WIDGET_SECTION_BG: Record<DashboardSection, string> = {
  A: "bg-emerald-500/10",
  B: "bg-blue-500/10",
  C: "bg-violet-500/10",
  D: "bg-slate-500/10",
};

/** Volba barvy widgetu v modalu „Upravit nástěnku“ – gradientové barvy 2026 */
export type WidgetColorId = "emerald" | "blue" | "violet" | "rose" | "amber" | "slate";

export const WIDGET_COLOR_IDS: WidgetColorId[] = ["emerald", "blue", "violet", "rose", "amber", "slate"];

export const WIDGET_COLOR_CLASS: Record<WidgetColorId, string> = {
  emerald: "bg-emerald-500/10",
  blue: "bg-blue-500/10",
  violet: "bg-violet-500/10",
  rose: "bg-rose-500/10",
  amber: "bg-amber-500/10",
  slate: "bg-slate-500/10",
};

/** Pro modální výběr – gradient + ring při aktivním výběru */
export const WIDGET_COLOR_GRADIENT: Record<WidgetColorId, { bgClass: string; ringClass: string }> = {
  emerald: { bgClass: "bg-gradient-to-br from-emerald-400 to-teal-500", ringClass: "ring-emerald-500" },
  blue: { bgClass: "bg-gradient-to-br from-blue-400 to-cyan-500", ringClass: "ring-blue-500" },
  violet: { bgClass: "bg-gradient-to-br from-indigo-500 to-purple-600", ringClass: "ring-indigo-500" },
  rose: { bgClass: "bg-gradient-to-br from-rose-400 to-pink-500", ringClass: "ring-rose-500" },
  amber: { bgClass: "bg-gradient-to-br from-amber-400 to-orange-500", ringClass: "ring-amber-500" },
  slate: { bgClass: "bg-gradient-to-br from-slate-600 to-slate-800", ringClass: "ring-slate-700" },
};

export const WIDGET_HREF: Partial<Record<WidgetId, string>> = {
  aiAssistant: "/portal/contracts/review",
  summaryDay: "/portal/calendar",
  myTasks: "/portal/tasks",
  messages: "/portal/contacts",
  activeDeals: "/portal/pipeline",
  production: "/portal/production",
  clientCare: "/portal/contacts",
  financialAnalyses: "/portal/analyses",
  notes: "/portal/notes",
};
