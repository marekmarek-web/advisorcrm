"use client";

import dynamic from "next/dynamic";
import { useCallback, useMemo, useState } from "react";
import { CalculatorPageShell } from "../core/CalculatorPageShell";
import { CalculatorPageHeader } from "../core/CalculatorPageHeader";
import { CalculatorMobileResultDock } from "../core/CalculatorMobileResultDock";
import { InvestmentStrategySwitcher } from "./InvestmentStrategySwitcher";
import { InvestmentInputPanel } from "./InvestmentInputPanel";
import { InvestmentResultsPanel } from "./InvestmentResultsPanel";

const chartLoading = () => (
  <div
    className="min-h-[220px] animate-pulse rounded-xl bg-[color:var(--wp-surface-muted)] md:min-h-[240px]"
    aria-hidden
  />
);

const InvestmentGrowthChart = dynamic(
  () => import("./InvestmentGrowthChart").then((m) => m.InvestmentGrowthChart),
  { ssr: false, loading: chartLoading },
);
const InvestmentAllocationChart = dynamic(
  () => import("./InvestmentAllocationChart").then((m) => m.InvestmentAllocationChart),
  { ssr: false, loading: chartLoading },
);
const InvestmentBacktestChart = dynamic(
  () => import("./InvestmentBacktestChart").then((m) => m.InvestmentBacktestChart),
  { ssr: false, loading: () => <div className="min-h-[320px] animate-pulse rounded-xl bg-[color:var(--wp-surface-muted)]" aria-hidden /> },
);
import {
  INVESTMENT_PROFILES,
  HISTORICAL_DATA,
  INVESTMENT_DEFAULTS,
} from "@/lib/calculators/investment/investment.config";
import { computeProjection } from "@/lib/calculators/investment/investment.engine";
import { runBacktest } from "@/lib/calculators/investment/investment.backtest";
import {
  getGrowthChartData,
  getAllocationChartData,
  getBacktestChartSeries,
} from "@/lib/calculators/investment/investment.charts";
import { formatCurrency } from "@/lib/calculators/investment/formatters";
import { buildInvestmentPdfSections } from "@/lib/calculators/pdf";
import { CalculatorPdfExportButton } from "@/components/calculators/CalculatorPdfExportButton";

export type InvestmentCalculatorAudience = "advisor" | "client";

export function InvestmentCalculatorPage({
  audience = "advisor",
}: {
  audience?: InvestmentCalculatorAudience;
}) {
  const [initial, setInitial] = useState<number>(INVESTMENT_DEFAULTS.initialDefault);
  const [monthly, setMonthly] = useState<number>(INVESTMENT_DEFAULTS.monthlyDefault);
  const [years, setYears] = useState<number>(INVESTMENT_DEFAULTS.yearsDefault);
  const [profileIndex, setProfileIndex] = useState<number>(INVESTMENT_DEFAULTS.profileIndexDefault);
  const [startYear, setStartYear] = useState<number>(INVESTMENT_DEFAULTS.startYearDefault);

  const profile = INVESTMENT_PROFILES[profileIndex] ?? INVESTMENT_PROFILES[1];

  const projection = useMemo(
    () => computeProjection({ initial, monthly, years, profile }),
    [initial, monthly, years, profile],
  );
  const backtestResult = useMemo(() => runBacktest(monthly, startYear, HISTORICAL_DATA), [monthly, startYear]);
  const growthChartData = useMemo(() => getGrowthChartData(projection, profile.color), [projection, profile.color]);
  const allocationChartData = useMemo(() => getAllocationChartData(profile), [profile]);
  const backtestSeries = useMemo(() => getBacktestChartSeries(backtestResult), [backtestResult]);

  const getPdfSections = useCallback(
    () =>
      buildInvestmentPdfSections(
        profile.name,
        profile.rate,
        initial,
        monthly,
        years,
        projection,
        { startYear, result: backtestResult }
      ),
    [profile.name, profile.rate, initial, monthly, years, projection, startYear, backtestResult]
  );

  const isClientAudience = audience === "client";

  return (
    <div className={isClientAudience ? "pt-0 pb-4" : "pt-0 pb-44 lg:pb-0"}>
      <CalculatorPageShell>
        <div className="mb-3">
          <CalculatorPageHeader
            eyebrow="Kalkulačka investic · 2026"
            title="Investiční kalkulačka"
            subtitle={
              audience === "client"
                ? "Orientační projekce v čase — ilustrativní výpočet. Individuální posouzení řeší váš poradce."
                : "Projekce hodnoty investice v čase při pravidelném investování a zvolené strategii."
            }
            actions={
              <CalculatorPdfExportButton
                documentTitle="Investiční kalkulačka – přehled výpočtu"
                filePrefix="investice"
                getSections={getPdfSections}
              />
            }
          />
        </div>

        {/* Strategy switcher */}
        <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm sm:p-6">
          <InvestmentStrategySwitcher
            profiles={INVESTMENT_PROFILES}
            activeIndex={profileIndex}
            onSelect={setProfileIndex}
          />
          <p className="mt-3 text-sm font-medium text-[color:var(--wp-text-secondary)]">
            Strategie: <span className="font-bold text-[color:var(--wp-text)]">{profile.name}</span>{" "}
            <span className="text-[color:var(--wp-text-tertiary)]">({profile.rate} % p.a.)</span>
          </p>
        </div>

        {/* Main grid: input | result */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">
          <InvestmentInputPanel
            initial={initial}
            monthly={monthly}
            years={years}
            onInitialChange={setInitial}
            onMonthlyChange={setMonthly}
            onYearsChange={setYears}
            profileTitle={profile.name}
            profileDescription={profile.description}
          />
          {/* Client audience: always visible (no fixed dock); advisor: desktop-only sticky panel */}
          <div className={isClientAudience ? "block" : "hidden lg:block sticky top-6"}>
            <InvestmentResultsPanel
              totalBalance={projection.totalBalance}
              totalInvested={projection.totalInvested}
              totalGain={projection.totalGain}
              totalGainPercent={projection.totalGainPercent}
            />
          </div>
        </div>

        {/* Charts */}
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
          <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm sm:p-6">
            <h3 className="mb-1 text-base font-bold text-[color:var(--wp-text)]">Projekce vývoje</h3>
            <p className="text-xs text-[color:var(--wp-text-secondary)] mb-4">Odhadovaný vývoj hodnoty investice v čase.</p>
            <InvestmentGrowthChart data={growthChartData} />
          </div>
          <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm sm:p-6">
            <h3 className="mb-1 text-base font-bold text-[color:var(--wp-text)]">Složení portfolia</h3>
            <p className="text-xs text-[color:var(--wp-text-secondary)] mb-4">Rozdělení strategie podle tříd aktiv.</p>
            <InvestmentAllocationChart data={allocationChartData} />
          </div>
        </div>

        {/* Backtest */}
        <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm sm:p-6 md:p-7">
          <InvestmentBacktestChart
            series={backtestSeries}
            monthlyFormatted={formatCurrency(monthly)}
            startYear={startYear}
            onStartYearChange={setStartYear}
          />
        </div>
      </CalculatorPageShell>

      {/* Fixed mobile dock only for advisor view; client sees results inline above */}
      {!isClientAudience && (
        <CalculatorMobileResultDock>
          <InvestmentResultsPanel
            totalBalance={projection.totalBalance}
            totalInvested={projection.totalInvested}
            totalGain={projection.totalGain}
            totalGainPercent={projection.totalGainPercent}
          />
        </CalculatorMobileResultDock>
      )}
    </div>
  );
}
