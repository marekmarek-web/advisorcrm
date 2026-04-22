"use client";

import type { MetricSource } from "@/lib/team-overview-alerts";

/**
 * F3 SourceBadge — vizuální indikátor p\u016fvodu KPI hodnoty.
 * \u017D\u00e1dn\u00e1 barva na `auto` (default, nezahlcuje UI). Manu\u00e1ln\u011b potvrzen\u00e9
 * = tlumen\u00e9 zelen\u00e9; odhad = tlumen\u00e1 oran\u017eov\u00e1; missing = \u0161ed\u00fd outline.
 */
export function SourceBadge({
  source,
  compact = false,
}: {
  source: MetricSource;
  compact?: boolean;
}) {
  const cfg = CONFIG[source];
  if (!cfg) return null;
  if (source === "auto") return null;
  return (
    <span
      aria-label={cfg.aria}
      title={cfg.title}
      className={`inline-flex items-center rounded-full border px-1.5 py-0.5 text-[10px] font-medium leading-none ${cfg.className}`}
    >
      {compact ? cfg.shortLabel : cfg.label}
    </span>
  );
}

const CONFIG: Record<MetricSource, { label: string; shortLabel: string; aria: string; title: string; className: string }> = {
  auto: {
    label: "Auto",
    shortLabel: "A",
    aria: "Zdroj: automaticky z CRM",
    title: "Automaticky z CRM (contracts / events / activity_log).",
    className: "border-slate-200 bg-slate-50 text-slate-500",
  },
  manual_confirmed: {
    label: "Manuáln\u011b",
    shortLabel: "M",
    aria: "Zdroj: manu\u00e1ln\u011b potvrzeno managerem",
    title: "Manu\u00e1ln\u011b potvrzen\u00e1 hodnota (team_member_manual_periods).",
    className: "border-emerald-200 bg-emerald-50 text-emerald-700",
  },
  manual_estimated: {
    label: "Odhad",
    shortLabel: "~",
    aria: "Zdroj: manu\u00e1ln\u00ed odhad",
    title: "Manu\u00e1ln\u00ed odhad \u2014 je\u0161t\u011b nepotvrzeno nebo ne\u00faplno.",
    className: "border-amber-200 bg-amber-50 text-amber-700",
  },
  derived: {
    label: "Derived",
    shortLabel: "D",
    aria: "Zdroj: odvozen\u00e9 (trend/ratio)",
    title: "Odvozen\u00e1 metrika (trend / ratio) z auto nebo manual zdroj\u016f.",
    className: "border-indigo-200 bg-indigo-50 text-indigo-700",
  },
  missing: {
    label: "Chyb\u00ed",
    shortLabel: "!",
    aria: "Zdroj: data nejsou k dispozici",
    title: "Data za dan\u00e9 obdob\u00ed nejsou k dispozici. Dopl\u0148te manu\u00e1ln\u011b, nebo ignorujte.",
    className: "border-dashed border-slate-300 bg-white text-slate-400",
  },
};
