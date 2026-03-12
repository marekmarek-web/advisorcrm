"use client";

import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";
import { CompanyAnalysisStepper } from "./CompanyAnalysisStepper";
import { StepCompanyInfo } from "./steps/StepCompanyInfo";
import { StepCompanyPeople } from "./steps/StepCompanyPeople";
import { StepCompanyFinance } from "./steps/StepCompanyFinance";
import { StepCompanyBenefitsRisks } from "./steps/StepCompanyBenefitsRisks";
import { StepCompanyOutput } from "./steps/StepCompanyOutput";
import { CompanyFALinkedPersonsSection } from "./CompanyFALinkedPersonsSection";

const STEP_COMPONENTS = [
  StepCompanyInfo,
  StepCompanyPeople,
  StepCompanyFinance,
  StepCompanyBenefitsRisks,
  StepCompanyOutput,
];

export interface CompanyAnalysisLayoutProps {
  onSave: () => Promise<void>;
  saving?: boolean;
  saveError?: string | null;
}

export function CompanyAnalysisLayout({
  onSave,
  saving = false,
  saveError = null,
}: CompanyAnalysisLayoutProps) {
  const currentStep = useCompanyFaStore((s) => s.currentStep);
  const payload = useCompanyFaStore((s) => s.payload);
  const analysisId = useCompanyFaStore((s) => s.analysisId);
  const prevStep = useCompanyFaStore((s) => s.prevStep);
  const nextStep = useCompanyFaStore((s) => s.nextStep);
  const totalSteps = useCompanyFaStore((s) => s.totalSteps);

  const StepComponent = STEP_COMPONENTS[currentStep - 1];
  const companyName = payload.company?.name || "Firemní analýza";

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <h2 className="text-xl font-semibold text-slate-900">{companyName}</h2>
        <div className="flex items-center gap-3">
          {saveError && (
            <span className="text-sm text-red-600">{saveError}</span>
          )}
          <button
            type="button"
            onClick={onSave}
            disabled={saving}
            className="min-h-[44px] px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90 disabled:opacity-50"
          >
            {saving
              ? "Ukládám…"
              : analysisId
                ? "Uložit do CRM"
                : "Uložit do CRM (vytvořit analýzu)"}
          </button>
        </div>
      </div>

      <CompanyFALinkedPersonsSection />

      <CompanyAnalysisStepper />

      <div className="min-h-[200px]">
        {StepComponent && <StepComponent />}
      </div>

      <div className="flex flex-wrap gap-3 pt-4 border-t border-slate-200">
        <button
          type="button"
          onClick={prevStep}
          disabled={currentStep <= 1}
          className="min-h-[44px] px-4 py-2 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50 disabled:opacity-50 disabled:pointer-events-none"
        >
          Zpět
        </button>
        <button
          type="button"
          onClick={nextStep}
          disabled={currentStep >= totalSteps}
          className="min-h-[44px] px-4 py-2 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
        >
          Další
        </button>
      </div>
    </div>
  );
}
