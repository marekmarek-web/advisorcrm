"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { getCsvPreview, importContactsCsv } from "@/app/actions/csv-import";
import type { CsvPreview, ColumnMapping } from "@/app/actions/csv-import";

const WIZARD_STEPS = ["upload", "mapping", "preview", "done"] as const;
type WizardStep = (typeof WIZARD_STEPS)[number];

export function CsvImportForm() {
  const router = useRouter();
  const [step, setStep] = useState<WizardStep>("upload");
  const [preview, setPreview] = useState<CsvPreview | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [mapping, setMapping] = useState<ColumnMapping>({ firstName: 0, lastName: 1, email: 2, phone: 3 });
  const [result, setResult] = useState<{ imported: number; skipped: number; errors: { row: number; message: string }[] } | null>(null);
  const [loading, setLoading] = useState(false);

  const stepIndex = WIZARD_STEPS.indexOf(step);

  async function onFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const f = e.target.files?.[0];
    if (!f) return;
    setFile(f);
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.set("file", f);
    try {
      const p = await getCsvPreview(fd);
      setPreview(p);
      setStep(p ? "mapping" : "upload");
    } finally {
      setLoading(false);
    }
  }

  async function onConfirmImport() {
    if (!file || !preview) return;
    setLoading(true);
    setResult(null);
    const fd = new FormData();
    fd.set("file", file);
    try {
      const r = await importContactsCsv(fd, mapping, preview.hasHeader);
      setResult(r);
      setStep("done");
      if (r.imported > 0) router.refresh();
    } finally {
      setLoading(false);
    }
  }

  const colOptions = preview?.headers.map((h, i) => ({ value: i, label: `${i}: ${h || "(prázdný)"}` })) ?? [];

  return (
    <div className="rounded-xl border border-monday-border bg-white p-4 shadow-sm">
      <h3 className="font-semibold text-slate-800 mb-2">Import z CSV / Excel (export do CSV)</h3>
      <div className="flex gap-2 mb-4 text-sm">
        {WIZARD_STEPS.slice(0, -1).map((s, i) => (
          <span
            key={s}
            className={stepIndex >= i ? "font-medium text-slate-700" : "text-slate-400"}
          >
            {i + 1}. {s === "upload" ? "Upload" : s === "mapping" ? "Mapování" : "Preview"}
          </span>
        ))}
      </div>
      {step === "upload" && (
        <div>
          <p className="text-sm text-slate-500 mb-3">Nahrajte soubor CSV. První řádek může být hlavička. Následně namapujete sloupce na pole.</p>
          <input type="file" accept=".csv,.txt" className="text-sm" onChange={onFileChange} disabled={loading} />
        </div>
      )}
      {step === "mapping" && preview && (
        <div>
          <p className="text-sm text-slate-500 mb-3">Namapujte sloupce na pole (číslo sloupce odpovídá pořadí v souboru):</p>
          <div className="grid grid-cols-2 gap-2 mb-4 max-w-md">
            <label className="text-sm font-medium">Jméno</label>
            <select
              value={mapping.firstName}
              onChange={(e) => setMapping((m) => ({ ...m, firstName: Number(e.target.value) }))}
              className="rounded border border-monday-border px-2 py-1 text-sm"
            >
              {colOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="text-sm font-medium">Příjmení</label>
            <select
              value={mapping.lastName}
              onChange={(e) => setMapping((m) => ({ ...m, lastName: Number(e.target.value) }))}
              className="rounded border border-monday-border px-2 py-1 text-sm"
            >
              {colOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="text-sm font-medium">E-mail</label>
            <select
              value={mapping.email}
              onChange={(e) => setMapping((m) => ({ ...m, email: Number(e.target.value) }))}
              className="rounded border border-monday-border px-2 py-1 text-sm"
            >
              {colOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
            <label className="text-sm font-medium">Telefon</label>
            <select
              value={mapping.phone}
              onChange={(e) => setMapping((m) => ({ ...m, phone: Number(e.target.value) }))}
              className="rounded border border-monday-border px-2 py-1 text-sm"
            >
              {colOptions.map((o) => (
                <option key={o.value} value={o.value}>{o.label}</option>
              ))}
            </select>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("upload")} className="rounded-lg px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-600">
              Zpět
            </button>
            <button type="button" onClick={() => setStep("preview")} className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-monday-blue">
              Další: Preview
            </button>
          </div>
        </div>
      )}
      {step === "preview" && preview && (
        <div>
          <p className="text-sm text-slate-500 mb-2">Náhled dat (max 10 řádků):</p>
          <div className="overflow-x-auto mb-4 text-xs border border-slate-200 rounded p-2 max-h-40 overflow-y-auto">
            <table className="border-collapse">
              <tbody>
                {preview.rows.slice(0, 10).map((row, ri) => (
                  <tr key={ri}>
                    {row.map((cell, ci) => (
                      <td key={ci} className="border border-slate-200 px-2 py-0.5">{cell}</td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="mb-4 p-3 border border-amber-200 rounded-lg bg-amber-50">
            <p className="text-xs font-medium text-amber-800 mb-1">Potenciální duplicity</p>
            <p className="text-xs text-amber-700">Kontrola duplicit (e-mail, telefon) proběhne při importu. Řádky s duplicitou budou přeskočeny.</p>
          </div>
          <div className="flex gap-2">
            <button type="button" onClick={() => setStep("mapping")} className="rounded-lg px-4 py-2 text-sm font-semibold border border-slate-300 text-slate-600">
              Zpět
            </button>
            <button type="button" onClick={onConfirmImport} disabled={loading} className="rounded-lg px-4 py-2 text-sm font-semibold text-white bg-monday-blue disabled:opacity-50">
              {loading ? "Importuji…" : "Potvrdit a importovat"}
            </button>
          </div>
        </div>
      )}
      {step === "done" && result && (
        <div className="text-sm">
          <p className="text-green-700">Importováno: {result.imported}</p>
          {result.skipped > 0 && <p className="text-amber-700">Přeskočeno (duplicity): {result.skipped}</p>}
          {result.errors.length > 0 && (
            <p className="text-amber-700 mt-1">Chyby: {result.errors.length} (řádky {result.errors.slice(0, 5).map((e) => e.row).join(", ")}{result.errors.length > 5 ? "…" : ""})</p>
          )}
          <button type="button" onClick={() => { setStep("upload"); setPreview(null); setFile(null); setResult(null); }} className="mt-2 rounded-lg px-3 py-1.5 text-sm font-medium border border-slate-300 text-slate-600">
            Importovat znovu
          </button>
        </div>
      )}
    </div>
  );
}
