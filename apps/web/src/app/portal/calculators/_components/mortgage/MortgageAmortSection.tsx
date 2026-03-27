"use client";

import { useMemo, useState, useCallback } from "react";
import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Tooltip,
  Legend,
  Filler,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { formatCurrency } from "@/lib/calculators/mortgage/formatters";
import { calculatorSliderGradient } from "@/lib/calculators/calculator-slider-gradient";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Tooltip, Legend, Filler);

export interface MortgageAmortSectionProps {
  borrowingAmount: number;
  annualRate: number;
  termYears: number;
}

interface AmortRow {
  month: number;
  interest: number;
  principal: number;
  balance: number;
}

function buildAmortTable(principal: number, annualRate: number, termYears: number): AmortRow[] {
  const r = annualRate / 100 / 12;
  const n = termYears * 12;
  if (principal <= 0 || r <= 0 || n <= 0) return [];
  const pmt = (principal * r * Math.pow(1 + r, n)) / (Math.pow(1 + r, n) - 1);
  let balance = principal;
  const rows: AmortRow[] = [];
  for (let i = 1; i <= n; i++) {
    const interest = balance * r;
    const prinPay = pmt - interest;
    balance = Math.max(0, balance - prinPay);
    rows.push({ month: i, interest, principal: prinPay, balance });
  }
  return rows;
}

