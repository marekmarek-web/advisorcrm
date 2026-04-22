"use client";

import { X, CheckCircle2, AlertTriangle, Award } from "lucide-react";
import type { CareerEvaluationViewModel } from "@/lib/career/career-evaluation-vm";
import {
  completenessToPercent,
  readinessPercentFromRequirements,
} from "@/lib/team-overview-structure-classification";

export function TeamOverviewProgressTreeModal({
  open,
  memberName,
  careerEvaluation,
  onClose,
}: {
  open: boolean;
  memberName: string;
  careerEvaluation: CareerEvaluationViewModel;
  onClose: () => void;
}) {
  if (!open) return null;

  const readiness = Math.max(
    completenessToPercent(careerEvaluation.evaluationCompleteness),
    readinessPercentFromRequirements(careerEvaluation.missingRequirements)
  );
  const blocked = careerEvaluation.progressEvaluation === "blocked";

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 p-4 backdrop-blur-sm">
      <div className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-[32px] bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-5 top-5 rounded-full bg-[color:var(--wp-surface-muted)] p-2 hover:bg-[color:var(--wp-surface-muted)]"
          aria-label="Zavřít"
        >
          <X className="h-5 w-5" />
        </button>
        <div className="border-b border-[color:var(--wp-surface-card-border)] p-8">
          <h2 className="text-xl font-black text-[color:var(--wp-text)]">Strom progresu: {memberName}</h2>
          <p className="mt-1 text-sm font-medium text-[color:var(--wp-text-secondary)]">
            Cesta k pozici: {careerEvaluation.nextCareerPositionLabel ?? "—"}
          </p>
        </div>
        <div className="flex justify-center bg-[color:var(--wp-main-scroll-bg)]/80 px-8 py-12">
          <div className="relative flex flex-col items-center">
            <div className="absolute bottom-0 top-0 w-1 -translate-x-1/2 bg-[color:var(--wp-surface-muted)]" style={{ left: "50%" }} />

            <div className="relative z-10 mb-12 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white bg-emerald-500 text-white shadow-lg">
              <CheckCircle2 className="h-6 w-6" />
            </div>
            <div className="absolute right-12 top-2 w-48 pr-6 text-right text-xs">
              <div className="font-bold text-[color:var(--wp-text)]">Dosaženo</div>
              <div className="text-[color:var(--wp-text-secondary)]">Předchozí krok v řádu</div>
            </div>

            <div className="relative z-10 mb-12 flex h-14 w-14 items-center justify-center rounded-full border-4 border-white bg-[#16192b] text-sm font-black text-white shadow-xl">
              Nyní
            </div>
            <div className="absolute left-12 top-28 w-48 pl-6">
              <div className="text-lg font-black text-[#16192b]">{careerEvaluation.careerPositionLabel ?? "—"}</div>
              <div className="mt-1 text-xs font-bold text-emerald-600">Plnění: {readiness} %</div>
            </div>

            <div
              className={`relative z-10 flex h-12 w-12 items-center justify-center rounded-full border-4 border-white ${
                blocked ? "bg-red-100 text-red-600" : "bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)]"
              }`}
            >
              {blocked ? <AlertTriangle className="h-5 w-5" /> : <Award className="h-5 w-5" />}
            </div>
            <div className="absolute bottom-2 right-12 w-48 pr-6 text-right">
              <div className={`font-bold ${blocked ? "text-red-600" : "text-[color:var(--wp-text)]"}`}>
                {careerEvaluation.nextCareerPositionLabel ?? "Další pozice"}
              </div>
              <div className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                {careerEvaluation.missingRequirements[0]?.labelCs ??
                  (blocked ? "Blokováno — doplněte podmínky" : "Čeká na schválení / data")}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
