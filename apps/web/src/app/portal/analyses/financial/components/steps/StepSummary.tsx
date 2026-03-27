"use client";

import { useState, useEffect, useCallback } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectNetWorth, selectTotalTargetCapital, selectPortfolioFv } from "@/lib/analyses/financial/selectors";
import { buildReportHTML } from "@/lib/analyses/financial/report";
import { formatCzk, financialAnalysisReportFilename } from "@/lib/analyses/financial/formatters";
import { uploadDocument } from "@/app/actions/documents";
import { setFinancialAnalysisLastExportedAt } from "@/app/actions/financial-analyses";
import { getAdvisorReportBranding } from "@/app/actions/preferences";
import { FileText, Printer, CloudUpload, StickyNote, Monitor } from "lucide-react";

type ReportTheme = "elegant" | "modern";
const FALLBACK_BRANDING = {
  authorName: "Poradce",
  footerLine: "Privátní finanční plánování",
  logoUrl: null as string | null,
  phone: null as string | null,
  website: null as string | null,
};

async function embedLocalImages(html: string): Promise<string> {
  const srcRe = /src="(\/[^"]+)"/g;
  const urls = new Set<string>();
  let m: RegExpExecArray | null;
  while ((m = srcRe.exec(html)) !== null) urls.add(m[1]);
  if (urls.size === 0) return html;

  const cache = new Map<string, string>();
  await Promise.all(
    [...urls].map(async (url) => {
      try {
        const res = await fetch(url);
        if (!res.ok) return;
        const blob = await res.blob();
        const buf = await blob.arrayBuffer();
        const b64 = btoa(
          new Uint8Array(buf).reduce((s, b) => s + String.fromCharCode(b), ""),
        );
        cache.set(url, `data:${blob.type || "image/png"};base64,${b64}`);
      } catch { /* skip unreachable images */ }
    }),
  );

  return html.replace(/src="(\/[^"]+)"/g, (_full, path: string) => {
    const dataUri = cache.get(path);
    return dataUri ? `src="${dataUri}"` : _full;
  });
}

