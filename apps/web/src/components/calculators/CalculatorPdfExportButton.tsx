"use client";

import { useEffect, useState } from "react";
import { FileDown, Loader2, Printer } from "lucide-react";
import { getAdvisorReportBranding, type AdvisorReportBranding } from "@/app/actions/preferences";
import { embedLocalImages } from "@/lib/embedLocalImages";
import {
  buildCalculatorReportHTML,
  buildCalculatorExportFilename,
  CALCULATOR_PDF_DISCLAIMER_LINES,
  type CalculatorPdfSection,
} from "@/lib/calculators/pdf";
import type { ReportBranding } from "@/lib/analyses/financial/report/types";

const FALLBACK_ADVISOR: AdvisorReportBranding = {
  authorName: "Poradce",
  footerLine: "Privátní finanční plánování",
  logoUrl: null,
  phone: null,
  website: null,
};

function mapAdvisorToReportBranding(b: AdvisorReportBranding): ReportBranding {
  return {
    advisorName: b.authorName,
    advisorRole: b.footerLine,
    logoUrl: b.logoUrl ?? undefined,
    advisorPhone: b.phone?.trim() || undefined,
    advisorWebsite: b.website?.trim() || undefined,
  };
}

function readReportTheme(): "elegant" | "modern" {
  if (typeof window === "undefined") return "elegant";
  return localStorage.getItem("aidvisora_report_theme") === "modern" ? "modern" : "elegant";
}

export interface CalculatorPdfExportButtonProps {
  documentTitle: string;
  /** `aidvisora-{prefix}-{timestamp}.html` */
  filePrefix: string;
  /** Volitelné — v PDF reportu; při vynechání prázdné řádky v hlavičce. */
  eyebrow?: string;
  subtitle?: string;
  getSections: () => CalculatorPdfSection[];
  getHeroKpis?: () => { label: string; value: string }[];
  disabled?: boolean;
}

export function CalculatorPdfExportButton({
  documentTitle,
  filePrefix,
  eyebrow = "",
  subtitle = "",
  getSections,
  getHeroKpis,
  disabled = false,
}: CalculatorPdfExportButtonProps) {
  const [loadingPrint, setLoadingPrint] = useState(false);
  const [loadingHtml, setLoadingHtml] = useState(false);
  const [printPayload, setPrintPayload] = useState<{ html: string } | null>(null);
  const [error, setError] = useState<string | null>(null);

  const buildHtml = async (): Promise<string> => {
    const advisor = await getAdvisorReportBranding().catch(() => FALLBACK_ADVISOR);
    const branding = mapAdvisorToReportBranding(advisor);
    const theme = readReportTheme();
    const sections = getSections();
    const heroKpis = getHeroKpis?.() ?? [];
    let html = buildCalculatorReportHTML({
      documentTitle,
      eyebrow,
      subtitle,
      sections,
      disclaimerLines: [...CALCULATOR_PDF_DISCLAIMER_LINES],
      theme,
      branding,
      heroKpis,
    });
    html = await embedLocalImages(html);
    return html;
  };

  const handlePrintPdf = () => {
    if (loadingPrint || loadingHtml || disabled) return;
    void (async () => {
      setLoadingPrint(true);
      setError(null);
      try {
        const html = await buildHtml();
        setPrintPayload({ html });
      } catch (e) {
        console.error(e);
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Nepodařilo se připravit dokument k tisku. Zkuste to znovu.",
        );
      } finally {
        setLoadingPrint(false);
      }
    })();
  };

  const handleDownloadHtml = () => {
    if (loadingPrint || loadingHtml || disabled) return;
    void (async () => {
      setLoadingHtml(true);
      setError(null);
      try {
        const html = await buildHtml();
        const filename = buildCalculatorExportFilename(filePrefix, "html");
        const blob = new Blob([html], { type: "text/html;charset=utf-8" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
      } catch (e) {
        console.error(e);
        setError(
          e instanceof Error && e.message
            ? e.message
            : "Nepodařilo se stáhnout HTML. Zkuste to znovu.",
        );
      } finally {
        setLoadingHtml(false);
      }
    })();
  };

  useEffect(() => {
    if (!printPayload?.html) return;

    let cancelled = false;
    const timeout = setTimeout(() => {
      if (cancelled) return;
      const frame = document.getElementById("calculator-report-print-frame") as HTMLIFrameElement | null;
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
          setError("Prohlížeč zablokoval nové okno pro tisk. Povolte vyskakovací okna a zkuste to znovu.");
        }
      }
    }, 600);

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [printPayload]);

  useEffect(() => {
    const afterPrint = () => setPrintPayload(null);
    window.addEventListener("afterprint", afterPrint);
    return () => window.removeEventListener("afterprint", afterPrint);
  }, []);

  const loading = loadingPrint || loadingHtml;

  return (
    <div className="flex w-full flex-col items-stretch gap-2 md:w-auto md:items-end">
      <div className="flex w-full flex-col gap-2 sm:flex-row sm:flex-wrap sm:justify-end">
        <button
          type="button"
          onClick={handlePrintPdf}
          disabled={disabled || loading}
          title="Otevře dialog tisku — v prohlížeči zvolte Uložit jako PDF"
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border-[1.5px] border-[#e2e8f0] bg-white px-4 py-2.5 text-sm font-semibold text-[#0d1f4e] shadow-sm transition-colors hover:border-blue-200 hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          {loadingPrint ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <Printer className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{loadingPrint ? "Připravuji…" : "Tisk / PDF"}</span>
        </button>
        <button
          type="button"
          onClick={handleDownloadHtml}
          disabled={disabled || loading}
          className="inline-flex min-h-[44px] w-full items-center justify-center gap-2 rounded-[14px] border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-100 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 sm:w-auto"
        >
          {loadingHtml ? (
            <Loader2 className="h-4 w-4 shrink-0 animate-spin" aria-hidden />
          ) : (
            <FileDown className="h-4 w-4 shrink-0" aria-hidden />
          )}
          <span>{loadingHtml ? "Stahuji…" : "Stáhnout HTML"}</span>
        </button>
      </div>
      {error ? (
        <p className="max-w-[min(100%,320px)] text-left text-xs leading-snug text-red-600 md:text-right" role="alert">
          {error}
        </p>
      ) : null}
      {printPayload?.html ? (
        <iframe
          id="calculator-report-print-frame"
          srcDoc={printPayload.html}
          style={{ position: "fixed", left: "-9999px", top: 0, width: "210mm", height: "297mm", border: "none" }}
          title="Kalkulačka — tisk"
        />
      ) : null}
    </div>
  );
}
