"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { saveFinancialAnalysisDraft } from "@/app/actions/financial-analyses";
import { FolderOpen, PlusCircle, CloudUpload, UserPlus } from "lucide-react";

import clsx from "clsx";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import { useToast } from "@/app/components/Toast";
import { translateFinancialAnalysisActionError } from "@/lib/analyses/financial/financialAnalysisErrors";
import { useConfirm } from "@/app/components/ConfirmDialog";

export function FinancialAnalysisToolbar() {
  const router = useRouter();
  const toast = useToast();
  const confirm = useConfirm();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const data = useFinancialAnalysisStore((s) => s.data);
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const analysisId = useFinancialAnalysisStore((s) => s.analysisId);
  const saveToStorage = useFinancialAnalysisStore((s) => s.saveToStorage);
  const setAnalysisId = useFinancialAnalysisStore((s) => s.setAnalysisId);
  const reset = useFinancialAnalysisStore((s) => s.reset);
  const loadFromFile = useFinancialAnalysisStore((s) => s.loadFromFile);
  const goToStep = useFinancialAnalysisStore((s) => s.goToStep);
  const hasCrmContext = Boolean(data.clientId || data.householdId);

  const handleSave = async () => {
    setSaving(true);
    try {
      saveToStorage();
      const id = await saveFinancialAnalysisDraft({
        id: analysisId ?? undefined,
        contactId: data.clientId ?? undefined,
        householdId: data.householdId ?? undefined,
        payload: { data: data as unknown as Record<string, unknown>, currentStep },
      });
      setAnalysisId(id);
      if (!analysisId) {
        router.replace(`/portal/analyses/financial?id=${encodeURIComponent(id)}`);
      }
    } catch (e) {
      const raw = typeof e === "object" && e && "message" in e ? String((e as Error).message) : "Nepodařilo se uložit.";
      toast.showToast(translateFinancialAnalysisActionError(raw), "error");
    } finally {
      setSaving(false);
    }
  };

  const handleLoadFromFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      const text = ev.target?.result as string;
      if (text) {
        const ok = loadFromFile(text);
        if (!ok)
          toast.showToast(
            "Nepodařilo se načíst soubor. Zkontrolujte, že jde o platný export finanční analýzy (JSON).",
            "error",
          );
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleReset = () => {
    void (async () => {
      if (
        !(await confirm({
          title: "Začít znovu",
          message: "Opravdu chcete smazat všechny zadané údaje a začít nový plán?",
          confirmLabel: "Smazat a začít znovu",
          cancelLabel: "Zrušit",
          variant: "destructive",
        }))
      ) {
        return;
      }
      reset();
      router.push("/portal/analyses/financial");
    })();
  };

  return (
    <div className="mb-5 flex flex-wrap items-center gap-2 border-b border-[color:var(--wp-surface-card-border)] pb-4 sm:mb-6 sm:gap-3 sm:pb-6">
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={clsx(
          portalPrimaryButtonClassName,
          "min-h-[40px] gap-1.5 rounded-xl px-3 text-[12px] font-black uppercase tracking-wide sm:min-h-[44px] sm:px-4 sm:text-sm disabled:opacity-50",
        )}
        title="Uložit do Aidvisora"
      >
        <CloudUpload className="h-4 w-4" />
        <span>{saving ? "…" : "Uložit"}</span>
      </button>
      {hasCrmContext ? (
        <span className="ml-auto hidden text-xs font-semibold text-[color:var(--wp-text-secondary)] sm:inline">
          Propojeno s klientem / domácností
        </span>
      ) : (
        <button
          type="button"
          onClick={() => goToStep(1)}
          className="ml-auto inline-flex min-h-[40px] items-center gap-1.5 rounded-xl border border-amber-200 bg-amber-50 px-3 text-[11px] font-black uppercase tracking-wide text-amber-800 hover:bg-amber-100 sm:min-h-[44px]"
          title="Přejít na krok 1 a přidat klienta do Aidvisory"
        >
          <UserPlus className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Přidat klienta</span>
        </button>
      )}
      <label
        className="inline-flex min-h-[40px] cursor-pointer items-center gap-1.5 rounded-xl bg-[color:var(--wp-surface-muted)] px-3 text-[11px] font-black uppercase tracking-wide text-[color:var(--wp-text-secondary)] transition-colors hover:bg-[color:var(--wp-surface-card-border)] sm:min-h-[44px] sm:text-xs"
      >
        <FolderOpen className="h-4 w-4" />
        <span className="hidden sm:inline">Načíst</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleLoadFromFile}
          className="hidden"
        />
      </label>
      <CreateActionButton
        type="button"
        onClick={handleReset}
        className="min-h-[40px] sm:min-h-[44px]"
        title="Začít nový plán"
        icon={PlusCircle}
      >
        <span className="hidden sm:inline">Nový plán</span>
      </CreateActionButton>
    </div>
  );
}
