"use client";

import { useRef, useState } from "react";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { exportToFile } from "@/lib/analyses/financial/saveLoad";
import { saveFinancialAnalysisDraft } from "@/app/actions/financial-analyses";
import { Download, FolderOpen, PlusCircle, CloudUpload } from "lucide-react";

export function FinancialAnalysisToolbar() {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [savingCrm, setSavingCrm] = useState(false);
  const data = useFinancialAnalysisStore((s) => s.data);
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const analysisId = useFinancialAnalysisStore((s) => s.analysisId);
  const saveToStorage = useFinancialAnalysisStore((s) => s.saveToStorage);
  const setAnalysisId = useFinancialAnalysisStore((s) => s.setAnalysisId);
  const reset = useFinancialAnalysisStore((s) => s.reset);
  const loadFromFile = useFinancialAnalysisStore((s) => s.loadFromFile);
  const hasCrmContext = Boolean(data.clientId || data.householdId);

  const handleSaveToFile = () => {
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
        if (!ok) alert("Nepodařilo se načíst soubor. Zkontrolujte, že jde o platný export finanční analýzy (JSON).");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleReset = () => {
    if (typeof window !== "undefined" && window.confirm("Opravdu chcete smazat všechny zadané údaje a začít nový plán?")) {
      reset();
    }
  };

  const handleSaveToCrm = async () => {
    if (!hasCrmContext) return;
    setSavingCrm(true);
    try {
      saveToStorage();
      const id = await saveFinancialAnalysisDraft({
        id: analysisId ?? undefined,
        contactId: data.clientId ?? undefined,
        householdId: data.householdId ?? undefined,
        payload: { data: data as unknown as Record<string, unknown>, currentStep },
      });
      setAnalysisId(id);
    } catch (e) {
      const msg = typeof e === "object" && e && "message" in e ? String((e as Error).message) : "Nepodařilo se uložit do CRM.";
      alert(msg);
    } finally {
      setSavingCrm(false);
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 pb-6 mb-6 border-b border-slate-200">
      {hasCrmContext && (
        <button
          type="button"
          onClick={handleSaveToCrm}
          disabled={savingCrm}
          className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-amber-500 hover:bg-amber-600 text-white rounded-lg transition-colors flex items-center gap-2 font-semibold disabled:opacity-50"
          title="Uložit do CRM"
        >
          <CloudUpload className="w-4 h-4" />
          <span>{savingCrm ? "…" : "Uložit do CRM"}</span>
        </button>
      )}
      <button
        type="button"
        onClick={handleSaveToFile}
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 font-semibold text-slate-700"
        title="Uložit analýzu"
      >
        <Download className="w-4 h-4" />
        <span>Uložit</span>
      </button>
      <label className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
        <FolderOpen className="w-4 h-4" />
        <span>Načíst</span>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleLoadFromFile}
          className="hidden"
        />
      </label>
      <button
        type="button"
        onClick={handleReset}
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 font-semibold text-slate-700"
        title="Začít nový plán"
      >
        <PlusCircle className="w-4 h-4" />
        <span>Nový plán</span>
      </button>
    </div>
  );
}
