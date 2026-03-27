import type { PensionResult, PensionState } from "../pension/pension.types";
import { formatCurrencyCs } from "./format";
import type { CalculatorPdfSection } from "./types";

function scenarioLabel(s: PensionState["scenario"]): string {
  return s === "optimistic" ? "Optimistický" : "Realistický";
}

export function buildPensionPdfSections(state: PensionState, result: PensionResult): CalculatorPdfSection[] {
  return [
    {
      title: "Vstupy",
      rows: [
        { label: "Současný věk", value: `${state.age} let` },
        { label: "Věk odchodu do důchodu", value: `${state.retireAge} let` },
        { label: "Hrubý měsíční příjem", value: formatCurrencyCs(state.salary) },
        { label: "Cílová měsíční renta", value: formatCurrencyCs(state.rent) },
        { label: "Scénář", value: scenarioLabel(state.scenario) },
      ],
    },
    {
      title: "Výsledky (orientační)",
      rows: [
        { label: "Odhadovaný státní důchod", value: formatCurrencyCs(result.estimatedPension) },
        { label: "Měsíční mezera k cíli", value: formatCurrencyCs(result.monthlyGap) },
        { label: "Modelovaná měsíční úloha (orientační)", value: formatCurrencyCs(result.monthlyInvestment) },
        { label: "Cílový kapitál", value: formatCurrencyCs(result.targetCapital) },
      ],
    },
  ];
}
