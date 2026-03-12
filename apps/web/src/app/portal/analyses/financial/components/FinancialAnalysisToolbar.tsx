"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useFinancialAnalysisStore } from "@/lib/analyses/financial/store";
import { exportToFile } from "@/lib/analyses/financial/saveLoad";
import { saveFinancialAnalysisDraft } from "@/app/actions/financial-analyses";
import { Download, FolderOpen, PlusCircle, CloudUpload, List } from "lucide-react";

export function FinancialAnalysisToolbar() {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [saving, setSaving] = useState(false);
  const data = useFinancialAnalysisStore((s) => s.data);
  const currentStep = useFinancialAnalysisStore((s) => s.currentStep);
  const analysisId = useFinancialAnalysisStore((s) => s.analysisId);
  const saveToStorage = useFinancialAnalysisStore((s) => s.saveToStorage);
  const setAnalysisId = useFinancialAnalysisStore((s) => s.setAnalysisId);
  const reset = useFinancialAnalysisStore((s) => s.reset);
  const loadFromFile = useFinancialAnalysisStore((s) => s.loadFromFile);
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
      const msg = typeof e === "object" && e && "message" in e ? String((e as Error).message) : "Nepodařilo se uložit.";
      alert(msg);
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
        if (!ok) alert("Nepodařilo se načíst soubor. Zkontrolujte, že jde o platný export finanční analýzy (JSON).");
      }
    };
    reader.readAsText(file);
    e.target.value = "";
  };

  const handleReset = () => {
    if (typeof window !== "undefined" && window.confirm("Opravdu chcete smazat všechny zadané údaje a začít nový plán?")) {
      reset();
      router.push("/portal/analyses/financial");
    }
  };

  return (
    <div className="flex flex-wrap items-center justify-end gap-3 pb-6 mb-6 border-b border-slate-200">
      <button
        type="button"
        onClick={handleSave}
        disabled={saving}
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg transition-colors flex items-center gap-2 font-semibold disabled:opacity-50"
        title="Uložit do Aidvisora"
      >
        <CloudUpload className="w-4 h-4" />
        <span>{saving ? "…" : "Uložit"}</span>
      </button>
      {hasCrmContext && (
        <span className="text-xs text-slate-500 hidden sm:inline">Propojeno s klientem / domácností</span>
      )}
      <Link
        href="/portal/analyses"
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 font-semibold text-slate-700"
        title="Otevřít jinou analýzu"
      >
        <List className="w-4 h-4" />
        <span className="hidden sm:inline">Otevřít analýzu</span>
      </Link>
      <button
        type="button"
        onClick={handleExportJson}
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 font-semibold text-slate-700"
        title="Záloha do souboru (JSON)"
      >
        <Download className="w-4 h-4" />
        <span className="hidden sm:inline">Export JSON</span>
      </button>
      <label className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 font-semibold text-slate-700 cursor-pointer">
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
      <button
        type="button"
        onClick={handleReset}
        className="min-h-[44px] min-w-[44px] text-sm px-4 py-2 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors flex items-center gap-2 font-semibold text-slate-700"
        title="Začít nový plán"
      >
        <PlusCircle className="w-4 h-4" />
        <span className="hidden sm:inline">Nový plán</span>
      </button>
    </div>
  );
}
