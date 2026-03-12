"use client";

import { useState, useRef, useEffect } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import {
  validateCompanyFaImport,
  getCompanyFaImportPreview,
  executeCompanyFaImport,
} from "@/app/actions/company-fa-import";
import {
  listCompanyAnalyses,
  getCompanyAnalysis,
  saveCompanyAnalysisDraft,
} from "@/app/actions/company-financial-analyses";
import type { CompanyFaPayload, CompanyFaImportPreview } from "@/lib/analyses/company-fa/types";
import type { CompanyFaImportOptions } from "@/lib/analyses/company-fa/types";
import type { CompanyAnalysisListItem } from "@/app/actions/company-financial-analyses";
import { detectAnalysisJsonType } from "@/lib/analyses/company-fa/detectAnalysisJsonType";
import { useCompanyFaStore } from "@/lib/analyses/company-fa/store";
import { CompanyAnalysisLayout } from "./components/CompanyAnalysisLayout";

const PERSONAL_FA_IMPORT_KEY = "financial_analysis_import";

type Step = "upload" | "preview" | "success" | "error" | "personal_detected";

type ShellState = {
  payload: CompanyFaPayload;
  analysisId: string | null;
  companyId: string | null;
  primaryContactId: string | null;
  importOptions: CompanyFaImportOptions | null;
};

