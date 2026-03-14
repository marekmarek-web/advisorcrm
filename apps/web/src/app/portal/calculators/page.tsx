import Link from "next/link";
import { TrendingUp, Calculator, PiggyBank, HeartPulse, FileText, ChevronRight } from "lucide-react";
import { getCalculators } from "@/lib/calculators/core/registry";
import type { CalculatorIconId } from "@/lib/calculators/core/types";
import { ListPageShell, ListPageEmpty } from "@/app/components/list-page";

type IconProps = { className?: string; size?: number | string; strokeWidth?: number | string };
const ICON_MAP: Record<CalculatorIconId, React.ComponentType<IconProps>> = {
  "trending-up": TrendingUp as React.ComponentType<IconProps>,
  calculator: Calculator as React.ComponentType<IconProps>,
  "piggy-bank": PiggyBank as React.ComponentType<IconProps>,
  "heart-pulse": HeartPulse as React.ComponentType<IconProps>,
  "circle-help": Calculator as React.ComponentType<IconProps>,
};

type ThemeId = "investment" | "mortgage" | "pension" | "life";
const THEME: Record<
  ThemeId,
  { color: string; lightBg: string; hoverRing: string; tagColor?: string }
> = {
  investment: {
    color: "bg-indigo-600",
    lightBg: "bg-indigo-50",
    hoverRing: "group-hover:ring-indigo-100",
    tagColor: "text-indigo-700 bg-indigo-100",
  },
  mortgage: {
    color: "bg-blue-600",
    lightBg: "bg-blue-50",
    hoverRing: "group-hover:ring-blue-100",
  },
  pension: {
    color: "bg-emerald-600",
    lightBg: "bg-emerald-50",
    hoverRing: "group-hover:ring-emerald-100",
  },
  life: {
    color: "bg-rose-600",
    lightBg: "bg-rose-50",
    hoverRing: "group-hover:ring-rose-100",
  },
};

function getTheme(category: string): ThemeId {
  if (category === "investment") return "investment";
  if (category === "mortgage") return "mortgage";
  if (category === "pension") return "pension";
  if (category === "life") return "life";
  return "investment";
}

/** Placeholder: připraveno na napojení live dat (např. poslední otevřené kalkulačky / analýzy). */
const RECENT_PLACEHOLDER = [
  { id: "1", client: "Rodina Novákova", type: "Hypotéka 4.5M", date: "Před 2 hodinami", href: "/portal/calculators/mortgage" },
  { id: "2", client: "Ing. Lucie Opalenská", type: "Investiční plán", date: "Včera", href: "/portal/calculators/investment" },
  { id: "3", client: "Petr Malý", type: "Životní pojištění", date: "10. března 2026", href: "/portal/calculators/life" },
];

export default function CalculatorsPage() {
  const calculators = getCalculators();

  if (calculators.length === 0) {
    return (
      <ListPageShell className="max-w-[1200px]">
        <ListPageEmpty
          icon="🧮"
          title="Žádné kalkulačky"
          description="V registru nejsou momentálně žádné kalkulačky."
        />
      </ListPageShell>
    );
  }

  return (
    <ListPageShell className="max-w-[1200px]">
      {/* Hlavička stránky – 1:1 s návrhem */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-6 mb-8 md:mb-12">
        <div>
          <div className="flex items-center gap-3 mb-2">
            <h1 className="text-3xl md:text-4xl font-black text-slate-900 tracking-tight">
              Kalkulačky
            </h1>
            <span className="px-3 py-1 bg-slate-100 text-slate-500 text-xs font-black rounded-lg border border-slate-200">
              {calculators.length} celkem
            </span>
          </div>
          <p className="text-sm font-medium text-slate-500">
            Hypoteční, investiční a další expertní kalkulačky pro přípravu řešení.
          </p>
        </div>
      </div>

      {/* Grid 2×2 – pouze 4 kalkulačky, bez Komplexní analýzy */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-12">
        {calculators.map((def) => {
          const Icon = ICON_MAP[def.icon] ?? Calculator;
          const themeId = getTheme(def.category);
          const theme = THEME[themeId];
          const isFirst = def.id === "investment";
          const cardContent = (
            <>
              {/* Dekorativní blur glow na hover */}
              <div
                className={`absolute -top-24 -right-24 w-48 h-48 rounded-full blur-[60px] opacity-0 group-hover:opacity-40 transition-opacity duration-500 ${theme.color}`}
                aria-hidden
              />
              {isFirst && theme.tagColor && (
                <div
                  className={`absolute top-6 right-6 px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-widest ${theme.tagColor}`}
                >
                  Nejpoužívanější
                </div>
              )}
              <div className="flex flex-col h-full relative z-10 text-center items-center justify-center min-h-[240px]">
                <div
                  className={`w-16 h-16 rounded-2xl flex items-center justify-center text-white shadow-lg mb-6 transition-transform duration-300 group-hover:scale-110 ring-4 ring-transparent ${theme.hoverRing} ${theme.color}`}
                >
                  <Icon size={28} strokeWidth={2} />
                </div>
                <h2 className="text-lg font-black text-slate-900 mb-3 group-hover:text-indigo-600 transition-colors duration-300">
                  {def.title}
                </h2>
                <p className="text-sm font-medium text-slate-500 leading-relaxed max-w-[280px]">
                  {def.description}
                </p>
              </div>
            </>
          );

          if (def.status !== "active") {
            return (
              <div
                key={def.id}
                className="block bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm opacity-75 cursor-not-allowed"
              >
                {cardContent}
              </div>
            );
          }

          return (
            <Link
              key={def.id}
              href={def.route}
              className="group block bg-white rounded-[32px] p-8 border border-slate-100 shadow-sm hover:shadow-xl hover:border-indigo-100 transition-all duration-300 relative overflow-hidden transform hover:-translate-y-1"
            >
              {cardContent}
            </Link>
          );
        })}
      </div>

      {/* Nedávné propočty – vizuál 1:1, připraveno na live data */}
      <div className="bg-white rounded-[32px] border border-slate-100 shadow-sm p-6 md:p-8">
        <div className="flex flex-wrap items-center justify-between gap-4 mb-6">
          <h2 className="text-lg font-black text-slate-900 flex items-center gap-2">
            <FileText size={18} className="text-indigo-500" />
            Nedávné propočty
          </h2>
          <Link
            href="/portal/calculators"
            className="text-sm font-bold text-indigo-600 hover:text-indigo-800 transition-colors flex items-center gap-1"
          >
            Zobrazit všechny <ChevronRight size={16} />
          </Link>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {RECENT_PLACEHOLDER.map((item) => (
            <Link
              key={item.id}
              href={item.href}
              className="p-4 rounded-2xl border border-slate-100 bg-slate-50 hover:bg-white hover:shadow-md hover:border-indigo-200 transition-all group flex items-start gap-4"
            >
              <div className="p-2 bg-white rounded-xl shadow-sm border border-slate-100 text-indigo-500 group-hover:bg-indigo-50 group-hover:text-indigo-600 transition-colors shrink-0">
                <FileText size={20} />
              </div>
              <div className="min-w-0">
                <h3 className="font-bold text-sm text-slate-900 group-hover:text-indigo-600 transition-colors mb-0.5 truncate">
                  {item.client}
                </h3>
                <p className="text-xs font-bold text-slate-500 mb-2">{item.type}</p>
                <span className="text-[10px] font-black uppercase tracking-widest text-slate-400">
                  {item.date}
                </span>
              </div>
            </Link>
          ))}
        </div>
      </div>
    </ListPageShell>
  );
}
