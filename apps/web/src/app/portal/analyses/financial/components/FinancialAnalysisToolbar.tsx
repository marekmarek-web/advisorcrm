"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { exportToFile } from "@/lib/analyses/financial/saveLoad";
import { saveFinancialAnalysisDraft } from "@/app/actions/financial-analyses";
import { Download, FolderOpen, PlusCircle, CloudUpload, List, UserPlus } from "lucide-react";

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

  const handleExportJson = () => {
    saveToStorage();
    const { json, filename } = exportToFile(data, currentStep);
    const blob = new Blob([json], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
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
    <div className="flex flex-wrap items-center justify-end gap-3 pb-6 mb-6 border-b border-[color:var(--wp-surface-card-border)]">
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className={clsx(portalPrimaryButtonClassName, "min-h-[44px] min-w-[44px] rounded-lg px-4 py-2 text-sm font-semibold disabled:opacity-50")}
        title="Uložit do Aidvisora"
      >
        <CloudUpload className="w-4 h-4" />
        <span>{saving ? "…" : "Uložit"}</span>
      </button>
      {hasCrmContext ? (
        <span className="text-xs text-[color:var(--wp-text-secondary)] hidden sm:inline">Propojeno s klientem / domácností</span>
      ) : (
        <button
          type="button"
          onClick={() => goToStep(1)}
          className="min-h-[44px] min-w-[44px] text-xs px-3 py-1.5 bg-amber-50 hover:bg-amber-100 border border-amber-200 rounded-lg transition-colors flex items-center gap-1.5 font-semibold text-amber-800"
          title="Přejít na krok 1 a přidat klienta do Aidvisory"
        >
          <UserPlus className="w-3.5 h-3.5" />
          <span className="hidden sm:inline">Přidat klienta</span>
        </button>
      )}
      <Link
        href="/portal/analyses"
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)] rounded-lg transition-colors flex items-center gap-2 font-semibold text-[color:var(--wp-text-secondary)]"
        title="Otevřít jinou analýzu"
      >
        <List className="w-4 h-4" />
        <span className="hidden sm:inline">Otevřít analýzu</span>
      </Link>
      <button
        type="button"
        onClick={handleExportJson}
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)] rounded-lg transition-colors flex items-center gap-2 font-semibold text-[color:var(--wp-text-secondary)]"
        title="Záloha do souboru (JSON)"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Export JSON</span>
      </button>
      <label className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-[color:var(--wp-surface-muted)] hover:bg-[color:var(--wp-surface-card-border)] rounded-lg transition-colors flex items-center gap-2 font-semibold text-[color:var(--wp-text-secondary)] cursor-pointer">
        <FolderOpen className="w-4 h-4" />
        <span className="hidden sm:inline">Načíst ze souboru</span>
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
        className="min-w-[44px] shadow-lg"
        title="Začít nový plán"
        icon={PlusCircle}
      >
        <span className="hidden sm:inline">Nový plán</span>
      </CreateActionButton>
    </div>
  );
}