export default function CompanyAnalysesPage() {
  const searchParams = useSearchParams();
  const idParam = searchParams.get("id");
  const router = useRouter();

  const [step, setStep] = useState<Step>("upload");
  const [validationErrors, setValidationErrors] = useState<string[]>([]);
  const [preview, setPreview] = useState<CompanyFaImportPreview | null>(null);
  const [normalizedPayload, setNormalizedPayload] = useState<CompanyFaPayload | null>(null);
  const [createNewCompany, setCreateNewCompany] = useState(true);
  const [directorContactIds, setDirectorContactIds] = useState<Record<number, string>>({});
  const [importError, setImportError] = useState<string | null>(null);
  const [resultAnalysisId, setResultAnalysisId] = useState<string | null>(null);
  const [analyses, setAnalyses] = useState<CompanyAnalysisListItem[]>([]);
  const [listLoading, setListLoading] = useState(true);
  const [personalJsonText, setPersonalJsonText] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [loadedRow, setLoadedRow] = useState<Awaited<ReturnType<typeof getCompanyAnalysis>>>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [shellState, setShellState] = useState<ShellState | null>(null);
  const [saveLoading, setSaveLoading] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  const loadList = () => {
    setListLoading(true);
    listCompanyAnalyses()
      .then(setAnalyses)
      .finally(() => setListLoading(false));
  };

  useEffect(() => {
    loadList();
  }, []);

  useEffect(() => {
    if (!idParam) {
      setLoadedRow(null);
      setLoadError(null);
      return;
    }
    setLoadError(null);
    getCompanyAnalysis(idParam)
      .then((row) => {
        setLoadedRow(row);
        if (!row) setLoadError("Analýza nenalezena.");
      })
      .catch(() => setLoadError("Nepodařilo se načíst analýzu."));
  }, [idParam]);

  useEffect(() => {
    if (!loadedRow) return;
    setShellState((prev) => {
      if (prev && prev.analysisId === loadedRow.id) return prev;
      return {
        payload: loadedRow.payload,
        analysisId: loadedRow.id,
        companyId: loadedRow.companyId ?? null,
        primaryContactId: loadedRow.primaryContactId ?? null,
        importOptions: null,
      };
    });
  }, [loadedRow]);

  useEffect(() => {
    if (!shellState) return;
    useCompanyFaStore.getState().loadFromServerPayload(shellState.payload);
    useCompanyFaStore.getState().setAnalysisId(shellState.analysisId);
    useCompanyFaStore.getState().setCompanyId(shellState.companyId ?? null);
    useCompanyFaStore.getState().setPrimaryContactId(shellState.primaryContactId ?? null);
  }, [shellState]);

  const handleShellSave = async () => {
    if (!shellState) return;
    const payload = useCompanyFaStore.getState().payload;
    const analysisId = useCompanyFaStore.getState().analysisId;
    setSaveError(null);
    setSaveLoading(true);
    try {
      if (analysisId) {
        await saveCompanyAnalysisDraft(analysisId, payload);
      } else {
        const result = await executeCompanyFaImport(payload, {
          createNewCompany: shellState.importOptions?.createNewCompany ?? true,
          suggestedCompanyId: shellState.importOptions?.suggestedCompanyId ?? null,
          directorContactIds: shellState.importOptions?.directorContactIds,
        });
        setShellState(null);
        router.push(`/portal/analyses/company?id=${result.analysisId}`);
        loadList();
      }
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : String(err));
    } finally {
      setSaveLoading(false);
    }
  };

  const openShellAndEdit = () => {
    if (!normalizedPayload || !preview) return;
    setShellState({
      payload: normalizedPayload,
      analysisId: null,
      companyId: null,
      primaryContactId: null,
      importOptions: {
        createNewCompany,
        suggestedCompanyId: createNewCompany ? null : preview.suggestedCompanyId,
        directorContactIds: Object.keys(directorContactIds).length > 0 ? directorContactIds : undefined,
      },
    });
  };

  const closeShell = () => {
    setShellState(null);
    setSaveError(null);
    if (idParam) router.push("/portal/analyses/company");
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setValidationErrors([]);
    setPreview(null);
    setNormalizedPayload(null);
    setPersonalJsonText(null);
    setStep("upload");
    const text = await file.text();
    let raw: unknown;
    try {
      raw = JSON.parse(text);
    } catch {
      setValidationErrors(["Soubor není platný JSON."]);
      setStep("error");
      return;
    }
    const jsonType = detectAnalysisJsonType(raw);
    if (jsonType === "personal") {
      setPersonalJsonText(text);
      setStep("personal_detected");
      return;
    }
    if (jsonType === null) {
      setValidationErrors(["Nepodporovaný formát JSON. Očekává se firemní analýza (company, directors) nebo osobní (data/client)."]);
      setStep("error");
      return;
    }
    const result = await validateCompanyFaImport(raw);
    if (!result.success) {
      setValidationErrors(result.errors);
      setStep("error");
      return;
    }
    setNormalizedPayload(result.normalized);
    const previewData = await getCompanyFaImportPreview(result.normalized);
    setPreview(previewData);
    setCreateNewCompany(!previewData.suggestedCompanyId);
    setDirectorContactIds(
      Object.fromEntries(
        previewData.directorsPreview
          .filter((d) => d.suggestedContactId)
          .map((d) => [d.index, d.suggestedContactId!])
      )
    );
    setStep("preview");
  };

  const handleConfirmImport = async () => {
    if (!normalizedPayload || !preview) return;
    setImportError(null);
    try {
      const result = await executeCompanyFaImport(normalizedPayload, {
        createNewCompany,
        suggestedCompanyId: createNewCompany ? null : preview.suggestedCompanyId,
        directorContactIds: Object.keys(directorContactIds).length > 0 ? directorContactIds : undefined,
      });
      setResultAnalysisId(result.analysisId);
      setStep("success");
      loadList();
    } catch (err) {
      setImportError(err instanceof Error ? err.message : String(err));
      setStep("error");
    }
  };

  const openInPersonalFa = () => {
    if (personalJsonText && typeof window !== "undefined") {
      window.sessionStorage.setItem(PERSONAL_FA_IMPORT_KEY, personalJsonText);
      router.push("/portal/analyses/financial?fromImport=1");
    }
  };

  const resetFlow = () => {
    setStep("upload");
    setPreview(null);
    setNormalizedPayload(null);
    setPersonalJsonText(null);
    setValidationErrors([]);
    setImportError(null);
    setResultAnalysisId(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  if (idParam && !loadedRow && !loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-slate-600">Načítání analýzy…</p>
      </div>
    );
  }

  if (idParam && loadError) {
    return (
      <div className="max-w-2xl mx-auto px-4 py-8">
        <p className="text-slate-700 font-medium mb-2">{loadError}</p>
        <Link
          href="/portal/analyses/company"
          className="min-h-[44px] inline-flex items-center px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90"
        >
          Zpět na seznam
        </Link>
      </div>
    );
  }

  if (shellState) {
    return (
      <div className="max-w-4xl mx-auto px-4 py-6 md:py-8">
        <div className="mb-4">
          <Link
            href="/portal/analyses/company"
            onClick={(e) => {
              e.preventDefault();
              closeShell();
            }}
            className="text-sm text-primary font-medium hover:underline min-h-[44px] flex items-center"
          >
            Zpět na seznam firemních analýz
          </Link>
        </div>
        <CompanyAnalysisLayout
          onSave={handleShellSave}
          saving={saveLoading}
          saveError={saveError}
        />
      </div>
    );
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-slate-900 mb-2">Firemní finanční analýzy</h1>
      <p className="text-slate-600 mb-6">
        Import analýz z JSON (export z FA s.r.o. hlavní) nebo seznam uložených analýz.
      </p>

      <section className="mb-8">
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Import JSON</h2>
        <input
          ref={fileInputRef}
          type="file"
          accept=".json"
          onChange={handleFileChange}
          className="block w-full text-sm text-slate-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:bg-primary file:text-primary-foreground file:font-semibold file:cursor-pointer hover:file:opacity-90"
        />
      </section>

      {step === "personal_detected" && (
        <section className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-2">Osobní finanční analýza</h2>
          <p className="text-slate-600 text-sm mb-4">
            Nahraný soubor je ve formátu osobní finanční analýzy. Můžete ji otevřít v modulu osobní FA, upravit a uložit do CRM.
          </p>
          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={openInPersonalFa}
              className="min-h-[44px] px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90"
            >
              Otevřít v osobní FA
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="min-h-[44px] px-4 py-2 bg-white border border-slate-300 text-slate-700 rounded-xl hover:bg-slate-50"
            >
              Zrušit
            </button>
          </div>
        </section>
      )}

      {step === "preview" && preview && normalizedPayload && (
        <section className="mb-8 p-6 bg-slate-50 rounded-2xl border border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800 mb-4">Náhled importu</h2>
          <div className="space-y-4">
            <div>
              <p className="text-sm font-medium text-slate-600">Firma</p>
              <p className="text-slate-900 font-medium">{preview.company.displayName}</p>
              {preview.company.ico && <p className="text-sm text-slate-500">IČO: {preview.company.ico}</p>}
            </div>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={createNewCompany}
                onChange={(e) => setCreateNewCompany(e.target.checked)}
                className="rounded border-slate-300"
              />
              <span className="text-sm text-slate-700">Vytvořit novou firmu (nebo použít existující podle IČO)</span>
            </label>
            {!createNewCompany && preview.suggestedCompanyId && (
              <p className="text-sm text-green-700">Bude použita existující firma v systému.</p>
            )}
            <div>
              <p className="text-sm font-medium text-slate-600 mb-2">Jednatelé</p>
              <ul className="list-disc list-inside text-sm text-slate-700 space-y-1">
                {preview.directorsPreview.map((d) => (
                  <li key={d.index}>
                    {d.name}
                    {d.suggestedContactId && " (navržené spárování s kontaktem)"}
                  </li>
                ))}
              </ul>
            </div>
          </div>
          <div className="mt-6 flex flex-wrap gap-3">
            <button
              type="button"
              onClick={handleConfirmImport}
              className="min-h-[44px] px-6 py-3 bg-primary text-primary-foreground font-semibold rounded-xl hover:opacity-90"
            >
              Potvrdit import
            </button>
            <button
              type="button"
              onClick={openShellAndEdit}
              className="min-h-[44px] px-6 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50"
            >
              Otevřít a upravit
            </button>
            <button
              type="button"
              onClick={resetFlow}
              className="min-h-[44px] px-6 py-3 bg-white border border-slate-300 text-slate-700 font-medium rounded-xl hover:bg-slate-50"
            >
              Zrušit
            </button>
          </div>
        </section>
      )}

      {(step === "error" && (validationErrors.length > 0 || importError)) && (
        <section className="mb-8 p-6 bg-red-50 rounded-2xl border border-red-200">
          <h2 className="text-lg font-semibold text-red-800 mb-2">Chyba</h2>
          {validationErrors.length > 0 && (
            <ul className="list-disc list-inside text-sm text-red-700 mb-2">
              {validationErrors.map((e, i) => (
                <li key={i}>{e}</li>
              ))}
            </ul>
          )}
          {importError && <p className="text-sm text-red-700">{importError}</p>}
          <button
            type="button"
            onClick={resetFlow}
            className="mt-4 min-h-[44px] px-4 py-2 bg-white border border-red-300 text-red-700 rounded-xl hover:bg-red-50"
          >
            Zkusit znovu
          </button>
        </section>
      )}

      {step === "success" && resultAnalysisId && (
        <section className="mb-8 p-6 bg-green-50 rounded-2xl border border-green-200">
          <h2 className="text-lg font-semibold text-green-800 mb-2">Import dokončen</h2>
          <p className="text-sm text-green-700 mb-4">Analýza byla uložena do databáze.</p>
          <Link
            href={`/portal/analyses/company?id=${resultAnalysisId}`}
            className="inline-block min-h-[44px] px-6 py-3 bg-green-600 hover:bg-green-500 text-white font-semibold rounded-xl"
          >
            Otevřít analýzu
          </Link>
          <button
            type="button"
            onClick={resetFlow}
            className="ml-3 min-h-[44px] px-4 py-2 bg-white border border-green-300 text-green-700 rounded-xl hover:bg-green-50"
          >
            Importovat další
          </button>
        </section>
      )}

      <section>
        <h2 className="text-lg font-semibold text-slate-800 mb-3">Seznam firemních analýz</h2>
        {listLoading ? (
          <p className="text-slate-500 text-sm">Načítání…</p>
        ) : analyses.length === 0 ? (
          <p className="text-slate-500 text-sm">Zatím žádné firemní analýzy. Nahrajte JSON nebo vytvořte novou.</p>
        ) : (
          <ul className="space-y-2">
            {analyses.map((a) => (
              <li key={a.id} className="flex items-center justify-between py-2 border-b border-slate-100">
                <span className="text-slate-800 font-medium">{a.companyName ?? "Firemní analýza"}</span>
                <span className="text-xs text-slate-500">{a.status}</span>
                <Link
                  href={`/portal/analyses/company?id=${a.id}`}
                  className="text-sm text-primary font-medium hover:underline min-h-[44px] flex items-center"
                >
                  Otevřít
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
