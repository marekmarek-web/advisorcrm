"use client";

import { useState, useEffect, useCallback } from "react";
import { useFinancialAnalysisStore as useStore } from "@/lib/analyses/financial/store";
import { selectNetWorth, selectTotalTargetCapital, selectPortfolioFv } from "@/lib/analyses/financial/selectors";
import { buildReportHTML } from "@/lib/analyses/financial/report";
import { formatCzk, financialAnalysisReportFilename } from "@/lib/analyses/financial/formatters";
import { uploadDocument } from "@/app/actions/documents";
import { setFinancialAnalysisLastExportedAt } from "@/app/actions/financial-analyses";
import { getAdvisorReportBranding } from "@/app/actions/preferences";
import clsx from "clsx";
import { FileText, Printer, CloudUpload, StickyNote, Monitor, TrendingUp, HelpCircle, Eye, Share2, X } from "lucide-react";
import { getClientPortfolioForContact } from "@/app/actions/contracts";
import {
  buildFaCanonicalInvestmentOverviewRows,
  type FaCanonicalInvestmentOverviewRow,
} from "@/lib/analyses/financial/fa-canonical-investment-overview";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import { embedLocalImages } from "@/lib/embedLocalImages";

type ReportTheme = "elegant" | "modern";
const FALLBACK_BRANDING = {
  authorName: "Poradce",
  footerLine: "Privátní finanční plánování",
  logoUrl: null as string | null,
  phone: null as string | null,
  website: null as string | null,
  reportContactEmail: null as string | null,
};

