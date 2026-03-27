"use client";

import {
  Chart as ChartJS,
  ArcElement,
  Tooltip,
} from "chart.js";
import { Doughnut } from "react-chartjs-2";
import type { AllocationChartData } from "@/lib/calculators/investment/investment.charts";

ChartJS.register(ArcElement, Tooltip);

export interface InvestmentAllocationChartProps {
  data: AllocationChartData;
}

export function InvestmentAllocationChart({ data }: InvestmentAllocationChartProps) {
  const chartData = {
    labels: data.labels,
    datasets: [
      {
        data: data.values,
        backgroundColor: data.colors,
        borderWidth: 0,
        hoverOffset: 4,
      },
    ],
  };

  const options = {
    responsive: true,
    maintainAspectRatio: false,
    cutout: "70%",
    plugins: {
      legend: { display: false },
      tooltip: {
        callbacks: {
          label: (c: { label: string; parsed: number }) =>
            ` ${c.label}: ${c.parsed}%`,
        },
      },
    },
  };

  return (
    <div className="flex flex-col items-center justify-center gap-6 lg:flex-row lg:items-start lg:justify-between">
      <div className="relative h-52 w-52 sm:h-56 sm:w-56">
        <Doughnut data={chartData} options={options} />
      </div>
      <div className="w-full max-w-xs space-y-2">
        {data.labels.map((label, i) => (
          <div
            key={label}
            className="flex items-center justify-between rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-2.5 transition-colors hover:bg-[color:var(--wp-surface-muted)]"
          >
            <div className="flex items-center gap-3">
              <span
                className="w-3 h-3 rounded-full shadow-sm shrink-0"
                style={{ backgroundColor: data.colors[i] }}
              />
              <span className="text-sm font-bold text-[color:var(--wp-text-secondary)]">{label}</span>
            </div>
            <span className="font-bold tabular-nums text-[color:var(--wp-text)]">{data.values[i]} %</span>
          </div>
        ))}
      </div>
    </div>
  );
}
