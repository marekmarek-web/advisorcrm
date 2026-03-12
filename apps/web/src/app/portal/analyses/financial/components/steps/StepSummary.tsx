"use client";

import { useState, useRef, useEffect } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectNetWorth, selectTotalTargetCapital, selectPortfolioFv } from "@/lib/analyses/financial/selectors";
import { buildReportHTML } from "@/lib/analyses/financial/report";
import { getGrowthChartData, getAllocationChartData } from "@/lib/analyses/financial/charts";
import { formatCzk, safeNameForFile } from "@/lib/analyses/financial/formatters";
import { uploadDocument } from "@/app/actions/documents";
import { setFinancialAnalysisLastExportedAt } from "@/app/actions/financial-analyses";
import { FileText, Printer, CloudUpload, StickyNote } from "lucide-react";
import { Chart, CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler } from "chart.js";

Chart.register(CategoryScale, LinearScale, PointElement, LineElement, ArcElement, Title, Tooltip, Legend, Filler);

export function StepSummary() {
  const data = useStore((s) => s.data);
  const analysisId = useStore((s) => s.analysisId);
  const [showPrintReport, setShowPrintReport] = useState(false);
  const [reportHtml, setReportHtml] = useState("");
  const [savingToDocs, setSavingToDocs] = useState(false);
  const [isPreparingPrint, setIsPreparingPrint] = useState(false);
  const chartRefs = useRef<{ growth: Chart | null; allocation: Chart | null }>({ growth: null, allocation: null });
  const canSaveToDocuments = Boolean(data.clientId);

  const netWorth = selectNetWorth(data);
  const totalGoals = selectTotalTargetCapital(data);
  const portfolioFv = selectPortfolioFv(data);
  const clientName = data.client?.name || "Klient";

  const reportOptions = (data as unknown as Record<string, unknown>)._provenance
    ? { provenance: (data as unknown as Record<string, unknown>)._provenance as Record<string, "linked" | "overridden">, linkedCompanyName: undefined as unknown as string | null }
    : undefined;

  const handlePrintReport = () => {
    chartRefs.current.growth = null;
    chartRefs.current.allocation = null;
    setIsPreparingPrint(true);
    setReportHtml(buildReportHTML(data, reportOptions));
    setShowPrintReport(true);
  };

  const handleSaveReportToDocuments = async () => {
    if (!canSaveToDocuments) return;
    setSavingToDocs(true);
    try {
      const html = buildReportHTML(data, reportOptions);
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
    if (!showPrintReport || !reportHtml) return;

    const drawCharts = () => {
      const growthCanvas = document.getElementById("pdf-chart-growth") as HTMLCanvasElement | null;
      const allocationCanvas = document.getElementById("pdf-chart-allocation") as HTMLCanvasElement | null;

      if (growthCanvas) {
        const { labels, values } = getGrowthChartData(data);
        chartRefs.current.growth = new Chart(growthCanvas, {
          type: "line",
          data: {
            labels: labels.map(String),
            datasets: [{ label: "Hodnota portfolia (Kč)", data: values, borderColor: "rgb(15, 23, 42)", backgroundColor: "rgba(15, 23, 42, 0.1)", fill: true }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
              x: { title: { display: true, text: "Rok" } },
              y: { beginAtZero: true },
            },
          },
        });
      }

      if (allocationCanvas) {
        const { labels, values } = getAllocationChartData(data);
        chartRefs.current.allocation = new Chart(allocationCanvas, {
          type: "doughnut",
          data: {
            labels,
            datasets: [{ data: values, backgroundColor: ["#0f172a", "#1e40af", "#7c3aed", "#059669", "#d97706", "#dc2626", "#0891b2"] }],
          },
          options: {
            responsive: true,
            maintainAspectRatio: false,
            plugins: { legend: { position: "bottom" } },
          },
        });
      }

      requestAnimationFrame(() => {
        setTimeout(() => {
          setIsPreparingPrint(false);
          window.print();
        }, 300);
      });
    };

    const t = setTimeout(drawCharts, 100);
    return () => {
      clearTimeout(t);
      if (chartRefs.current.growth) {
        chartRefs.current.growth.destroy();
        chartRefs.current.growth = null;
      }
      if (chartRefs.current.allocation) {
        chartRefs.current.allocation.destroy();
        chartRefs.current.allocation = null;
      }
    };
  }, [showPrintReport, reportHtml, data]);

  useEffect(() => {
    const afterPrint = () => setShowPrintReport(false);
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
        <h3 className="text-slate-800 font-bold mb-2 flex items-center gap-2">
          <FileText className="w-5 h-5 text-indigo-600" />
          Export / tisk reportu
        </h3>
        <p className="text-slate-600 text-sm mb-4">
          Vygeneruje kompletní report včetně grafů a otevře dialog pro tisk. Pro uložení do PDF zvolte v dialogu tisku „Uložit jako PDF“.
        </p>
        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handlePrintReport}
            disabled={isPreparingPrint}
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
        {!canSaveToDocuments && (data.householdId || data.clientId === undefined) && (
          <p className="text-xs text-slate-500 mt-2">Pro uložení reportu do dokumentů otevřete analýzu z profilu klienta (s clientId).</p>
        )}
      </div>

      {showPrintReport && (
        <div
          id="report-print-root"
          style={{ position: "fixed", left: "-9999px", top: 0, width: "210mm", zIndex: 9999 }}
        >
          <div dangerouslySetInnerHTML={{ __html: reportHtml }} />
        </div>
      )}

      <style jsx global>{`
        @media print {
          @page { size: A4 portrait; margin: 0; }
          * {
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          body {
            margin: 0 !important;
            padding: 0 !important;
            background: white !important;
          }
          body * { visibility: hidden; }
          #report-print-root,
          #report-print-root * { visibility: visible; }
          #report-print-root {
            position: absolute !important;
            left: 0 !important;
            top: 0 !important;
            width: 100% !important;
            overflow: visible !important;
          }
          .pdf-page {
            width: 210mm !important;
            height: 297mm !important;
            min-height: 297mm !important;
            max-height: 297mm !important;
            margin: 0 !important;
            padding: 15mm !important;
            box-shadow: none !important;
            border-radius: 0 !important;
            page-break-after: always !important;
            background: white !important;
            box-sizing: border-box !important;
          }
          .pdf-page:last-child { page-break-after: auto !important; }
          .avoid-break {
            break-inside: avoid !important;
            page-break-inside: avoid !important;
          }
        }
      `}</style>
    </>
  );
}