export function MortgageAmortSection({
  borrowingAmount,
  annualRate,
  termYears,
}: MortgageAmortSectionProps) {
  const [showEarly, setShowEarly] = useState(false);
  const [earlyYear, setEarlyYear] = useState(Math.min(15, termYears - 1));

  const table = useMemo(
    () => buildAmortTable(borrowingAmount, annualRate, termYears),
    [borrowingAmount, annualRate, termYears],
  );

  const pivot = Math.min(earlyYear, termYears - 1);
  const pivotMonth = pivot * 12;

  const stats = useMemo(() => {
    if (!table.length || pivotMonth <= 0 || pivotMonth > table.length) return null;
    const pmt = table.length > 0
      ? (borrowingAmount * (annualRate / 100 / 12) * Math.pow(1 + annualRate / 100 / 12, termYears * 12)) /
        (Math.pow(1 + annualRate / 100 / 12, termYears * 12) - 1)
      : 0;
    const paid = pmt * pivotMonth;
    const intPaid = table.slice(0, pivotMonth).reduce((s, r) => s + r.interest, 0);
    const prinPaid = paid - intPaid;
    const totalInt = table.reduce((s, r) => s + r.interest, 0);
    const intPct = totalInt > 0 ? Math.round((intPaid / totalInt) * 100) : 0;
    const saving = totalInt - intPaid;
    return { paid, prinPaid, intPaid, intPct, saving, totalInt };
  }, [table, pivotMonth, borrowingAmount, annualRate, termYears]);

  const chartData = useMemo(() => {
    const labels: string[] = [];
    const debtData: number[] = [];
    const intData: number[] = [];
    let cumInt = 0;
    for (let y = 1; y <= termYears; y++) {
      const slice = table.slice((y - 1) * 12, y * 12);
      cumInt += slice.reduce((s, r) => s + r.interest, 0);
      labels.push(`${y}r`);
      debtData.push(Math.max(0, table[y * 12 - 1]?.balance ?? 0));
      intData.push(cumInt);
    }
    const datasets: any[] = [
      {
        label: "Zbývající dluh",
        data: debtData,
        borderColor: "#60A5FA",
        backgroundColor: "rgba(96,165,250,0.06)",
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#60A5FA",
      },
      {
        label: "Kumulativní úroky",
        data: intData,
        borderColor: "#34D399",
        backgroundColor: "rgba(52,211,153,0.04)",
        fill: true,
        tension: 0.4,
        borderWidth: 2,
        borderDash: [6, 4],
        pointRadius: 0,
        pointHoverRadius: 5,
        pointBackgroundColor: "#34D399",
      },
    ];
    if (showEarly) {
      const ey = Math.min(earlyYear, termYears - 1);
      datasets.push({
        label: `Splacení v roce ${ey}`,
        data: debtData.map((v, i) => (i < ey ? v : null)),
        borderColor: "#F97316",
        backgroundColor: "transparent",
        fill: false,
        tension: 0.4,
        borderWidth: 2.5,
        borderDash: [4, 4],
        pointRadius: debtData.map((_, i) => (i === ey - 1 ? 7 : 0)),
        pointBackgroundColor: "#F97316",
        pointBorderColor: "#fff",
        pointBorderWidth: 2,
      });
    }
    return { labels, datasets };
  }, [table, termYears, showEarly, earlyYear]);

  const chartOptions = useMemo(
    () => ({
      responsive: true,
      maintainAspectRatio: false,
      interaction: { mode: "index" as const, intersect: false },
      plugins: {
        legend: {
          display: true,
          position: "top" as const,
          labels: { font: { size: 11 }, color: "#64748B", boxWidth: 24, boxHeight: 2, padding: 18, usePointStyle: false },
        },
        tooltip: {
          backgroundColor: "#0D1F4E",
          titleFont: { size: 12, weight: "bold" as const },
          bodyFont: { size: 11 },
          padding: 12,
          cornerRadius: 10,
          callbacks: {
            label: (ctx: any) => ctx.raw == null ? "" : ` ${ctx.dataset.label}: ${formatCurrency(Math.round(ctx.raw))} Kč`,
          },
        },
      },
      scales: {
        x: { grid: { display: false }, border: { display: false }, ticks: { color: "#94A3B8", maxTicksLimit: 10 } },
        y: {
          grid: { color: "rgba(0,0,0,0.04)" },
          border: { display: false },
          ticks: {
            color: "#94A3B8",
            callback: (v: number | string) => {
              const n = Number(v);
              return n >= 1e6 ? `${(n / 1e6).toFixed(1).replace(".0", "")}M` : n >= 1e3 ? `${(n / 1e3).toFixed(0)}K` : String(n);
            },
          },
        },
      },
    }),
    [],
  );

  const toggleEarly = useCallback(() => setShowEarly((p) => !p), []);

  if (!stats) return null;

  return (
    <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm sm:p-6 md:p-7">
      <div className="mb-6">
        <h3 className="mb-1 text-base font-bold text-[color:var(--wp-text)] sm:text-lg">
          Analýza splácení — kolik skutečně ušetříte splacením po {pivot} letech?
        </h3>
        <p className="max-w-xl text-xs leading-relaxed text-[color:var(--wp-text-secondary)] sm:text-sm">
          Anuitní hypotéka je nastavena tak, aby banka dostala největší část úroků v prvních letech.
          Po {pivot} letech dluh stále existuje, ale většinu úroků jste již zaplatili.
        </p>
      </div>

      {/* Stat boxes */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-5">
        <div className="rounded-[14px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--wp-text-tertiary)]">Zaplaceno za prvních {pivot} let</div>
          <div className="text-xl font-extrabold text-[color:var(--wp-text)]">{formatCurrency(Math.round(stats.paid))} Kč</div>
          <div className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">Z toho jistina: <strong>{formatCurrency(Math.round(stats.prinPaid))} Kč</strong></div>
        </div>
        <div className="rounded-[14px] border-[1.5px] border-indigo-500/30 bg-indigo-500/10 p-4 dark:border-indigo-400/25 dark:bg-indigo-950/35">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-indigo-700 opacity-90 dark:text-indigo-300">Úroky zaplacené do zvoleného roku</div>
          <div className="text-xl font-extrabold text-indigo-700 dark:text-indigo-300">{formatCurrency(Math.round(stats.intPaid))} Kč</div>
          <div className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">= <strong>{stats.intPct} %</strong> z celkových úroků</div>
        </div>
        <div className="rounded-[14px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4">
          <div className="mb-2 text-[10px] font-semibold uppercase tracking-[0.08em] text-[color:var(--wp-text-tertiary)]">Úspora při splacení v roce {pivot}</div>
          <div className="text-xl font-extrabold text-[color:var(--wp-text)]">{formatCurrency(Math.round(stats.saving))} Kč</div>
          <div className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">Zbývající nezaplacené úroky</div>
        </div>
      </div>

      {/* Toggle + year picker */}
      <div className="flex flex-wrap items-center gap-2.5 mb-4">
        <span className="text-xs text-[color:var(--wp-text-secondary)]">Zobrazit:</span>
        <button
          type="button"
          onClick={toggleEarly}
          className={`inline-flex items-center gap-2 py-1.5 px-3 rounded-full border-[1.5px] text-xs font-medium transition-all ${
            showEarly ? "border-emerald-600 bg-[color:var(--wp-surface-card)] dark:border-emerald-500" : "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)]"
          }`}
        >
          <div className={`relative h-4 w-[30px] rounded-full transition-colors ${showEarly ? "bg-emerald-600 dark:bg-emerald-500" : "bg-[color:var(--wp-border-strong)]"}`}>
            <div className={`absolute top-0.5 w-3 h-3 rounded-full bg-[color:var(--wp-surface-card)] shadow-sm transition-transform ${showEarly ? "translate-x-[14px]" : "translate-x-0.5"}`} />
          </div>
          <span className="text-[color:var(--wp-text)]">Předčasné splacení</span>
        </button>
      </div>

      {showEarly && (
        <>
          <div className="flex flex-wrap items-center gap-3 mb-4">
            <span className="text-xs text-[color:var(--wp-text-secondary)]">Splatit po</span>
            <div className="flex-1 min-w-[140px] px-2.5">
              <input
                type="range"
                min={1}
                max={termYears - 1}
                step={1}
                value={earlyYear}
                onChange={(e) => setEarlyYear(parseInt(e.target.value, 10))}
                className="calc-range-slider w-full"
                style={{ background: calculatorSliderGradient(earlyYear, 1, termYears - 1) }}
              />
            </div>
            <span className="text-sm font-bold text-[#2563eb] min-w-[56px] text-right whitespace-nowrap">
              {earlyYear} letech
            </span>
          </div>

          <div className="mb-4 rounded-[10px] border-[1.5px] border-[rgba(5,150,105,0.22)] bg-[#ecfdf5] p-3 text-xs leading-relaxed text-[#065f46] dark:border-emerald-500/30 dark:bg-emerald-950/40 dark:text-emerald-200">
            Splacením hypotéky v roce <strong>{earlyYear}</strong> ušetříte pouze zbývající část úroků — větší část jste již zaplatili v prvních letech.
          </div>
        </>
      )}

      {/* Chart */}
      <div className="relative h-[260px]">
        <Line data={chartData} options={chartOptions} />
      </div>

    </div>
  );
}
