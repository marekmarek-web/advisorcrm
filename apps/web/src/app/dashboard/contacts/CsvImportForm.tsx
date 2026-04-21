"use client";

import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { queryKeys } from "@/lib/query-keys";
import {
  getCsvPreview,
  getSpreadsheetPreview,
  importContactsCsv,
  importContactsFromSpreadsheet,
} from "@/app/actions/csv-import";
import type { CsvPreview } from "@/app/actions/csv-import";
import { DEFAULT_CONTACT_IMPORT_MAPPING, type ColumnMapping } from "@/lib/contacts/import-types";
import { mapColumnsToContact } from "@/lib/contacts/map-columns-to-contact";
import { ImportColumnMappingBlock } from "@/app/dashboard/contacts/ImportColumnMappingBlock";
import { Download } from "lucide-react";

const WIZARD_STEPS = ["upload", "mapping", "preview", "done"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

export function CsvImportForm() {
  const queryClient = useQueryClient();
  const [step, setStep] = useState<WizardStep>("upload");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>(DEFAULT_CONTACT_IMPORT_MAPPING);
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);
  // CSV/Excel import dříve tiše spolknul selhání serverových akcí (try/finally
  // bez catch); uživatel viděl pouze to, že nic nenastalo. Přidáváme explicitní
  // chybový stav, abychom selhání (parser, oprávnění, velikost) zobrazili.
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const stepIndex = WIZARD_STEPS.indexOf(step);

  const isExcelFile = (f: File) =>
    f.name.toLowerCase().endsWith(".xlsx") ||
    f.type === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setMapping(DEFAULT_CONTACT_IMPORT_MAPPING);
    setLoading(true);
    setResult(null);
    setErrorMessage(null);
    const fd = new FormData();
    fd.set("file", f);
    try {
      const p = isExcelFile(f) ? await getSpreadsheetPreview(fd) : await getCsvPreview(fd);
      if (!p) {
        setErrorMessage(
          "Soubor se nepodařilo načíst. Zkontrolujte, že je ve správném formátu (CSV UTF-8 / XLSX) a nemá poškozenou strukturu.",
        );
        setStep("upload");
        return;
      }
      setPreview(p);
      setStep("mapping");
    } catch (err) {
      console.error("[CsvImportForm] preview failed", err);
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : "Náhled souboru selhal. Zkuste soubor uložit znovu jako CSV UTF-8 / XLSX a akci opakujte.",
      );
      setPreview(null);
      setStep("upload");
    } finally {
      setLoading(false);
    }
  }

  async function onSheetChange(sheet: string) {
    if (!file || !isExcelFile(file)) return;
    setLoading(true);
    setErrorMessage(null);
    const fd = new FormData();
    fd.set("file", file);
    fd.set("sheetName", sheet);
    try {
      const p = await getSpreadsheetPreview(fd);
      if (p) {
        setPreview(p);
        setMapping(DEFAULT_CONTACT_IMPORT_MAPPING);
      } else {
        setErrorMessage("Náhled listu se nepodařilo načíst. Zkuste vybrat jiný list nebo znovu nahrát soubor.");
      }
    } catch (err) {
      console.error("[CsvImportForm] sheet change failed", err);
      setErrorMessage(
        err instanceof Error && err.message ? err.message : "Přepnutí listu selhalo. Zkuste znovu nahrát soubor.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmImport() {
    if (!file || !preview) return;
    setLoading(true);
    setResult(null);
    setErrorMessage(null);
    const fd = new FormData();
    fd.set("file", file);
    if (isExcelFile(file) && preview.activeSheet) {
      fd.set("sheetName", preview.activeSheet);
    }
    try {
      const r = isExcelFile(file)
        ? await importContactsFromSpreadsheet(fd, mapping)
        : await importContactsCsv(fd, mapping, preview.hasHeader);
      setResult(r);
      setStep("done");
      if (r.imported > 0) void queryClient.invalidateQueries({ queryKey: queryKeys.contacts.list() });
    } catch (err) {
      console.error("[CsvImportForm] import failed", err);
      setErrorMessage(
        err instanceof Error && err.message
          ? err.message
          : "Import selhal. Pokud se chyba opakuje, ověřte oprávnění a zkuste menší soubor.",
      );
    } finally {
      setLoading(false);
    }
  }

  const mappedPreviewRows =
    preview?.rows.slice(0, 10).map((row) => mapColumnsToContact(row, mapping)) ?? [];

  return (
    <div className="rounded-xl border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] p-4 shadow-sm">
      <h3 className="font-semibold text-[color:var(--wp-text)] mb-2">Import z CSV nebo Excel</h3>
      <div className="flex flex-wrap gap-2 mb-4 text-sm">
        {WIZARD_STEPS.slice(0, -1).map((s, i) => (
          <span
            key={s}
            className={stepIndex >= i ? "font-medium text-[color:var(--wp-text)]" : "text-[color:var(--wp-text-muted)]"}
          >
            {i + 1}. {s === "upload" ? "Upload" : s === "mapping" ? "Mapování" : "Preview"}
          </span>
        ))}
      </div>
      {errorMessage && (
        <div
          role="alert"
          className="mb-4 rounded-lg border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-800 dark:border-rose-800/60 dark:bg-rose-950/35 dark:text-rose-200"
        >
          {errorMessage}
        </div>
      )}
      {step === "upload" && (
        <div>
          <ol className="text-sm text-[color:var(--wp-text-muted)] mb-4 list-decimal pl-5 space-y-1.5">
            <li>Ukládejte soubor v kódování UTF-8 (u CSV v Excelu: Uložit jako → CSV UTF-8).</li>
            <li>První řádek by měl být hlavička s názvy sloupců (pořadí nezáleží — namapujete v dalším kroku).</li>
            <li>Každý řádek = jeden kontakt; vyhněte se sloučeným buňkám přes více osob.</li>
            <li>Duplicitní e-mail nebo telefon vůči již uloženým kontaktům se přeskočí.</li>
            <li>U Excelu se ve výchozím stavu bere první list; u více listů vyberte správný v kroku mapování.</li>
          </ol>
          <div className="flex flex-col sm:flex-row sm:flex-wrap gap-2 mb-4">
            <a
              href="/templates/kontakty-import-sablona.csv"
              download
              className="inline-flex items-center justify-center gap-2 min-h-[44px] px-3 rounded-lg border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)] text-sm font-medium text-[color:var(--wp-text)] hover:bg-[color:var(--wp-surface)]"
            >
              <Download size={18} className="shrink-0" aria-hidden />
              Stáhnout šablonu CSV
            </a>
            <label
              className={`inline-flex items-center justify-center min-h-[44px] px-3 rounded-lg border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface)] text-sm font-medium text-[color:var(--wp-text)] ${loading ? "opacity-60 cursor-not-allowed" : "cursor-pointer hover:bg-[color:var(--wp-surface-muted)]"}`}
            >
              Vybrat CSV/XLSX
              <input type="file" accept=".csv,.txt,.xlsx" className="hidden" onChange={onFileChange} disabled={loading} />
            </label>
          </div>
        </div>
      )}
      {step === "mapping" && preview && (
        <div>
          <p className="text-sm text-[color:var(--wp-text-muted)] mb-3">
            Namapujte sloupce na pole CRM. Číslo sloupce odpovídá pořadí v souboru (0 = první sloupec).
          </p>
          {loading && <p className="text-sm text-[color:var(--wp-text-muted)] mb-2">Načítám list…</p>}
          <ImportColumnMappingBlock
            headers={preview.headers}
            mapping={mapping}
            onMappingChange={setMapping}
            sheetNames={preview.sheetNames}
            activeSheet={preview.activeSheet}
            onActiveSheetChange={file && isExcelFile(file) ? onSheetChange : undefined}
            variant="dashboard"
          />
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => {
                setStep("upload");
                setPreview(null);
                setFile(null);
              }}
              className="rounded-lg px-4 py-2.5 min-h-[44px] text-sm font-semibold border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-muted)]"
            >
              Zpět
            </button>
            <button
              type="button"
              onClick={() => setStep("preview")}
              disabled={loading}
              className="rounded-lg px-4 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-monday-blue disabled:opacity-50"
            >
              Další: Preview
            </button>
          </div>
        </div>
      )}
      {step === "preview" && preview && (
        <div>
          <p className="text-sm text-[color:var(--wp-text-muted)] mb-2">Náhled podle mapování (max 10 řádků):</p>
          <div className="overflow-x-auto mb-4 text-xs border border-[color:var(--wp-border)] rounded-lg">
            <table className="border-collapse min-w-[480px] w-full">
              <thead>
                <tr className="bg-[color:var(--wp-surface-muted)]">
                  <th className="border border-[color:var(--wp-border)] px-2 py-1.5 text-left font-semibold">Jméno</th>
                  <th className="border border-[color:var(--wp-border)] px-2 py-1.5 text-left font-semibold">Příjmení</th>
                  <th className="border border-[color:var(--wp-border)] px-2 py-1.5 text-left font-semibold">E-mail</th>
                  <th className="border border-[color:var(--wp-border)] px-2 py-1.5 text-left font-semibold">Telefon</th>
                  <th className="border border-[color:var(--wp-border)] px-2 py-1.5 text-left font-semibold">Fáze</th>
                  <th className="border border-[color:var(--wp-border)] px-2 py-1.5 text-left font-semibold">Štítky</th>
                  <th className="border border-[color:var(--wp-border)] px-2 py-1.5 text-left font-semibold">Pozn.</th>
                </tr>
              </thead>
              <tbody>
                {mappedPreviewRows.map((r, ri) => (
                  <tr key={ri}>
                    <td className="border border-[color:var(--wp-border)] px-2 py-1">{r.firstName}</td>
                    <td className="border border-[color:var(--wp-border)] px-2 py-1">{r.lastName}</td>
                    <td className="border border-[color:var(--wp-border)] px-2 py-1">{r.email ?? ""}</td>
                    <td className="border border-[color:var(--wp-border)] px-2 py-1">{r.phone ?? ""}</td>
                    <td className="border border-[color:var(--wp-border)] px-2 py-1">{r.lifecycleStage ?? ""}</td>
                    <td className="border border-[color:var(--wp-border)] px-2 py-1">{r.tags?.join(", ") ?? ""}</td>
                    <td className="border border-[color:var(--wp-border)] px-2 py-1 max-w-[120px] truncate" title={r.notes ?? ""}>
                      {r.notes ? (r.notes.length > 40 ? `${r.notes.slice(0, 40)}…` : r.notes) : ""}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <details className="mb-4 text-xs">
            <summary className="cursor-pointer text-[color:var(--wp-text-muted)] font-medium py-1">Surová data ze souboru</summary>
            <div className="overflow-x-auto mt-2 max-h-40 overflow-y-auto border border-[color:var(--wp-border)] rounded p-2">
              <table className="border-collapse">
                <tbody>
                  {preview.rows.slice(0, 10).map((row, ri) => (
                    <tr key={ri}>
                      {row.map((cell, ci) => (
                        <td key={ci} className="border border-[color:var(--wp-border)] px-2 py-0.5">
                          {cell}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </details>
          <div className="mb-4 p-3 border border-amber-200 dark:border-amber-800/60 rounded-lg bg-amber-50 dark:bg-amber-950/35">
            <p className="text-xs font-medium text-amber-800 dark:text-amber-200 mb-1">Potenciální duplicity</p>
            <p className="text-xs text-amber-700 dark:text-amber-300/90">
              Kontrola duplicit (e-mail, telefon) proběhne při importu. Řádky s duplicitou budou přeskočeny.
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setStep("mapping")}
              className="rounded-lg px-4 py-2.5 min-h-[44px] text-sm font-semibold border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-muted)]"
            >
              Zpět
            </button>
            <button
              type="button"
              onClick={onConfirmImport}
              disabled={loading}
              className="rounded-lg px-4 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-monday-blue disabled:opacity-50"
            >
              {loading ? "Importuji…" : "Potvrdit a importovat"}
            </button>
          </div>
        </div>
      )}
      {step === "done" && result && (
        <div className="text-sm">
          <p className="text-green-700 dark:text-green-400">Importováno: {result.imported}</p>
          {result.skipped > 0 && <p className="text-amber-700 dark:text-amber-300">Přeskočeno (duplicity): {result.skipped}</p>}
          {result.errors.length > 0 && (
            <p className="text-amber-700 dark:text-amber-300 mt-1">
              Chyby: {result.errors.length} (řádky {result.errors.slice(0, 5).map((e) => e.row).join(", ")}
              {result.errors.length > 5 ? "…" : ""})
            </p>
          )}
          <button
            type="button"
            onClick={() => {
              setStep("upload");
              setPreview(null);
              setFile(null);
              setResult(null);
              setMapping(DEFAULT_CONTACT_IMPORT_MAPPING);
            }}
            className="mt-2 rounded-lg px-3 py-2 min-h-[44px] text-sm font-medium border border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-muted)]"
          >
            Importovat znovu
          </button>
        </div>
      )}
    </div>
  );
}
