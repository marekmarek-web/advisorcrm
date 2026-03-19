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
  Target,
} from "lucide-react";

export const WIDGET_IDS = [
  "aiAssistant",
  "myTasks",
  "messages",
  "activeDeals",
  "production",
  "businessPlan",
  "clientCare",
  "financialAnalyses",
  "notes",
] as const;

export type WidgetId = (typeof WIDGET_IDS)[number];

/** Výchozí pořadí widgetů – Zápisky úplně dole, přes celou šířku */
export const DEFAULT_DASHBOARD_ORDER: WidgetId[] = [
  "aiAssistant",
  "myTasks",
  "messages",
  "activeDeals",
  "production",
  "businessPlan",
  "clientCare",
  "financialAnalyses",
  "notes",
];

export const WIDGET_LABELS: Record<WidgetId, string> = {
  aiAssistant: "AI asistent",
  myTasks: "Moje úkoly",
  messages: "Zprávy od klientů",
  activeDeals: "Aktivní obchody",
  production: "Produkce",
  businessPlan: "Plnění plánu",
  clientCare: "Péče o klienty",
  financialAnalyses: "Finanční analýzy",
  notes: "Zápisky",
};

export const WIDGET_ICONS: Record<WidgetId, LucideIcon> = {
  aiAssistant: Sparkles,
  myTasks: CheckSquare,
  messages: MessageSquare,
  activeDeals: Briefcase,
  production: TrendingUp,
  businessPlan: Target,
  clientCare: Wrench,
  financialAnalyses: FileText,
  notes: FileText,
};

/** Section for content hierarchy: A = Dnes a teď, B = Obchod a výkon, C = Servis a klienti, D = Přehled a akce */
export type DashboardSection = "A" | "B" | "C" | "D";

export const WIDGET_SECTION: Record<WidgetId, DashboardSection> = {
  aiAssistant: "A",
  myTasks: "A",
  messages: "A",
  activeDeals: "B",
  production: "B",
  businessPlan: "B",
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
export type WidgetColorId = "white" | "emerald" | "blue" | "violet" | "rose" | "amber" | "slate";

export const WIDGET_COLOR_IDS: WidgetColorId[] = ["white", "emerald", "blue", "violet", "rose", "amber", "slate"];

export const WIDGET_COLOR_CLASS: Record<WidgetColorId, string> = {
  white: "bg-white",
  emerald: "bg-emerald-500/10",
  blue: "bg-blue-500/10",
  violet: "bg-violet-500/10",
  rose: "bg-rose-500/10",
  amber: "bg-amber-500/10",
  slate: "bg-slate-500/10",
};

/** Pro modální výběr – gradient + ring při aktivním výběru */
export const WIDGET_COLOR_GRADIENT: Record<WidgetColorId, { bgClass: string; ringClass: string }> = {
  white: { bgClass: "bg-white border border-slate-200", ringClass: "ring-slate-300" },
  emerald: { bgClass: "bg-gradient-to-br from-emerald-400 to-teal-500", ringClass: "ring-emerald-500" },
  blue: { bgClass: "bg-gradient-to-br from-blue-400 to-cyan-500", ringClass: "ring-blue-500" },
  violet: { bgClass: "bg-gradient-to-br from-indigo-500 to-purple-600", ringClass: "ring-indigo-500" },
  rose: { bgClass: "bg-gradient-to-br from-rose-400 to-pink-500", ringClass: "ring-rose-500" },
  amber: { bgClass: "bg-gradient-to-br from-amber-400 to-orange-500", ringClass: "ring-amber-500" },
  slate: { bgClass: "bg-gradient-to-br from-slate-600 to-slate-800", ringClass: "ring-slate-700" },
};

export const WIDGET_HREF: Partial<Record<WidgetId, string>> = {
  aiAssistant: "/portal/contracts/review",
  myTasks: "/portal/tasks",
  messages: "/portal/contacts",
  activeDeals: "/portal/pipeline",
  production: "/portal/production",
  businessPlan: "/portal/business-plan",
  clientCare: "/portal/contacts",
  financialAnalyses: "/portal/analyses",
  notes: "/portal/notes",
};

/** Bento grid column spans per widget (12-col grid) */
export const WIDGET_COL_SPAN: Record<WidgetId, string> = {
  aiAssistant: "lg:col-span-7",
  myTasks: "lg:col-span-5",
  messages: "lg:col-span-4",
  activeDeals: "lg:col-span-4",
  production: "lg:col-span-4",
  businessPlan: "lg:col-span-4",
  clientCare: "lg:col-span-4",
  financialAnalyses: "lg:col-span-4",
  notes: "lg:col-span-12",
};

/** Top-edge "envelope" border color per section (4px bar) */
export const WIDGET_TOP_BORDER_BY_SECTION: Record<DashboardSection, string> = {
  A: "border-t-4 border-t-emerald-500",
  B: "border-t-4 border-t-blue-500",
  C: "border-t-4 border-t-violet-500",
  D: "border-t-4 border-t-slate-400",
};

/** Top border by widget color (for customize modal override) */
export const WIDGET_TOP_BORDER_BY_COLOR: Record<WidgetColorId, string> = {
  white: "border-t-4 border-t-slate-200",
  emerald: "border-t-4 border-t-emerald-500",
  blue: "border-t-4 border-t-blue-500",
  violet: "border-t-4 border-t-violet-500",
  rose: "border-t-4 border-t-rose-500",
  amber: "border-t-4 border-t-amber-500",
  slate: "border-t-4 border-t-slate-500",
};
