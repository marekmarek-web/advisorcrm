"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { createTask } from "@/app/actions/tasks";
import { createMeetingNote } from "@/app/actions/meeting-notes";
import { FinancialAnalysisStepper } from "./FinancialAnalysisStepper";
import { FinancialAnalysisToolbar } from "./FinancialAnalysisToolbar";
import { StepClientInfo } from "./steps/StepClientInfo";
import { StepCashflow } from "./steps/StepCashflow";
import { StepAssetsLiabilities } from "./steps/StepAssetsLiabilities";
import { StepCredits } from "./steps/StepCredits";
import { StepGoals } from "./steps/StepGoals";
import { StepStrategy } from "./steps/StepStrategy";
import { StepIncomeProtection } from "./steps/StepIncomeProtection";
import { StepSummary } from "./steps/StepSummary";
import { StepBenefitsRisks } from "./steps/StepBenefitsRisks";
import { PersonalFALinkBanner } from "./PersonalFALinkBanner";
import { StickyNote, CheckSquare, FileText } from "lucide-react";

const STEP_COMPONENTS_BASE = [
  StepClientInfo,
  StepCashflow,
  StepAssetsLiabilities,
  StepCredits,
  StepGoals,
  StepStrategy,
  StepIncomeProtection,
  StepSummary,
];

function getStepComponents(includeCompany: boolean) {
  if (!includeCompany) return STEP_COMPONENTS_BASE;
  return [
    StepClientInfo,
    StepCashflow,
    StepBenefitsRisks,
    StepAssetsLiabilities,
    StepCredits,
    StepGoals,
    StepStrategy,
    StepIncomeProtection,
    StepSummary,
  ];
}

export function FinancialAnalysisLayout() {
  const router = useRouter();
  const [convertLoading, setConvertLoading] = useState<"task" | "note" | null>(null);
  const [convertError, setConvertError] = useState<string | null>(null);
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const totalSteps = useFinancialAnalysisStore((s) => s.totalSteps);
  const notes = useFinancialAnalysisStore((s) => s.data.notes ?? "");
  const data = useFinancialAnalysisStore((s) => s.data);
  const analysisId = useFinancialAnalysisStore((s) => s.analysisId);
  const setData = useFinancialAnalysisStore((s) => s.setData);
  const prevStep = useFinancialAnalysisStore((s) => s.prevStep);
  const nextStep = useFinancialAnalysisStore((s) => s.nextStep);

  const stepComponents = getStepComponents(data.includeCompany ?? false);
  const StepComponent = stepComponents[currentStep - 1];

  async function handleConvertToTask() {
    setConvertError(null);
    setConvertLoading("task");
    const title = notes.trim().split(/\n/)[0]?.slice(0, 200) || "Úkol z finanční analýzy";
    const payload = {
      title,
      description: notes.trim() || undefined,
      contactId: data.clientId || undefined,
      analysisId: analysisId || undefined,
    };
    let id: string | null = null;
    try {
      id = await createTask(payload);
    } catch (e) {
      const msg = e instanceof Error ? e.message : "";
      setConvertLoading(null);
      setConvertError(msg || "Nepodařilo se vytvořit úkol. Zkuste to znovu nebo přidejte úkol ručně v sekci Úkoly.");
      return;
    }
    setConvertLoading(null);
    if (id) {
      setTimeout(() => {
        window.location.href = "/portal/tasks";
      }, 0);
    } else {
      setConvertError("Nepodařilo se vytvořit úkol. Zkuste to znovu nebo přidejte úkol ručně v sekci Úkoly.");
    }
  }

  async function handleConvertToNote() {
    setConvertError(null);
    setConvertLoading("note");
    const payload = {
      contactId: data.clientId ?? null,
      meetingAt: new Date().toISOString().slice(0, 16),
      domain: "financial_analysis",
      content: { obsah: notes.trim() || "Poznámky z finanční analýzy." },
    };
    let id: string | null = null;
    try {
      id = await createMeetingNote(payload);
    } catch {
      id = null;
    }
    setConvertLoading(null);
    if (id) {
      setTimeout(() => {
        window.location.href = "/portal/notes";
      }, 0);
    } else {
      setConvertError("Nepodařilo se vytvořit zápisek. Zkuste to znovu nebo zkopírujte text do zápisků ručně.");
    }
  }

  return (
    <div className="flex-grow flex flex-col items-center pt-6 pb-20 px-3 sm:px-4">
      <section className="w-full max-w-4xl mb-6 text-center">
        <h1 className="text-2xl sm:text-3xl md:text-4xl font-extrabold text-slate-900 tracking-tight">
          Finanční analýza
        </h1>
      </section>

      <FinancialAnalysisStepper />

      <div className="w-full max-w-6xl mb-4">
        <PersonalFALinkBanner />
      </div>

      <div className="w-full max-w-6xl rounded-2xl border border-slate-200 bg-white p-4 sm:p-6 md:p-10 mb-20 shadow-lg">
        <FinancialAnalysisToolbar />

        <div className="min-h-[320px]">
          {StepComponent && <StepComponent />}
        </div>

        <div className="flex flex-col sm:flex-row justify-between items-stretch sm:items-center gap-4 pt-8 border-t border-slate-200 mt-8">
          <button
            type="button"
            onClick={() => prevStep()}
            className={currentStep === 1 ? "hidden" : "min-h-[44px] px-6 py-3 border border-slate-200 rounded-xl font-semibold text-slate-600 hover:bg-slate-50"}
          >
            Zpět
          </button>
          <div className="flex-1 sm:text-right">
            {currentStep === totalSteps ? (
              <span className="text-slate-500 text-sm">Použijte tlačítko v kroku Shrnutí pro export reportu.</span>
            ) : (
              <button
                type="button"
                onClick={() => nextStep()}
                className="min-h-[44px] px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white font-bold rounded-xl shadow-md"
              >
                Další
              </button>
            )}
          </div>
        </div>

        <div className="mt-8 pt-8 border-t border-slate-200">
          <h3 className="text-sm font-bold text-slate-700 uppercase tracking-wider mb-2 flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-indigo-600" />
            Poznámky k analýze
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setData({ notes: e.target.value })}
            placeholder="Poznámky k analýze – uloží se s analýzou. Můžete je později převést na úkol nebo do zápisků."
            className="w-full min-h-[100px] px-4 py-3 border border-slate-200 rounded-xl text-sm focus:ring-2 focus:ring-indigo-400 focus:border-indigo-400 resize-y"
          />
          <div className="flex flex-wrap gap-3 mt-2 items-center">
            <button
              type="button"
              onClick={handleConvertToTask}
              disabled={convertLoading !== null}
              className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50 min-h-[44px]"
            >
              <CheckSquare className="w-4 h-4" />
              {convertLoading === "task" ? "Vytvářím…" : "Převést na úkol"}
            </button>
            <button
              type="button"
              onClick={handleConvertToNote}
              disabled={convertLoading !== null}
              className="inline-flex items-center gap-2 text-sm font-semibold text-indigo-600 hover:text-indigo-700 disabled:opacity-50 min-h-[44px]"
            >
              <FileText className="w-4 h-4" />
              {convertLoading === "note" ? "Vytvářím…" : "Do zápisků"}
            </button>
            {convertError && (
              <span className="text-sm text-red-600">{convertError}</span>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