function ThemeSelector({ value, onChange }: { value: ReportTheme; onChange: (t: ReportTheme) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-xs font-semibold text-[color:var(--wp-text-secondary)] uppercase tracking-wider">Vzhled:</span>
      <div className="inline-flex rounded-lg border border-[color:var(--wp-surface-card-border)] overflow-hidden">
        <button
          type="button"
          onClick={() => onChange("elegant")}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors ${value === "elegant" ? "bg-[color:var(--wp-primary)] text-[color:var(--wp-link-active)]" : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
        >
          Klasický
        </button>
        <button
          type="button"
          onClick={() => onChange("modern")}
          className={`min-h-[44px] px-4 py-2 text-sm font-semibold transition-colors ${value === "modern" ? "bg-blue-600 text-white" : "bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]"}`}
        >
          Moderní
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
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [isPreparingPreview, setIsPreparingPreview] = useState(false);
  const [isSharing, setIsSharing] = useState(false);
  const [crmInvestments, setCrmInvestments] = useState<FaCanonicalInvestmentOverviewRow[]>([]);
  const [crmInvestmentsError, setCrmInvestmentsError] = useState<string | null>(null);
  const [howToReadOpen, setHowToReadOpen] = useState(false);
  const [crmHelpOpen, setCrmHelpOpen] = useState(false);
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
  const sumEvidenceFvCzk = crmInvestments.reduce((s, r) => s + (r.futureValueAmount ?? 0), 0);
  const clientName = data.client?.name || "Klient";

  const reportOptions = (data as unknown as Record<string, unknown>)._provenance
    ? { provenance: (data as unknown as Record<string, unknown>)._provenance as Record<string, "linked" | "overridden">, linkedCompanyName: undefined as unknown as string | null }
    : undefined;

  useEffect(() => {
    const clientId = data.clientId;
    if (!clientId) {
      setCrmInvestments([]);
      setCrmInvestmentsError(null);
      return;
    }
    let cancelled = false;
    getClientPortfolioForContact(clientId)
      .then((rows) => {
        if (cancelled) return;
        setCrmInvestments(buildFaCanonicalInvestmentOverviewRows(rows));
        setCrmInvestmentsError(null);
      })
      .catch(() => {
        if (cancelled) return;
        setCrmInvestments([]);
        setCrmInvestmentsError("Nepodařilo se načíst investice z evidence smluv.");
      });
    return () => {
      cancelled = true;
    };
  }, [data.clientId]);

  const generateHTML = useCallback(async () => {
    const branding = await getAdvisorReportBranding().catch(() => FALLBACK_BRANDING);
    return buildReportHTML(data, {
      ...reportOptions,
      branding,
      theme: selectedTheme,
      canonicalInvestmentOverview: crmInvestments.length > 0 ? crmInvestments : undefined,
    });
  }, [data, reportOptions, selectedTheme, crmInvestments]);

  const isMobileClient = typeof window !== "undefined"
    && (/iPhone|iPad|iPod|Android/i.test(window.navigator.userAgent) || Boolean((window as unknown as { Capacitor?: unknown }).Capacitor));

  const handleOpenPreview = async () => {
    setExportError(null);
    setIsPreparingPreview(true);
    try {
      let html = await generateHTML();
      html = await embedLocalImages(html);
      setPreviewHtml(html);
    } catch (error) {
      console.error("[StepSummary] handleOpenPreview failed", error);
      setExportError(normalizeExportError(error, "Nepodařilo se připravit náhled reportu."));
    } finally {
      setIsPreparingPreview(false);
    }
  };

  const handleShareReport = async () => {
    setExportError(null);
    setIsSharing(true);
    try {
      let html = previewHtml;
      if (!html) {
        html = await generateHTML();
        html = await embedLocalImages(html);
      }
      const filename = financialAnalysisReportFilename(clientName, "html");
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const file = new File([blob], filename, { type: "text/html" });
      const navAny = window.navigator as Navigator & {
        canShare?: (data: ShareData) => boolean;
        share?: (data: ShareData) => Promise<void>;
      };
      const shareData: ShareData = { files: [file], title: filename, text: `Finanční report — ${clientName}` };
      if (navAny.canShare?.(shareData) && navAny.share) {
        await navAny.share(shareData);
        return;
      }
      // Fallback: open blob in new tab so the user can view/save it manually.
      const url = URL.createObjectURL(blob);
      const opened = window.open(url, "_blank");
      if (!opened) window.location.href = url;
      setTimeout(() => URL.revokeObjectURL(url), 60_000);
    } catch (error) {
      const msg = error instanceof Error ? error.message : "";
      if (msg.toLowerCase().includes("abort")) return;
      console.error("[StepSummary] handleShareReport failed", error);
      setExportError(normalizeExportError(error, "Sdílení se nezdařilo. Zkuste Stáhnout."));
    } finally {
      setIsSharing(false);
    }
  };

  const handleDownloadHTML = async () => {
    setExportError(null);
    setIsDownloading(true);
    try {
      let html = await generateHTML();
      html = await embedLocalImages(html);
      const filename = financialAnalysisReportFilename(clientName, "html");
      const blob = new Blob([html], { type: "text/html;charset=utf-8" });
      const url = URL.createObjectURL(blob);
      // Na mobilním WebView <a download> často nedělá nic — raději report otevřeme.
      if (isMobileClient) {
        const opened = window.open(url, "_blank");
        if (!opened) window.location.href = url;
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
        return;
      }
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
      setExportError(normalizeExportError(e, "Nepodařilo se uložit report."));
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
          <span className="text-xs text-[color:var(--wp-text-secondary)] uppercase font-bold tracking-wider block">
            Modelace strategie (orientační součet)
          </span>
          <div className="text-lg font-bold text-[color:var(--wp-text)] mt-1">{formatCzk(portfolioFv)}</div>
          <p className="text-xs text-[color:var(--wp-text-secondary)] mt-2 leading-snug">
            Součet odhadů z mřížky v kroku strategie — není to automaticky totéž jako součet z evidence smluv níže.
          </p>
        </div>
      </div>

      <div className="mb-6 max-w-4xl">
        <button
          type="button"
          onClick={() => setHowToReadOpen((v) => !v)}
          className="inline-flex items-center gap-2 text-xs font-semibold text-[color:var(--wp-text-secondary)] hover:text-[color:var(--wp-text)] transition-colors"
          aria-expanded={howToReadOpen}
        >
          <HelpCircle size={14} aria-hidden /> Jak číst dva přehledy vedle sebe
        </button>
        {howToReadOpen && (
          <div className="mt-2 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4 text-sm text-[color:var(--wp-text-secondary)]">
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong className="text-[color:var(--wp-text)]">Evidence skutečných investic</strong> — produkty zapsané u klienta v Aidvisoře po schválení; odhad budoucí hodnoty používá stejný model jako klientské portfolio.
              </li>
              <li>
                <strong className="text-[color:var(--wp-text)]">Modelace v kroku strategie</strong> — vámi zadaný návrhový scénář v průvodci analýzy; slouží k porovnání variant, není závazným stavem smluv.
              </li>
              <li>Orientační odhad není záruka budoucího výnosu ani konečné částky.</li>
            </ul>
          </div>
        )}
      </div>

      <div className="mb-8">
        <h3 className="text-lg font-bold text-[color:var(--wp-text)] mb-2 flex items-center gap-2">
          <TrendingUp className="w-5 h-5 text-indigo-600 shrink-0" />
          Investice z evidence smluv
          <button
            type="button"
            onClick={() => setCrmHelpOpen((v) => !v)}
            className="ml-1 inline-flex items-center justify-center text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)] transition-colors"
            title="Co to znamená?"
            aria-label="Co to znamená?"
            aria-expanded={crmHelpOpen}
          >
            <HelpCircle size={16} aria-hidden />
          </button>
        </h3>
        {crmHelpOpen && (
          <p className="text-sm text-[color:var(--wp-text-secondary)] mb-4 max-w-3xl rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-3">
            Stejné údaje jako v klientském portfoliu a v záložce Produkty u klienta. Odhad budoucí hodnoty vychází ze stejného výpočtu jako u zveřejněného portfolia — jen tam, kde jsou v evidenci potřebné údaje.
          </p>
        )}
        {data.clientId && crmInvestments.length > 0 && sumEvidenceFvCzk > 0 && (
          <p className="text-sm font-semibold text-[color:var(--wp-text)] mb-3">
            Součet orientační FV z evidence (řádky, kde šel odhad spočítat):{" "}
            <span className="text-indigo-700 dark:text-indigo-300">{formatCzk(sumEvidenceFvCzk)}</span>
          </p>
        )}
        {!data.clientId ? (
          <div className="rounded-xl border border-dashed border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-5 text-sm text-[color:var(--wp-text-secondary)]">
            Propojte analýzu s klientem v úvodním kroku, aby se zde zobrazil přehled investičních a penzijních smluv z evidence.
          </div>
        ) : crmInvestmentsError ? (
          <p className="text-sm text-red-600" role="alert">
            {crmInvestmentsError}
          </p>
        ) : crmInvestments.length === 0 ? (
          <div className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 text-sm text-[color:var(--wp-text-secondary)]">
            Žádná odpovídající investiční ani penzijní smlouva ve sledovaných typech — přehled bere jen zveřejněné produkty ve stejném rozsahu jako klientské portfolio.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-sm">
            <table className="min-w-full text-sm">
              <thead>
                <tr className="border-b border-[color:var(--wp-surface-card-border)] text-left text-xs uppercase tracking-wider text-[color:var(--wp-text-secondary)]">
                  <th className="px-4 py-3 font-bold">Produkt</th>
                  <th className="px-4 py-3 font-bold">Instituce</th>
                  <th className="px-4 py-3 font-bold">Fond / strategie</th>
                  <th className="px-4 py-3 font-bold">Platba</th>
                  <th className="px-4 py-3 font-bold">Horizont</th>
                  <th className="px-4 py-3 font-bold text-right">Odhad FV</th>
                </tr>
              </thead>
              <tbody>
                {crmInvestments.map((row) => (
                  <tr key={row.contractId} className="border-b border-[color:var(--wp-surface-card-border)] last:border-0">
                    <td className="px-4 py-3 align-top">
                      <div className="font-semibold text-[color:var(--wp-text)]">{row.productTitle}</div>
                      <div className="text-xs text-[color:var(--wp-text-secondary)] mt-0.5">{row.segmentLabel}</div>
                    </td>
                    <td className="px-4 py-3 align-top text-[color:var(--wp-text-secondary)]">{row.institution ?? "—"}</td>
                    <td className="px-4 py-3 align-top text-[color:var(--wp-text-secondary)]">{row.fundOrStrategy ?? "—"}</td>
                    <td className="px-4 py-3 align-top text-[color:var(--wp-text)]">{row.contributionSummary}</td>
                    <td className="px-4 py-3 align-top text-[color:var(--wp-text-secondary)]">{row.horizonLabel ?? "—"}</td>
                    <td className="px-4 py-3 align-top text-right">
                      {row.futureValueFormatted ? (
                        <div>
                          <div className="font-bold text-indigo-700 dark:text-indigo-300">{row.futureValueFormatted}</div>
                          {row.futureValueNotes.length > 0 && (
                            <ul className="mt-2 space-y-1 text-xs text-[color:var(--wp-text-secondary)] text-right list-none">
                              {row.futureValueNotes.map((note, i) => (
                                <li key={i}>{note}</li>
                              ))}
                            </ul>
                          )}
                        </div>
                      ) : (
                        <span className="text-[color:var(--wp-text-secondary)]">—</span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 mb-4">
          <button
            type="button"
            onClick={handleOpenPreview}
            disabled={isPreparingPreview}
            aria-busy={isPreparingPreview}
            className={clsx(portalPrimaryButtonClassName, "min-h-[56px] flex items-center gap-3 px-5 py-3 disabled:opacity-60")}
          >
            <Eye className="w-5 h-5 flex-shrink-0" />
            <div className="text-left">
              <div className="text-sm font-bold">{isPreparingPreview ? "Připravuji\u2026" : "Zobrazit report"}</div>
              <div className="text-xs font-normal opacity-75">Otevře report přímo v aplikaci</div>
            </div>
          </button>
          <button
            type="button"
            onClick={isMobileClient ? handleShareReport : handleDownloadHTML}
            disabled={isSharing || isDownloading}
            aria-busy={isSharing || isDownloading}
            className="flex min-h-[56px] items-center gap-3 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-5 py-3 font-bold text-[color:var(--wp-text)] transition-colors hover:bg-[color:var(--wp-surface-muted)] disabled:opacity-60"
          >
            {isMobileClient ? <Share2 className="w-5 h-5 flex-shrink-0" /> : <Monitor className="w-5 h-5 flex-shrink-0" />}
            <div className="text-left">
              <div className="text-sm font-bold">
                {isMobileClient
                  ? (isSharing ? "Sdílím\u2026" : "Sdílet / Uložit")
                  : (isDownloading ? "Stahuji\u2026" : "Stáhnout (HTML)")}
              </div>
              <div className="text-xs font-normal opacity-75">
                {isMobileClient ? "Odeslat přes systém nebo do Files" : "HTML soubor k otevření v prohlížeči"}
              </div>
            </div>
          </button>
          {!isMobileClient && (
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
                <div className="text-xs font-normal opacity-75">Tiskový dialog pro PDF</div>
              </div>
            </button>
          )}
        </div>

        <div className="flex flex-wrap justify-center items-center gap-3">
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

      {previewHtml && (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Náhled reportu"
          className="fixed inset-0 z-[100] flex flex-col bg-[color:var(--wp-bg)]"
        >
          <div
            className="flex items-center justify-between gap-2 border-b border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-3 py-2"
            style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
          >
            <button
              type="button"
              onClick={() => setPreviewHtml(null)}
              className="inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 rounded-lg font-semibold text-sm text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface-muted)]"
            >
              <X className="w-4 h-4" />
              Zavřít
            </button>
            <div className="flex-1 min-w-0 text-center">
              <div className="truncate text-sm font-bold text-[color:var(--wp-text)]">Náhled reportu</div>
              <div className="truncate text-xs text-[color:var(--wp-text-secondary)]">{clientName}</div>
            </div>
            <button
              type="button"
              onClick={handleShareReport}
              disabled={isSharing}
              className={clsx(portalPrimaryButtonClassName, "inline-flex items-center gap-1.5 min-h-[44px] px-3 py-2 text-sm disabled:opacity-60")}
            >
              <Share2 className="w-4 h-4" />
              {isSharing ? "Sdílím\u2026" : "Sdílet"}
            </button>
          </div>
          <iframe
            srcDoc={previewHtml}
            title="Náhled finančního reportu"
            className="flex-1 w-full border-0 bg-white"
            style={{ paddingBottom: "env(safe-area-inset-bottom)" }}
            sandbox="allow-same-origin allow-popups"
          />
        </div>
      )}
    </>
  );
}
