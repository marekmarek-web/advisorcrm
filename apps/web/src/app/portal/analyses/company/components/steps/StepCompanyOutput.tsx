"use client";

import { useState } from "react";
import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";
import { buildBusinessReportPayload } from "@/lib/analyses/output/buildBusinessReportPayload";
import { renderReportToHTML } from "@/lib/analyses/output/renderReportToHTML";
import { safeNameForFile } from "@/lib/analyses/financial/formatters";
import { uploadDocument } from "@/app/actions/documents";
import { setCompanyAnalysisLastExportedAt } from "@/app/actions/company-financial-analyses";
import { FileText, CloudUpload } from "lucide-react";

/**
 * Step 5 – Výstup. Generuje firemní report a umožňuje uložit do dokumentů.
 */
export function StepCompanyOutput() {
  const payload = useCompanyFaStore((s) => s.payload);
  const analysisId = useCompanyFaStore((s) => s.analysisId);
  const companyId = useCompanyFaStore((s) => s.companyId);
  const primaryContactId = useCompanyFaStore((s) => s.primaryContactId);

  const [savingToDocs, setSavingToDocs] = useState(false);
  const [showPrint, setShowPrint] = useState(false);
  const [reportHtml, setReportHtml] = useState("");

  const companyName = payload.company?.name || "Firemní analýza";
  const canSaveToDocuments = Boolean(primaryContactId);

  const handleGenerateAndPrint = () => {
    const reportPayload = buildBusinessReportPayload(payload, {
      companyId: companyId ?? undefined,
      analysisId: analysisId ?? undefined,
    });
    const html = renderReportToHTML(reportPayload);
    setReportHtml(html);
    setShowPrint(true);
  };

  const handleSaveReportToDocuments = async () => {
    if (!canSaveToDocuments) return;
    setSavingToDocs(true);
    try {
      const reportPayload = buildBusinessReportPayload(payload, {
        companyId: companyId ?? undefined,
        analysisId: analysisId ?? undefined,
      });
      const html = renderReportToHTML(reportPayload);
      const safe = safeNameForFile(companyName);
      const date = new Date().toISOString().split("T")[0];
      const filename = `firemni-report-${safe}-${date}.html`;
      const blob = new Blob([html], { type: "text/html" });
      const file = new File([blob], filename, { type: "text/html" });
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", filename);
      await uploadDocument(primaryContactId!, formData, { tags: ["company-report"] });
      if (analysisId) await setCompanyAnalysisLastExportedAt(analysisId);
    } catch (e) {
      console.error(e);
      alert(typeof e === "object" && e && "message" in e ? (e as Error).message : "Nepodařilo se uložit report.");
    } finally {
      setSavingToDocs(false);
    }
  };

  return (
    <section className="p-4 md:p-6 bg-white rounded-xl border border-slate-200">
      <h3 className="text-lg font-medium text-slate-800 mb-4">Výstup</h3>
      <p className="text-slate-600 mb-4">
        Shrnutí a doporučení pro <strong>{companyName}</strong>. Můžete vygenerovat report a uložit ho do dokumentů ke klientovi.
      </p>

      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={handleGenerateAndPrint}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 bg-slate-100 text-slate-800 font-medium rounded-xl hover:bg-slate-200"
        >
          <FileText className="w-5 h-5" />
          Náhled / tisk reportu
        </button>
        <button
          type="button"
          onClick={handleSaveReportToDocuments}
          disabled={!canSaveToDocuments || savingToDocs}
          className="min-h-[44px] inline-flex items-center gap-2 px-4 py-2 bg-primary text-primary-foreground font-medium rounded-xl hover:opacity-90 disabled:opacity-50 disabled:pointer-events-none"
        >
          <CloudUpload className="w-5 h-5" />
          {savingToDocs ? "Ukládám…" : "Uložit report do dokumentů"}
        </button>
      </div>

      {!canSaveToDocuments && (
        <p className="mt-3 text-sm text-amber-700">
          Pro uložení reportu do dokumentů musí být k analýze přiřazen hlavní kontakt (primary contact). Uložte analýzu do CRM s vybranou firmou a kontaktem.
        </p>
      )}

      {showPrint && reportHtml && (
        <div className="mt-6">
          <div className="flex justify-end">
            <button
              type="button"
              onClick={() => window.print()}
              className="min-h-[44px] px-4 py-2 bg-primary text-primary-foreground font-medium rounded-xl"
            >
              Tisk
            </button>
          </div>
          <div
            className="mt-4 p-4 bg-white border border-slate-200 rounded-xl overflow-auto max-h-[70vh] print:max-h-none print:border-0"
            dangerouslySetInnerHTML={{ __html: reportHtml }}
          />
        </div>
      )}
    </section>
  );
}
