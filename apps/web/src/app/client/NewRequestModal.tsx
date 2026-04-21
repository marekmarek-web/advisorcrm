"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check, ChevronRight, Paperclip, X } from "lucide-react";
import { createClientPortalRequestFromForm } from "@/app/actions/client-portal-requests";
import { summarizeAttachmentOutcomes } from "@/app/lib/client-portal/attachment-outcome";

type NewRequestModalProps = {
  open: boolean;
  onClose: () => void;
  defaultCaseType?: string;
};

type RequestCategory = {
  id: string;
  label: string;
  options: { caseType: string; label: string }[];
};

const CATEGORIES: RequestCategory[] = [
  {
    id: "uvery",
    label: "Bydlení a úvěry",
    options: [
      { caseType: "hypotéka", label: "Nová hypotéka" },
      { caseType: "úvěr", label: "Spotřebitelský úvěr" },
    ],
  },
  {
    id: "pojisteni",
    label: "Pojištění",
    options: [
      { caseType: "pojištění", label: "Životní pojištění" },
      { caseType: "pojištění", label: "Pojištění majetku a aut" },
    ],
  },
  {
    id: "investice",
    label: "Investice a Penze",
    options: [
      { caseType: "investice", label: "Pravidelné investice" },
      { caseType: "investice", label: "Jednorázová investice" },
    ],
  },
  {
    id: "zmena",
    label: "Změna životní situace",
    options: [{ caseType: "změna situace", label: "Narození dítěte / svatba / změna bydlení" }],
  },
  {
    id: "servis",
    label: "Servis smlouvy",
    options: [{ caseType: "servis smlouvy", label: "Úprava nebo servis stávající smlouvy" }],
  },
  {
    id: "ostatni",
    label: "Ostatní",
    options: [
      { caseType: "hlášení pojistné události", label: "Hlášení pojistné události" },
      { caseType: "jiné", label: "Jiný požadavek" },
    ],
  },
];

