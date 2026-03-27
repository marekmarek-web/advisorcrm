"use client";

import { useCallback, useMemo, useState } from "react";
import { CalculatorPageShell } from "../core/CalculatorPageShell";
import { CalculatorPageHeader } from "../core/CalculatorPageHeader";
import { CalculatorMobileResultDock } from "../core/CalculatorMobileResultDock";
import { LifeInputPanel } from "./LifeInputPanel";
import { LifeResultsPanel } from "./LifeResultsPanel";
import { LifeRiskChart } from "./LifeRiskChart";
import { DEFAULT_STATE } from "@/lib/calculators/life/life.config";
import { runCalculations } from "@/lib/calculators/life/life.engine";
import type { LifeState } from "@/lib/calculators/life/life.types";
import { buildLifePdfSections } from "@/lib/calculators/pdf";
import { CalculatorPdfExportButton } from "@/components/calculators/CalculatorPdfExportButton";

export function LifeCalculatorPage() {
  const [state, setState] = useState<LifeState>({ ...DEFAULT_STATE });
  const result = useMemo(() => runCalculations(state), [state]);

  const getPdfSections = useCallback(() => buildLifePdfSections(state, result), [state, result]);

  return (
    <div className="pt-0 pb-56 lg:pb-0">
      <CalculatorPageShell>
        <div className="mb-3">
          <CalculatorPageHeader
            eyebrow="Kalkulačka pojištění · 2026"
            title="Kalkulačka životního pojištění"
            subtitle="Orientační výpočet potřebného krytí podle příjmů, výdajů a závazků."
            actions={
              <CalculatorPdfExportButton
                documentTitle="Životní pojištění – přehled výpočtu"
                filePrefix="zivotni-pojisteni"
                getSections={getPdfSections}
              />
            }
          />
        </div>

        {/* Main grid: input | result */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">
          <LifeInputPanel state={state} onStateChange={setState} />
          <div className="hidden lg:block sticky top-6">
            <LifeResultsPanel state={state} result={result} />
          </div>
        </div>

        {/* Risk chart */}
        <div className="hidden md:block">
          <div className="rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm sm:p-6">
            <h3 className="mb-1 text-base font-bold text-[color:var(--wp-text)]">Analýza rizika (měsíční bilance)</h3>
            <p className="mb-4 text-xs text-[color:var(--wp-text-secondary)]">
              Propad příjmů v případě nemoci nebo invalidity a částka, kterou je třeba dokrýt.
            </p>
            <LifeRiskChart chartData={result.chartData} />
          </div>
        </div>
      </CalculatorPageShell>

      <CalculatorMobileResultDock>
        <LifeResultsPanel state={state} result={result} />
      </CalculatorMobileResultDock>
    </div>
  );
}
