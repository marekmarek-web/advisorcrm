"use client";

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  type ChartData,
} from "chart.js";
import { Line } from "react-chartjs-2";
import { formatCzk } from "@/lib/analyses/financial/formatters";

ChartJS.register(CategoryScale, LinearScale, PointElement, LineElement, Title, Tooltip, Legend, Filler);

/**
 * Samostatný client-only modul — dynamicky importovaný v `StepGoals.tsx`.
 * Izoluje ~200 kB `chart.js` + `react-chartjs-2` z hlavního finančního bundlu,
 * takže kroky 1–7 wizardu se načtou bez nich; chart se stáhne až při vstupu
 * do kroku Goals.
 */
export function StepGoalsChart({ data }: { data: ChartData<"line"> }) {
  return (
    <Line
      data={data}
      options={{
        responsive: true,
        maintainAspectRatio: false,
        scales: {
          x: { title: { display: true, text: "Rok" } },
          y: {
            title: { display: true, text: "Kč" },
            ticks: { callback: (v) => (typeof v === "number" ? formatCzk(v) : v) },
          },
        },
      }}
    />
  );
}

export default StepGoalsChart;
