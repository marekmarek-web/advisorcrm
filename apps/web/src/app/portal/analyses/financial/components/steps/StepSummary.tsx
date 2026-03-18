"use client";

import { useState, useEffect } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectNetWorth, selectTotalTargetCapital, selectPortfolioFv } from "@/lib/analyses/financial/selectors";
import { buildReportHTML } from "@/lib/analyses/financial/report";
import { formatCzk, safeNameForFile } from "@/lib/analyses/financial/formatters";
import { uploadDocument } from "@/app/actions/documents";
import { setFinancialAnalysisLastExportedAt } from "@/app/actions/financial-analyses";
import { getAdvisorReportBranding } from "@/app/actions/preferences";
import { FileText, Printer, CloudUpload, StickyNote } from "lucide-react";

type ReportTheme = "elegant" | "modern";

function ThemeSelector({ value, onChange }: { value: ReportTheme; onChange: (t: ReportTheme) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-slate-500 uppercase tracking-wider">Šablona:</span>
      <div className="inline-flex rounded-lg border border-slate-200 overflow-hidden">
        <button
          type="button"
          onClick={() => onChange("elegant")}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors ${value === "elegant" ? "bg-slate-900 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          Elegant
        </button>
        <button
          type="button"
          onClick={() => onChange("modern")}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors ${value === "modern" ? "bg-blue-600 text-white" : "bg-white text-slate-600 hover:bg-slate-50"}`}
        >
          Modern
        </button>
      </div>
    </div>
  );
}

export function StepSummary() {
  const data = useStore((s) => s.data);
  const analysisId = useStore((s) => s.analysisId);
  const [printPayload, setPrintPayload] = useState<{ html: string } | null>(null);
  const [savingToDocs, setSavingToDocs] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const [printError, setPrintError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ReportTheme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("aidvisora_report_theme") as ReportTheme) || "elegant";
    }
    return "elegant";
  });
  const canSaveToDocuments = Boolean(data.clientId);

  const handleThemeChange = (t: ReportTheme) => {
    setSelectedTheme(t);
    if (typeof window !== "undefined") {
      localStorage.setItem("aidvisora_report_theme", t);
    }
  };

  const netWorth = selectNetWorth(data);
  const totalGoals = selectTotalTargetCapital(data);
  const portfolioFv = selectPortfolioFv(data);
  const clientName = data.client?.name || "Klient";

  const reportOptions = (data as unknown as Record<string, unknown>)._provenance
    ? { provenance: (data as unknown as Record<string, unknown>)._provenance as Record<string, "linked" | "overridden">, linkedCompanyName: undefined as unknown as string | null }
    : undefined;

  const handlePrintReport = async () => {
    setPrintError(null);
    setIsPreparingPrint(true);
    try {
      const branding = await getAdvisorReportBranding();
      const html = buildReportHTML(data, { ...reportOptions, branding, theme: selectedTheme });
      setPrintPayload({ html });
    } catch {
      setPrintError("Nepodařilo se připravit report k tisku. Zkuste to znovu.");
      setIsPreparingPrint(false);
    }
  };

  const handleSaveReportToDocuments = async () => {
    if (!canSaveToDocuments) return;
    setSavingToDocs(true);
    try {
      const branding = await getAdvisorReportBranding();
      const html = buildReportHTML(data, { ...reportOptions, branding, theme: selectedTheme });
      const safe = safeNameForFile(clientName);
      const date = new Date().toISOString().split("T")[0];
      const filename = `financni-report-${safe}-${date}.html`;
      const blob = new Blob([html], { type: "text/html" });
      const file = new File([blob], filename, { type: "text/html" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", filename);
      await uploadDocument(data.clientId!, formData, { tags: ["financial-report"] });
      if (analysisId) await setFinancialAnalysisLastExportedAt(analysisId);
    } catch (e) {
      console.error(e);
      alert(typeof e === "object" && e && "message" in e ? (e as Error).message : "Nepodařilo se uložit report.");
    } finally {
      setSavingToDocs(false);
    }
  };

  useEffect(() => {
    if (!printPayload?.html) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      const frame = document.getElementById("report-print-frame") as HTMLIFrameElement | null;
      setIsPreparingPrint(false);
      if (frame?.contentWindow) {
        frame.contentWindow.focus();
        frame.contentWindow.print();
      } else {
        const win = window.open("", "_blank");
        if (win) {
          win.document.write(printPayload.html);
          win.document.close();
          win.focus();
          win.print();
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
      setIsPreparingPrint(false);
    };
  }, [printPayload]);

  useEffect(() => {
    const afterPrint = () => setPrintPayload(null);
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  return (
    <>
      <div className="mb-6">
        <h2 className="text-2xl sm:text-3xl font-bold text-slate-900">Shrnutí</h2>
        <p className="text-slate-500 mt-1">Přehled a export / tisk reportu.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Klient</span>
          <div className="text-lg font-bold text-slate-900 mt-1">{clientName || "—"}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Čisté jmění</span>
          <div className="text-lg font-bold text-slate-900 mt-1">{formatCzk(netWorth)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Cíle celkem</span>
          <div className="text-lg font-bold text-indigo-700 mt-1">{formatCzk(totalGoals)}</div>
        </div>
        <div className="bg-white border border-slate-200 rounded-xl p-6 shadow-sm">
          <span className="text-xs text-slate-500 uppercase font-bold tracking-wider block">Projekce portfolia (FV)</span>
          <div className="text-lg font-bold text-slate-800 mt-1">{formatCzk(portfolioFv)}</div>
        </div>
      </div>

      {(data.notes != null && String(data.notes).trim() !== "") && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-6 mb-8">
          <h3 className="text-slate-800 font-bold mb-2 flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-indigo-600" />
            Poznámky k analýze
          </h3>
          <pre className="text-sm text-slate-700 whitespace-pre-wrap font-sans">{data.notes}</pre>
        </div>
      )}

      <div className="bg-slate-50 border border-slate-200 rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-slate-800 font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Export / tisk reportu
          </h3>
          <ThemeSelector value={selectedTheme} onChange={handleThemeChange} />
        </div>
        <p className="text-slate-600 text-sm mb-4">
          Vygeneruje kompletní report včetně grafů a otevře dialog pro tisk. Pro uložení do PDF zvolte v dialogu tisku „Uložit jako PDF“.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePrintReport}
            disabled={isPreparingPrint}
            aria-busy={isPreparingPrint}
            className="min-h-[44px] inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 disabled:opacity-60"
          >
            <Printer className="w-5 h-5" /> {isPreparingPrint ? "Připravuji tisk…" : "Export / tisk reportu"}
          </button>
          {canSaveToDocuments && (
            <button
              type="button"
              onClick={handleSaveReportToDocuments}
              disabled={savingToDocs}
              className="min-h-[44px] inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-700 text-white font-bold hover:bg-slate-800 disabled:opacity-50"
            >
              <CloudUpload className="w-5 h-5" /> {savingToDocs ? "Ukládám…" : "Uložit report do dokumentů"}
            </button>
          )}
        </div>
        {printError && <p className="text-sm text-red-600 mt-2" role="alert">{printError}</p>}
        {!canSaveToDocuments && (data.householdId || data.clientId === undefined) && (
          <p className="text-xs text-slate-500 mt-2">Pro uložení reportu do dokumentů otevřete analýzu z profilu klienta (s clientId).</p>
        )}
      </div>

      {printPayload?.html && (
        <iframe
          id="report-print-frame"
          srcDoc={printPayload.html}
          style={{ position: "fixed", left: "-9999px", top: 0, width: "210mm", height: "297mm", border: "none" }}
          title="Finanční report — tisk"
        />
      )}
    </>
  );
}
