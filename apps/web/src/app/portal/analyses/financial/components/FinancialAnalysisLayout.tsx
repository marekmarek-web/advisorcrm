"use client";

import { useState } from "react";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { createTask } from "@/app/actions/tasks";
import { createMeetingNote } from "@/app/actions/meeting-notes";
import { FinancialAnalysisStepper } from "./FinancialAnalysisStepper";
import { FinancialAnalysisToolbar } from "./FinancialAnalysisToolbar";
import { FinancialAnalysisAutoSave } from "./FinancialAnalysisAutoSave";
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

  function normalizeActionError(
    error: unknown,
    fallbackMessage: string,
  ): string {
    const msg = error instanceof Error ? error.message : "";
    if (!msg) return fallbackMessage;
    const lower = msg.toLowerCase();
    if (
      lower.includes("server components render")
      || lower.includes("omitted in production")
      || lower.includes("digest property")
      || lower.includes("unexpected response was received from the server")
    ) {
      return fallbackMessage;
    }
    return msg;
  }

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
      console.error("[FA] createTask failed:", e);
      const msg = e instanceof Error ? e.message : "";
      const lower = msg.toLowerCase();
      if (
        payload.analysisId
        && (lower.includes("foreign key") || lower.includes("violates foreign key"))
      ) {
        try {
          id = await createTask({ ...payload, analysisId: undefined });
        } catch (retryError) {
          console.error("[FA] createTask retry (no analysisId) failed:", retryError);
          const retryMsg = retryError instanceof Error ? retryError.message.toLowerCase() : "";
          if (
            payload.contactId
            && (retryMsg.includes("foreign key") || retryMsg.includes("violates foreign key"))
          ) {
            try {
              id = await createTask({ ...payload, analysisId: undefined, contactId: undefined });
            } catch (finalRetryError) {
              console.error("[FA] createTask final retry failed:", finalRetryError);
              setConvertLoading(null);
              setConvertError(normalizeActionError(finalRetryError, "Nepodařilo se vytvořit úkol. Zkuste to znovu nebo přidejte úkol ručně v sekci Úkoly."));
              return;
            }
          } else {
            setConvertLoading(null);
            setConvertError(normalizeActionError(retryError, "Nepodařilo se vytvořit úkol. Zkuste to znovu nebo přidejte úkol ručně v sekci Úkoly."));
            return;
          }
        }
      } else {
        setConvertLoading(null);
        setConvertError(normalizeActionError(e, "Nepodařilo se vytvořit úkol. Zkuste to znovu nebo přidejte úkol ručně v sekci Úkoly."));
        return;
      }
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
    } catch (e) {
      console.error("[FA] createMeetingNote failed:", e);
      const msg = e instanceof Error ? e.message.toLowerCase() : "";
      if (
        payload.contactId
        && (msg.includes("foreign key") || msg.includes("violates foreign key"))
      ) {
        try {
          id = await createMeetingNote({ ...payload, contactId: null });
        } catch (retryError) {
          console.error("[FA] createMeetingNote retry failed:", retryError);
          setConvertLoading(null);
          setConvertError(normalizeActionError(retryError, "Nepodařilo se vytvořit zápisek. Zkuste to znovu nebo zkopírujte text do zápisků ručně."));
          return;
        }
      } else {
        setConvertLoading(null);
        setConvertError(normalizeActionError(e, "Nepodařilo se vytvořit zápisek. Zkuste to znovu nebo zkopírujte text do zápisků ručně."));
        return;
      }
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
    <div className="flex-grow flex flex-col items-center pt-4 sm:pt-6 pb-[max(6rem,env(safe-area-inset-bottom))] sm:pb-20 px-3 sm:px-4 min-h-0">
      <FinancialAnalysisAutoSave />
      <section className="w-full max-w-4xl mb-4 sm:mb-6 text-center px-1">
        <h1 className="text-xl sm:text-3xl md:text-4xl font-extrabold text-[color:var(--wp-text)] tracking-tight">
          Finanční analýza
        </h1>
      </section>

      <FinancialAnalysisStepper />

      <div className="w-full max-w-6xl mb-4">
        <PersonalFALinkBanner />
      </div>

      <div className="w-full max-w-6xl rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3 sm:p-6 md:p-10 mb-8 sm:mb-20 shadow-lg flex flex-col min-h-0">
        <FinancialAnalysisToolbar />

        <div className="min-h-[min(50vh,320px)] flex-1 min-h-0 overflow-x-hidden sm:min-h-[320px]">
          {StepComponent ? (
            <StepComponent
              key={`${Boolean(data.includeCompany)}-${currentStep}-${StepComponent.name ?? "step"}`}
            />
          ) : null}
        </div>

        <div className="mt-4 flex flex-col items-stretch gap-3 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-1 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-4 sm:mx-0 sm:mt-8 sm:flex-row sm:items-center sm:justify-between sm:gap-4 sm:bg-transparent sm:px-0 sm:pb-0 sm:pt-8">
          <button
            type="button"
            onClick={() => prevStep()}
            className={currentStep === 1 ? "hidden" : "min-h-[44px] px-6 py-3 border border-[color:var(--wp-surface-card-border)] rounded-xl font-semibold text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}
          >
            Zpět
          </button>
          <div className="flex-1 sm:text-right">
            {currentStep === totalSteps ? (
              <span className="text-[color:var(--wp-text-secondary)] text-sm">Použijte tlačítko v kroku Shrnutí pro export reportu.</span>
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

        <div className="mt-8 pt-8 border-t border-[color:var(--wp-surface-card-border)]">
          <h3 className="text-sm font-bold text-[color:var(--wp-text-secondary)] uppercase tracking-wider mb-2 flex items-center gap-2">
            <StickyNote className="w-4 h-4 text-indigo-600" />
            Poznámky k analýze
          </h3>
          <textarea
            value={notes}
            onChange={(e) => setData({ notes: e.target.value })}
            placeholder="Poznámky k analýze – uloží se s analýzou. Můžete je později převést na úkol nebo do zápisků."
            className="w-full min-h-[100px] resize-y rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-input-bg)] px-4 py-3 text-sm text-[color:var(--wp-input-text)] placeholder:text-[color:var(--wp-text-muted)] focus:border-indigo-400 focus:ring-2 focus:ring-indigo-400"
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
