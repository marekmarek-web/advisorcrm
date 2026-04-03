"use client";

import { useCallback, useMemo, useState } from "react";
import { CalculatorPageShell } from "../core/CalculatorPageShell";
import { CalculatorPageHeader } from "../core/CalculatorPageHeader";
import { CalculatorMobileResultDock } from "../core/CalculatorMobileResultDock";
import { PensionInputPanel } from "./PensionInputPanel";
import { PensionResultsPanel } from "./PensionResultsPanel";
import { DEFAULT_STATE } from "@/lib/calculators/pension/pension.config";
import { runCalculations } from "@/lib/calculators/pension/pension.engine";
import type { PensionState } from "@/lib/calculators/pension/pension.types";
import { formatCurrency } from "@/lib/calculators/pension/formatters";
import { buildPensionPdfSections } from "@/lib/calculators/pdf";
import { CalculatorPdfExportButton } from "@/components/calculators/CalculatorPdfExportButton";

export function PensionCalculatorPage() {
  const [state, setState] = useState<PensionState>({ ...DEFAULT_STATE });
  const result = useMemo(() => runCalculations(state), [state]);

  const getPdfSections = useCallback(() => buildPensionPdfSections(state, result), [state, result]);

  const getHeroKpis = useCallback(
    () => [
      { label: "Měsíční mezera", value: `${formatCurrency(result.monthlyGap)} Kč` },
      { label: "Odhad důchodu", value: `${formatCurrency(result.estimatedPension)} Kč` },
      { label: "Investice / měs.", value: `${formatCurrency(Math.round(result.monthlyInvestment))} Kč` },
    ],
    [result]
  );

  return (
    <div className="pt-0 pb-56 lg:pb-0">
      <CalculatorPageShell>
        <div className="mb-3">
          <CalculatorPageHeader
            eyebrow="Kalkulačka penze · 2026"
            title="Penzijní kalkulačka"
            subtitle="Odhad státního důchodu, měsíční mezery k cílové rentě a nutné měsíční investice."
            actions={
              <CalculatorPdfExportButton
                documentTitle="Penzijní kalkulačka – přehled výpočtu"
                filePrefix="penze"
                getSections={getPdfSections}
                getHeroKpis={getHeroKpis}
              />
            }
          />
        </div>

        {/* Main grid: input | result */}
        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">
          <PensionInputPanel
            state={state}
            onStateChange={setState}
            estimatedPension={result.estimatedPension}
          />
          <div className="hidden lg:block sticky top-6">
            <PensionResultsPanel result={result} />
          </div>
        </div>
      </CalculatorPageShell>

      <CalculatorMobileResultDock>
        <PensionResultsPanel result={result} />
      </CalculatorMobileResultDock>
    </div>
  );
}
