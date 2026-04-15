"use client";

import { useState, useEffect, useMemo, useCallback } from "react";
import Link from "next/link";
import {
  Calendar,
  FileText,
  Banknote,
  TrendingUp,
  Download,
  PieChart as PieChartIcon,
  BarChart3,
  Filter,
  ExternalLink,
} from "lucide-react";
import { getProductionSummary, type PeriodType, type ProductionSummary } from "@/app/actions/production";
import { SkeletonBlock } from "@/app/components/Skeleton";

const PERIOD_OPTIONS: { value: PeriodType; label: string }[] = [
  { value: "month", label: "Měsíc" },
  { value: "quarter", label: "Kvartál" },
  { value: "year", label: "Rok" },
];

const PIE_COLORS = [
  "#4f46e5",
  "#10b981",
  "#0ea5e9",
  "#f59e0b",
  "#a25ddc",
  "#579bfc",
  "#ff642e",
  "#66ccff",
];

function DonutChart({ slices }: { slices: { label: string; value: number; color: string }[] }) {
  const total = slices.reduce((s, sl) => s + sl.value, 0);
  const circumference = 2 * Math.PI * 80;
  if (total === 0) {
    return (
      <div
        className="flex items-center justify-center w-48 h-48 rounded-full border-[20px] mx-auto"
        style={{ borderColor: "var(--wp-border)" }}
      >
        <span className="text-sm" style={{ color: "var(--wp-text-muted)" }}>
          Žádná data
        </span>
      </div>
    );
  }

  let offset = 0;
  const segments = slices
    .filter((s) => s.value > 0)
    .map((slice) => {
      const frac = slice.value / total;
      const length = frac * circumference;
      const seg = { ...slice, dashOffset: -offset, dashArray: `${length} ${circumference}` };
      offset += length;
      return seg;
    });

  return (
    <div className="relative w-48 h-48 mx-auto">
      <svg className="w-full h-full transform -rotate-90" viewBox="0 0 192 192">
        <circle cx="96" cy="96" r="80" stroke="var(--wp-border)" strokeWidth="20" fill="transparent" />
        {segments.map((seg, i) => (
          <circle
            key={i}
            cx="96"
            cy="96"
            r="80"
            stroke={seg.color}
            strokeWidth="20"
            fill="transparent"
            strokeDasharray={seg.dashArray}
            strokeDashoffset={seg.dashOffset}
            strokeLinecap="round"
          />
        ))}
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center text-center">
        <span className="text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
          Celkem
        </span>
        <span className="text-xl font-bold" style={{ color: "var(--wp-text)" }}>
          {total >= 1_000_000
            ? `${(total / 1_000_000).toFixed(2)}M`
            : total >= 1_000
              ? `${(total / 1_000).toFixed(1)}k`
              : total.toLocaleString("cs-CZ")}
        </span>
      </div>
    </div>
  );
}