export function NewRequestModal({ open, onClose, defaultCaseType }: NewRequestModalProps) {
  const router = useRouter();
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<1 | 2 | 3 | 4>(1);
  const [isPending, startTransition] = useTransition();
  const [categoryId, setCategoryId] = useState<string>("");
  const [selectedCaseType, setSelectedCaseType] = useState<string>(defaultCaseType ?? "");
  const [requestTitle, setRequestTitle] = useState<string>("");
  const [description, setDescription] = useState<string>("");
  const [files, setFiles] = useState<File[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [attachmentWarning, setAttachmentWarning] = useState<string | null>(null);

  const selectedCategory = useMemo(
    () => CATEGORIES.find((category) => category.id === categoryId) ?? null,
    [categoryId]
  );

  const resetAndClose = useCallback(() => {
    setStep(1);
    setCategoryId("");
    setSelectedCaseType(defaultCaseType ?? "");
    setRequestTitle("");
    setDescription("");
    setFiles([]);
    setError(null);
    setAttachmentWarning(null);
    onClose();
  }, [defaultCaseType, onClose]);

  // Escape zavírá modal (backdrop-click už funguje). Bez toho by klient uvízl
  // v modálu při ztrátě focusu — zejména v případě, že overlay notifikace
  // zachycují kliky.
  useEffect(() => {
    if (!open) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !isPending) {
        event.preventDefault();
        resetAndClose();
      }
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [open, isPending, resetAndClose]);

  function submitRequest() {
    if (!selectedCaseType) return;
    setError(null);
    startTransition(async () => {
      const fd = new FormData();
      fd.set("caseType", selectedCaseType);
      fd.set("subject", requestTitle.trim());
      fd.set("description", description.trim());
      for (const f of files) {
        fd.append("files", f);
      }
      const result = await createClientPortalRequestFromForm(fd);
      if (!result.success) {
        setError(result.error || "Požadavek se nepodařilo odeslat.");
        return;
      }
      const { warning } = summarizeAttachmentOutcomes(result.attachments);
      setAttachmentWarning(warning);
      router.refresh();
      setStep(4);
    });
  }

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-[70] bg-slate-900/55 backdrop-blur-sm p-4 sm:p-6 client-fade-in flex items-center justify-center"
      onClick={resetAndClose}
    >
      <div
        className="w-full max-w-[640px] bg-white rounded-[30px] border border-slate-100 shadow-2xl overflow-hidden max-h-[90vh] flex flex-col client-scale-in"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="px-6 sm:px-8 py-5 border-b border-slate-100 bg-slate-50/70 flex items-center justify-between">
          <h2 className="text-xl font-black text-slate-900">Nový požadavek na poradce</h2>
          <button
            onClick={resetAndClose}
            aria-label="Zavřít modal"
            className="p-2 rounded-full border border-slate-200 bg-white text-slate-500 hover:text-slate-800"
          >
            <X size={16} />
          </button>
        </div>

        <div className="p-6 sm:p-8 overflow-y-auto client-custom-scrollbar">
          {step === 1 && (
            <div className="space-y-5">
              <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                1. Co potřebujete vyřešit?
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                {CATEGORIES.map((category) => (
                  <button
                    key={category.id}
                    onClick={() => {
                      setCategoryId(category.id);
                      setStep(2);
                    }}
                    className="p-4 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left font-bold text-slate-700 transition-all shadow-sm min-h-[54px]"
                  >
                    {category.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 2 && selectedCategory && (
            <div className="space-y-5">
              <button
                onClick={() => setStep(1)}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                ← Zpět na kategorie
              </button>
              <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                2. Upřesněte: {selectedCategory.label}
              </h3>
              <div className="space-y-3">
                {selectedCategory.options.map((option) => (
                  <button
                    key={option.label}
                    onClick={() => {
                      setSelectedCaseType(option.caseType);
                      setRequestTitle(option.label);
                      setStep(3);
                    }}
                    className="w-full p-4 rounded-2xl border border-slate-200 hover:border-indigo-400 hover:bg-indigo-50 text-left font-bold text-slate-700 transition-all shadow-sm flex justify-between items-center group min-h-[54px]"
                  >
                    {option.label}
                    <ChevronRight size={16} className="text-slate-300 group-hover:text-indigo-500" />
                  </button>
                ))}
              </div>
            </div>
          )}

          {step === 3 && (
            <div className="space-y-5">
              <button
                onClick={() => setStep(2)}
                className="text-xs font-bold text-indigo-600 hover:underline"
              >
                ← Zpět na výběr
              </button>
              <h3 className="text-[11px] font-black uppercase tracking-[0.16em] text-slate-400">
                3. Detaily požadavku
              </h3>

              <div>
                <label className="text-xs text-slate-500 font-bold block mb-2">
                  Název požadavku
                </label>
                <input
                  type="text"
                  value={requestTitle}
                  onChange={(event) => setRequestTitle(event.target.value)}
                  className="w-full p-3 bg-slate-50 border border-slate-200 rounded-xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all"
                  placeholder="Např. Refinancování hypotéky"
                />
              </div>

              <div>
                <label className="text-xs text-slate-500 font-bold block mb-2">
                  Detailní popis
                </label>
                               <textarea
                  rows={5}
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  className="w-full p-4 bg-slate-50 border border-slate-200 rounded-2xl text-sm font-medium outline-none focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 transition-all resize-none"
                  placeholder="Upřesněte částku, termín nebo další kontext..."
                />
              </div>

              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  multiple
                  accept=".pdf,.jpg,.jpeg,.png,.webp"
                  className="sr-only"
                  onChange={(event) => setFiles(Array.from(event.target.files ?? []))}
                />
                <button
                  type="button"
                  onClick={() => fileInputRef.current?.click()}
                  className="inline-flex min-h-[44px] items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 text-sm font-bold text-slate-700 hover:bg-slate-100 transition-colors"
                >
                  <Paperclip size={16} className="shrink-0 text-slate-500" />
                  Přiložit soubor
                </button>
                {files.length > 0 ? (
                  <p className="mt-2 text-xs text-slate-500">
                    {files.length === 1
                      ? `Vybrán soubor: ${files[0]?.name ?? ""}`
                      : `Vybrány soubory (${files.length})`}
                  </p>
                ) : null}
              </div>

              {error && (
                <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
                  {error}
                </p>
              )}

              <button
                onClick={submitRequest}
                disabled={isPending || !selectedCaseType}
                className="w-full py-3.5 bg-indigo-600 hover:bg-indigo-700 text-white rounded-2xl font-black uppercase tracking-widest text-sm shadow-xl shadow-indigo-600/20 transition-all active:scale-95 disabled:opacity-60"
              >
                {isPending ? "Odesílám..." : "Odeslat poradci"}
              </button>
            </div>
          )}

          {step === 4 && (
            <div className="flex flex-col items-center justify-center text-center h-full py-10">
              <div className="w-24 h-24 bg-emerald-100 text-emerald-500 rounded-full flex items-center justify-center mb-6 shadow-sm">
                <Check size={48} strokeWidth={3} />
              </div>
              <h3 className="text-2xl font-black text-slate-900 mb-2">Požadavek odeslán</h3>
              <p className="text-slate-500 font-medium mb-8 max-w-sm">
                Požadavek je v poradenském portálu v pipeline. Pokud má váš tým v Aidvisoře nastavený e-mail pro
                oznámení, odešle se také upozornění na schránku pro tým.
              </p>
              {attachmentWarning && (
                <div className="mb-6 w-full max-w-sm whitespace-pre-line rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-left text-sm font-semibold text-amber-800">
                  {attachmentWarning}
                </div>
              )}
              <button
                onClick={resetAndClose}
                className="px-8 py-3 bg-slate-100 hover:bg-slate-200 text-slate-700 font-bold rounded-xl transition-colors"
              >
                Zavřít okno
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