function ThemeSelector({ value, onChange }: { value: ReportTheme; onChange: (t: ReportTheme) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-[color:var(--wp-text-secondary)] uppercase tracking-wider">Styl:</span>
      <div className="inline-flex rounded-lg border border-[color:var(--wp-surface-card-border)] overflow-hidden">
        <button
          type="button"
          onClick={() => onChange("elegant")}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors ${value === "elegant" ? "bg-[color:var(--wp-primary)] text-[color:var(--wp-link-active)]" : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
        >
          Elegant
        </button>
        <button
          type="button"
          onClick={() => onChange("modern")}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors ${value === "modern" ? "bg-blue-600 text-white" : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
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
  const [isDownloading, setIsDownloading] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);
  const [selectedTheme, setSelectedTheme] = useState<ReportTheme>(() => {
    if (typeof window !== "undefined") {
      return (localStorage.getItem("aidvisora_report_theme") as ReportTheme) || "elegant";
    }
    return "elegant";
  });
  const canSaveToDocuments = Boolean(data.clientId);

  const normalizeExportError = (error: unknown, fallback: string) => {
    const msg = error instanceof Error ? error.message : "";
    if (!msg) return fallback;
    const lower = msg.toLowerCase();
    if (
      lower.includes("server components render")
      || lower.includes("omitted in production")
      || lower.includes("digest property")
      || lower.includes("unexpected response was received from the server")
    ) {
      return fallback;
    }
    return msg;
  };

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

  const generateHTML = useCallback(async () => {
    const branding = await getAdvisorReportBranding().catch(() => FALLBACK_BRANDING);
    return buildReportHTML(data, { ...reportOptions, branding, theme: selectedTheme });
  }, [data, reportOptions, selectedTheme]);

  const handleDownloadHTML = async () => {
    setExportError(null);
    setIsDownloading(true);
    try {
      let html = await generateHTML();
      html = await embedLocalImages(html);
      const filename = financialAnalysisReportFilename(clientName, "html");
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("[StepSummary] handleDownloadHTML failed", error);
      setExportError(normalizeExportError(error, "Nepodařilo se stáhnout report. Zkuste to znovu."));
    } finally {
      setIsDownloading(false);
    }
  };

  const handlePrintReport = async () => {
    setExportError(null);
    setIsPreparingPrint(true);
    try {
      const html = await generateHTML();
      setPrintPayload({ html });
    } catch (error) {
      console.error("[StepSummary] handlePrintReport failed", error);
      setExportError(normalizeExportError(error, "Nepodařilo se připravit report k tisku. Zkuste to znovu."));
      setIsPreparingPrint(false);
    }
  };

  const handleSaveReportToDocuments = async () => {
    if (!canSaveToDocuments) return;
    setSavingToDocs(true);
    try {
      const html = await generateHTML();
      const filename = financialAnalysisReportFilename(clientName, "html");
      const blob = new Blob([html], { type: "text/html" });
      const file = new File([blob], filename, { type: "text/html" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", filename);
      await uploadDocument(data.clientId!, formData, { tags: ["financial-report"] });
      if (analysisId) await setFinancialAnalysisLastExportedAt(analysisId);
    } catch (e) {
      console.error("[StepSummary] handleSaveReportToDocuments failed", e);
      alert(normalizeExportError(e, "Nepodařilo se uložit report."));
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
        } else {
          setExportError("Prohlížeč zablokoval nové okno pro tisk. Povolte vyskakovací okna a zkuste to znovu.");
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
        <h2 className="text-2xl sm:text-3xl font-bold text-[color:var(--wp-text)]">Shrnutí</h2>
        <p className="text-[color:var(--wp-text-secondary)] mt-1">Přehled a export reportu.</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
        <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl p-6 shadow-sm">
          <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Klient</span>
          <div className="text-lg font-bold text-[color:var(--wp-text)] mt-1">{clientName || "\u2014"}</div>
        </div>
        <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl p-6 shadow-sm">
          <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Čisté jmění</span>
          <div className="text-lg font-bold text-[color:var(--wp-text)] mt-1">{formatCzk(netWorth)}</div>
        </div>
        <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl p-6 shadow-sm">
          <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Cíle celkem</span>
          <div className="mt-1 text-lg font-bold text-indigo-700 dark:text-indigo-300">{formatCzk(totalGoals)}</div>
        </div>
        <div className="bg-[color:var(--wp-surface-card)] border border-[color:var(--wp-surface-card-border)] rounded-xl p-6 shadow-sm">
          <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">Projekce portfolia (FV)</span>
          <div className="text-lg font-bold text-[color:var(--wp-text)] mt-1">{formatCzk(portfolioFv)}</div>
        </div>
      </div>

      {(data.notes != null && String(data.notes).trim() !== "") && (
        <div className="bg-indigo-50/60 border border-indigo-100 rounded-2xl p-6 mb-8">
          <h3 className="text-[color:var(--wp-text)] font-bold mb-2 flex items-center gap-2">
            <StickyNote className="w-5 h-5 text-indigo-600" />
            Poznámky k analýze
          </h3>
          <pre className="text-sm text-[color:var(--wp-text-secondary)] whitespace-pre-wrap font-sans">{data.notes}</pre>
        </div>
      )}

      <div className="bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] rounded-2xl p-6">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
          <h3 className="text-[color:var(--wp-text)] font-bold flex items-center gap-2">
            <FileText className="w-5 h-5 text-indigo-600" />
            Export reportu
          </h3>
          <ThemeSelector value={selectedTheme} onChange={handleThemeChange} />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mb-4">
          <button
            type="button"
            onClick={handleDownloadHTML}
            disabled={isDownloading}
            aria-busy={isDownloading}
            className="min-h-[56px] flex items-center gap-3 px-5 py-3 rounded-xl bg-indigo-600 text-white font-bold hover:bg-indigo-500 disabled:opacity-60 transition-colors"
          >
            <Monitor className="w-5 h-5 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold">{isDownloading ? "Stahuji\u2026" : "Prezentace (HTML)"}</div>
              <div className="text-xs font-normal opacity-75">Stáhne HTML soubor k otevření v prohlížeči</div>
            </div>
          </button>
          <button
            type="button"
            onClick={handlePrintReport}
            disabled={isPreparingPrint}
            aria-busy={isPreparingPrint}
            className="flex min-h-[56px] items-center gap-3 rounded-xl bg-[color:var(--wp-button-bg)] px-5 py-3 font-bold text-white transition-colors hover:bg-[color:var(--wp-primary-hover)] disabled:opacity-60"
          >
            <Printer className="w-5 h-5 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold">{isPreparingPrint ? "Připravuji\u2026" : "PDF (Tisk)"}</div>
              <div className="text-xs font-normal opacity-75">Otevře tiskový dialog pro uložení do PDF</div>
            </div>
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {canSaveToDocuments && (
            <button
              type="button"
              onClick={handleSaveReportToDocuments}
              disabled={savingToDocs}
              className="min-h-[44px] inline-flex items-center gap-2 px-5 py-2.5 rounded-xl border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] font-semibold hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-50 transition-colors"
            >
              <CloudUpload className="w-4 h-4" /> {savingToDocs ? "Ukládám\u2026" : "Uložit do dokumentů"}
            </button>
          )}
        </div>
        {exportError && <p className="text-sm text-red-600 mt-2" role="alert">{exportError}</p>}
        {!canSaveToDocuments && (data.householdId || data.clientId === undefined) && (
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-2">Pro uložení reportu do dokumentů otevřete analýzu z profilu klienta (s clientId).</p>
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