function downloadProductionCsv(data: ProductionSummary, periodLabel: string) {
  const headers = ["Segment", "Partner", "Pojistné (období)", "Roční ekvivalent", "Počet"];
  const rows = data.rows.map((r) => [
    r.segmentLabel,
    r.partnerName ?? "",
    r.totalPremium.toLocaleString("cs-CZ"),
    r.totalAnnual.toLocaleString("cs-CZ"),
    String(r.count),
  ]);
  const csvContent = [
    headers.join(";"),
    ...rows.map((row) => row.map((cell) => `"${String(cell).replace(/"/g, '""')}"`).join(";")),
  ].join("\n");
  const blob = new Blob(["\uFEFF" + csvContent], { type: "text/csv;charset=utf-8" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = `produkce-${periodLabel.replace(/\s/g, "-")}.csv`;
  a.click();
  URL.revokeObjectURL(url);
}

/** First day of month in local calendar as YYYY-MM-DD (avoids UTC shift from `toISOString()`). */
function toLocalMonthFirstIso(d: Date): string {
  const y = d.getFullYear();
  const m = d.getMonth() + 1;
  return `${y}-${String(m).padStart(2, "0")}-01`;
}

function buildMonthOptions(monthsBack = 24): { value: string; label: string }[] {
  const now = new Date();
  const options: { value: string; label: string }[] = [];
  for (let i = 0; i < monthsBack; i++) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    const iso = toLocalMonthFirstIso(d);
    const label = d.toLocaleString("cs-CZ", { month: "long", year: "numeric" });
    options.push({ value: iso, label: label.charAt(0).toUpperCase() + label.slice(1) });
  }
  return options;
}

export function PortalProductionView() {
  const [period, setPeriod] = useState<PeriodType>("month");
  const [refDate, setRefDate] = useState<string | undefined>(undefined);
  const [data, setData] = useState<ProductionSummary | null>(null);
  const [loading, setLoading] = useState(true);

  const monthOptions = useMemo(() => buildMonthOptions(), []);

  useEffect(() => {
    setLoading(true);
    getProductionSummary(period, refDate)
      .then(setData)
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [period, refDate]);

  const bySegment = useMemo(() => {
    if (!data) return [];
    const map = new Map<string, { label: string; premium: number; count: number }>();
    for (const r of data.rows) {
      const existing = map.get(r.segment);
      if (existing) {
        existing.premium += r.totalPremium;
        existing.count += r.count;
      } else {
        map.set(r.segment, { label: r.segmentLabel, premium: r.totalPremium, count: r.count });
      }
    }
    return Array.from(map.entries()).map(([code, v]) => ({ code, ...v }));
  }, [data]);

  const pieSlices = bySegment.map((s, i) => ({
    label: s.label,
    value: s.premium,
    color: PIE_COLORS[i % PIE_COLORS.length],
  }));

  const totalPremium = data?.totalPremium ?? 0;
  const segmentWithShare = pieSlices.map((s) => ({
    ...s,
    share: totalPremium > 0 ? Math.round((s.value / totalPremium) * 100) : 0,
  }));

  const handleExport = useCallback(() => {
    if (data) downloadProductionCsv(data, data.periodLabel);
  }, [data]);

  return (
    <div className="flex flex-col flex-1 min-h-0 w-full" style={{ animation: "wp-fade-in 0.3s ease" }}>
      <div className="wp-projects-section flex-1 min-w-0 pb-8">
        {/* --- Header: compact on mobile --- */}
        <div className="flex flex-col md:flex-row md:items-end justify-between gap-4 md:gap-6" style={{ marginBottom: "var(--wp-space-6)" }}>
          <div>
            <h1 className="text-xl md:text-3xl font-bold tracking-tight mb-1 md:mb-2" style={{ color: "var(--wp-text)" }}>
              Produkce
            </h1>
            <p className="text-sm font-medium flex items-center gap-2" style={{ color: "var(--wp-text-muted)" }}>
              <Calendar size={16} style={{ color: "var(--wp-accent, #4f46e5)" }} />
              <span style={{ color: "var(--wp-text)" }}>{data ? data.periodLabel : loading ? "Načítám…" : "—"}</span>
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2 md:gap-4">
            <div
              className="flex items-center rounded-[var(--wp-radius-sm)] p-1 border"
              style={{ background: "var(--wp-bg)", borderColor: "var(--wp-border)" }}
            >
              {PERIOD_OPTIONS.map((opt) => (
                <button
                  key={opt.value}
                  type="button"
                  onClick={() => setPeriod(opt.value)}
                  className={`px-3 md:px-4 py-2 rounded-[var(--wp-radius-xs)] text-xs font-semibold uppercase tracking-wide transition-all min-h-[44px] md:min-h-0 ${
                    period === opt.value
                      ? "shadow-sm border"
                      : "opacity-80 hover:opacity-100"
                  }`}
                  style={
                    period === opt.value
                      ? { background: "var(--wp-bg-card)", borderColor: "var(--wp-border)", color: "var(--wp-accent, #4f46e5)" }
                      : { color: "var(--wp-text-muted)" }
                  }
                >
                  {opt.label}
                </button>
              ))}
            </div>
            {period === "month" && (
              <select
                value={refDate ?? ""}
                onChange={(e) => setRefDate(e.target.value || undefined)}
                className="px-3 py-2 rounded-[var(--wp-radius-sm)] text-xs font-semibold border min-h-[44px] appearance-none cursor-pointer"
                style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
                aria-label="Období"
              >
                <option value="">Aktuální měsíc</option>
                {monthOptions.map((opt) => (
                  <option key={opt.value} value={opt.value}>
                    {opt.label}
                  </option>
                ))}
              </select>
            )}
            <button
              type="button"
              onClick={handleExport}
              disabled={!data || data.rows.length === 0}
              className="flex items-center gap-2 px-4 py-2.5 rounded-[var(--wp-radius-sm)] text-xs font-semibold uppercase tracking-wide border transition-all disabled:opacity-50 disabled:cursor-not-allowed min-h-[44px]"
              style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)", color: "var(--wp-text)" }}
            >
              <Download size={16} /> Export
            </button>
          </div>
        </div>

        {loading ? (
          <div className="space-y-8">
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4 md:gap-6">
              {[1, 2, 3, 4].map((i) => (
                <SkeletonBlock key={i} className="h-28 md:h-32 rounded-[var(--wp-radius-sm)]" />
              ))}
            </div>
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8">
              <SkeletonBlock className="h-96 rounded-[var(--wp-radius-sm)]" />
              <SkeletonBlock className="xl:col-span-2 h-96 rounded-[var(--wp-radius-sm)]" />
            </div>
          </div>
        ) : !data ? (
          <p className="text-sm" style={{ color: "var(--wp-text-muted)" }}>
            Chyba při načítání dat.
          </p>
        ) : (
          <>
            {/* --- KPI cards: compact on mobile --- */}
            <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-3 md:gap-6 mb-4 md:mb-8">
              {/* Card 1: Vybrané období – gradient */}
              <div
                className="p-4 md:p-6 rounded-[var(--wp-radius-sm)] text-white shadow-md relative overflow-hidden min-h-[100px] md:min-h-0"
                style={{ background: "linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)" }}
              >
                <Calendar className="absolute -right-4 -bottom-4 w-24 h-24 md:w-32 md:h-32 text-white/10" aria-hidden />
                <span className="text-[10px] font-bold uppercase tracking-wider text-white/80 block mb-1">
                  Vybrané období
                </span>
                <div className="text-xl md:text-2xl font-bold tracking-tight mb-3 md:mb-4">{data.periodLabel}</div>
                <div
                  className="inline-flex items-center gap-1.5 px-3 py-1 rounded-[var(--wp-radius-xs)] text-xs font-medium border border-white/20"
                  style={{ background: "rgba(255,255,255,0.2)" }}
                >
                  Reálná data z CRM
                </div>
              </div>

              {/* Card 2: Počet smluv */}
              <div
                className="p-4 md:p-6 rounded-[var(--wp-radius-sm)] border flex flex-col justify-between transition-shadow hover:shadow-md min-h-[120px] md:min-h-0"
                style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div
                    className="w-9 h-9 md:w-10 md:h-10 rounded-[var(--wp-radius-sm)] flex items-center justify-center shrink-0"
                    style={{ background: "var(--wp-bg)", color: "var(--wp-text-muted)" }}
                  >
                    <FileText size={18} className="md:w-5 md:h-5" />
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--wp-text-muted)" }}>
                  Počet smluv
                </span>
                <div className="text-2xl md:text-3xl font-bold leading-none" style={{ color: "var(--wp-text)" }}>
                  {data.totalCount.toLocaleString("cs-CZ")}
                </div>
              </div>

              {/* Card 3: Pojistné celkem */}
              <div
                className="p-4 md:p-6 rounded-[var(--wp-radius-sm)] border flex flex-col justify-between transition-shadow hover:shadow-md min-h-[120px] md:min-h-0"
                style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div
                    className="w-9 h-9 md:w-10 md:h-10 rounded-[var(--wp-radius-sm)] flex items-center justify-center shrink-0"
                    style={{ background: "var(--wp-bg)", color: "var(--wp-text-muted)" }}
                  >
                    <Banknote size={18} className="md:w-5 md:h-5" />
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--wp-text-muted)" }}>
                  Produkce celkem
                </span>
                <div className="text-xl md:text-2xl font-bold leading-none tracking-tight" style={{ color: "var(--wp-text)" }}>
                  {data.totalPremium.toLocaleString("cs-CZ")} Kč
                </div>
              </div>

              {/* Card 4: Roční souhrn */}
              <div
                className="p-4 md:p-6 rounded-[var(--wp-radius-sm)] border flex flex-col justify-between transition-shadow hover:shadow-md min-h-[120px] md:min-h-0"
                style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
              >
                <div className="flex justify-between items-start mb-2">
                  <div
                    className="w-9 h-9 md:w-10 md:h-10 rounded-[var(--wp-radius-sm)] flex items-center justify-center shrink-0"
                    style={{ background: "var(--wp-bg)", color: "var(--wp-text-muted)" }}
                  >
                    <TrendingUp size={18} className="md:w-5 md:h-5" />
                  </div>
                </div>
                <span className="text-[10px] font-bold uppercase tracking-wider block mb-1" style={{ color: "var(--wp-text-muted)" }}>
                  Roční souhrn (YTD)
                </span>
                <div className="text-xl md:text-2xl font-bold leading-none tracking-tight" style={{ color: "var(--wp-text)" }}>
                  {data.totalAnnual.toLocaleString("cs-CZ")} Kč
                </div>
              </div>
            </div>

            {/* --- Segment card + Detail table --- */}
            <div className="grid grid-cols-1 xl:grid-cols-3 gap-6 md:gap-8">
              {/* Levý panel: Podle segmentu */}
              <div
                className="xl:col-span-1 rounded-[var(--wp-radius-sm)] border flex flex-col p-5 md:p-8 shadow-sm"
                style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
              >
                <div className="flex items-center justify-between mb-6">
                  <h2 className="text-lg font-bold flex items-center gap-2" style={{ color: "var(--wp-text)" }}>
                    <PieChartIcon size={20} style={{ color: "var(--wp-accent, #4f46e5)" }} /> Podle segmentu
                  </h2>
                  <button
                    type="button"
                    className="p-2 rounded-lg transition-colors"
                    style={{ color: "var(--wp-text-muted)" }}
                    aria-label="Filtr"
                  >
                    <Filter size={18} />
                  </button>
                </div>
                <DonutChart slices={pieSlices} />
                <div className="mt-8 space-y-4 flex-1">
                  {segmentWithShare.map((seg) => (
                    <div key={seg.label} className="flex items-center justify-between group">
                      <div className="flex items-center gap-3">
                        <div
                          className="w-3 h-3 rounded-full shrink-0"
                          style={{ backgroundColor: seg.color }}
                        />
                        <div>
                          <div className="text-sm font-semibold" style={{ color: "var(--wp-text)" }}>
                            {seg.label}
                          </div>
                          <div className="text-[11px] font-medium" style={{ color: "var(--wp-text-muted)" }}>
                            {seg.share} % portfolia
                          </div>
                        </div>
                      </div>
                      <div className="text-sm font-bold" style={{ color: "var(--wp-text)" }}>
                        {seg.value.toLocaleString("cs-CZ")} Kč
                      </div>
                    </div>
                  ))}
                </div>
              </div>

              {/* Pravý panel: Detail produkce */}
              <div
                className="xl:col-span-2 rounded-[var(--wp-radius-sm)] border overflow-hidden flex flex-col min-w-0 shadow-sm"
                style={{ background: "var(--wp-bg-card)", borderColor: "var(--wp-border)" }}
              >
                <div
                  className="px-4 md:px-8 py-4 md:py-6 border-b flex flex-wrap items-center justify-between gap-4"
                  style={{ background: "var(--wp-bg)", borderColor: "var(--wp-border)" }}
                >
                  <h2 className="text-base md:text-lg font-bold flex items-center gap-2" style={{ color: "var(--wp-text)" }}>
                    <BarChart3 size={20} style={{ color: "var(--wp-accent, #4f46e5)" }} /> Detail produkce
                  </h2>
                  {data.rows.length > 0 && (
                    <Link
                      href={`/portal/contracts?period=${period}`}
                      className="flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-800 hover:underline min-h-[44px] items-center"
                    >
                      Smlouvy <ExternalLink size={14} />
                    </Link>
                  )}
                </div>
                {/* Mobile: card list */}
                <div className="md:hidden p-4 space-y-3 overflow-y-auto">
                  {data.rows.length === 0 ? (
                    <p className="text-sm py-4 text-center" style={{ color: "var(--wp-text-muted)" }}>
                      Žádné smlouvy v tomto období.
                    </p>
                  ) : (
                    data.rows.map((r, idx) => (
                      <div
                        key={`${r.segment}-${r.partnerName ?? ""}-${idx}`}
                        className="p-4 rounded-[var(--wp-radius-sm)] border"
                        style={{ background: "var(--wp-bg)", borderColor: "var(--wp-border)" }}
                      >
                        <div className="flex items-center justify-between gap-2 mb-2">
                          <span className="text-sm font-semibold" style={{ color: "var(--wp-text)" }}>
                            {r.segmentLabel}
                          </span>
                          <span
                            className="inline-flex items-center justify-center min-w-8 h-8 rounded-full text-sm font-bold px-2 shrink-0"
                            style={{ background: "var(--wp-bg-card)", color: "var(--wp-text)" }}
                          >
                            {r.count}
                          </span>
                        </div>
                        <p className="text-xs font-medium mb-2" style={{ color: "var(--wp-text-muted)" }}>
                          {r.partnerName ?? "—"}
                        </p>
                        <div className="flex justify-between text-sm">
                          <span style={{ color: "var(--wp-text-muted)" }}>Pojistné:</span>
                          <span className="font-bold" style={{ color: "var(--wp-text)" }}>
                            {r.totalPremium.toLocaleString("cs-CZ")} Kč
                          </span>
                        </div>
                        <div className="flex justify-between text-xs mt-1" style={{ color: "var(--wp-text-muted)" }}>
                          <span>Roční ekv.:</span>
                          <span>{r.totalAnnual.toLocaleString("cs-CZ")} Kč</span>
                        </div>
                      </div>
                    ))
                  )}
                  {data.rows.length > 0 && (
                    <div className="pt-2 border-t" style={{ borderColor: "var(--wp-border)" }}>
                      <div className="flex justify-between text-sm font-semibold" style={{ color: "var(--wp-text)" }}>
                        <span>Celkem</span>
                        <span>{data.totalPremium.toLocaleString("cs-CZ")} Kč</span>
                      </div>
                    </div>
                  )}
                </div>
                {/* Desktop: table */}
                <div className="hidden md:block flex-1 min-w-0 overflow-x-auto overflow-y-auto">
                  <table className="w-full min-w-[640px] text-left border-collapse">
                    <thead>
                      <tr className="border-b" style={{ borderColor: "var(--wp-border)" }}>
                        <th className="px-4 md:px-8 py-3 md:py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                          Segment
                        </th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold uppercase tracking-wider" style={{ color: "var(--wp-text-muted)" }}>
                          Partner
                        </th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--wp-text-muted)" }}>
                          Pojistné (období)
                        </th>
                        <th className="px-4 md:px-6 py-3 md:py-4 text-[10px] font-bold uppercase tracking-wider text-right" style={{ color: "var(--wp-text-muted)" }}>
                          Roční ekvivalent
                        </th>
                        <th className="px-4 md:px-8 py-3 md:py-4 text-[10px] font-bold uppercase tracking-wider text-center" style={{ color: "var(--wp-text-muted)" }}>
                          Počet
                        </th>
                      </tr>
                    </thead>
                    <tbody>
                      {data.rows.length === 0 ? (
                        <tr>
                          <td colSpan={5} className="px-4 md:px-8 py-6 md:py-8 text-center text-sm" style={{ color: "var(--wp-text-muted)" }}>
                            Žádné smlouvy v tomto období.
                          </td>
                        </tr>
                      ) : (
                        data.rows.map((r, idx) => (
                          <tr
                            key={`${r.segment}-${r.partnerName ?? ""}-${idx}`}
                            className="border-b last:border-0 transition-colors hover:bg-black/5"
                            style={{
                              borderColor: "var(--wp-border)",
                              background: idx % 2 === 0 ? "transparent" : "var(--wp-bg)",
                            }}
                          >
                            <td className="px-4 md:px-8 py-3 md:py-4">
                              <div className="text-sm font-semibold" style={{ color: "var(--wp-text)" }}>
                                {r.segmentLabel}
                              </div>
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4">
                              <span
                                className="inline-flex items-center px-2.5 py-1 rounded-md text-xs font-medium border"
                                style={{ background: "var(--wp-bg)", color: "var(--wp-text)", borderColor: "var(--wp-border)" }}
                              >
                                {r.partnerName ?? "—"}
                              </span>
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                              <div className="text-sm font-bold" style={{ color: "var(--wp-text)" }}>
                                {r.totalPremium.toLocaleString("cs-CZ")} Kč
                              </div>
                            </td>
                            <td className="px-4 md:px-6 py-3 md:py-4 text-right">
                              <div className="text-sm font-medium" style={{ color: "var(--wp-text-muted)" }}>
                                {r.totalAnnual.toLocaleString("cs-CZ")} Kč
                              </div>
                            </td>
                            <td className="px-4 md:px-8 py-3 md:py-4 text-center">
                              <span
                                className="inline-flex items-center justify-center min-w-8 h-8 rounded-full text-sm font-bold px-2"
                                style={{ background: "var(--wp-bg)", color: "var(--wp-text)" }}
                              >
                                {r.count}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                      {data.rows.length > 0 && (
                        <tr className="font-semibold" style={{ background: "var(--wp-bg)" }}>
                          <td colSpan={2} className="px-4 md:px-8 py-3 md:py-4" style={{ color: "var(--wp-text)" }}>
                            Celkem
                          </td>
                          <td className="px-4 md:px-6 py-3 md:py-4 text-right" style={{ color: "var(--wp-text)" }}>
                            {data.totalPremium.toLocaleString("cs-CZ")} Kč
                          </td>
                          <td className="px-4 md:px-6 py-3 md:py-4 text-right" style={{ color: "var(--wp-text)" }}>
                            {data.totalAnnual.toLocaleString("cs-CZ")} Kč
                          </td>
                          <td className="px-4 md:px-8 py-3 md:py-4 text-center" style={{ color: "var(--wp-text)" }}>
                            {data.totalCount}
                          </td>
                        </tr>
                      )}
                    </tbody>
                  </table>
                </div>
                {data.rows.length > 0 && (
                  <div
                    className="px-4 md:px-8 py-3 md:py-4 border-t flex items-center justify-between"
                    style={{ background: "var(--wp-bg)", borderColor: "var(--wp-border)" }}
                  >
                    <span className="text-xs font-medium" style={{ color: "var(--wp-text-muted)" }}>
                      Zobrazeno {data.rows.length} z {data.rows.length} záznamů
                    </span>
                  </div>
                )}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
