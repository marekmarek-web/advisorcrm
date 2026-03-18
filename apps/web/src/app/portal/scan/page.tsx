"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { ContactPicker, type ContactPickerValue } from "@/app/components/upload/ContactPicker";
import { useNativePlatform } from "@/lib/capacitor/useNativePlatform";
import { useScanCapture } from "@/lib/scan/useScanCapture";
import { useFileUpload } from "@/lib/upload/useFileUpload";

type ScanStep = "capture" | "metadata";
type FileStatus = "pending" | "uploading" | "done" | "error";

type UploadRow = {
  key: string;
  file: File;
  status: FileStatus;
  progress: number;
  error: string | null;
};

function fileKey(file: File) {
  return `${file.name}-${file.size}-${file.lastModified}`;
}

function formatSize(bytes: number) {
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function ScanThumbnail({ file, alt }: { file: File; alt: string }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const nextUrl = URL.createObjectURL(file);
    setUrl(nextUrl);
    return () => URL.revokeObjectURL(nextUrl);
  }, [file]);

  if (!url) {
    return <div className="h-24 w-24 animate-pulse rounded-lg bg-slate-100" aria-hidden />;
  }

  return <img src={url} alt={alt} className="h-24 w-24 rounded-lg border border-slate-200 object-cover" />;
}

export default function ScanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { isNative } = useNativePlatform();
  const { pages, capturePage, retakePage, removePage, clearPages, isCapturing, error, setError, canAddMore } = useScanCapture();
  const { uploadFile, progress } = useFileUpload();
  const hasStartedCapture = useRef(false);

  const [step, setStep] = useState<ScanStep>("capture");
  const [selectedContact, setSelectedContact] = useState<ContactPickerValue | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [note, setNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadRows, setUploadRows] = useState<UploadRow[]>([]);
  const [activeKey, setActiveKey] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  useEffect(() => {
    if (!isNative) {
      router.replace("/portal/today");
    }
  }, [isNative, router]);

  useEffect(() => {
    if (!isNative || hasStartedCapture.current) return;
    hasStartedCapture.current = true;
    void capturePage();
  }, [capturePage, isNative]);

  useEffect(() => {
    if (step !== "metadata") return;
    setUploadRows(
      pages.map((file) => ({
        key: fileKey(file),
        file,
        status: "pending",
        progress: 0,
        error: null,
      })),
    );
  }, [pages, step]);

  useEffect(() => {
    if (!activeKey) return;
    setUploadRows((rows) =>
      rows.map((row) => (row.key === activeKey ? { ...row, progress, status: "uploading", error: null } : row)),
    );
  }, [activeKey, progress]);

  useEffect(() => {
    const initialContactId = searchParams.get("contactId");
    if (!initialContactId || selectedContact) return;
    setSelectedContact({ id: initialContactId, name: "Vybraný klient" });
  }, [searchParams, selectedContact]);

  const tags = useMemo(() => {
    const nextTags: string[] = [];
    if (documentType.trim()) nextTags.push(documentType.trim());
    if (note.trim()) nextTags.push(`poznamka:${note.trim()}`);
    return nextTags;
  }, [documentType, note]);

  const uploadAll = async (onlyFailed: boolean) => {
    if (!selectedContact?.id) {
      setGlobalError("Vyberte klienta.");
      return;
    }

    setGlobalError(null);
    setIsUploading(true);

    try {
      for (const [index, row] of uploadRows.entries()) {
        if (onlyFailed && row.status !== "error") continue;
        if (!onlyFailed && row.status === "done") continue;

        setActiveKey(row.key);
        setUploadRows((current) =>
          current.map((candidate) =>
            candidate.key === row.key ? { ...candidate, status: "uploading", progress: 0, error: null } : candidate,
          ),
        );

        const pageNamePrefix = documentType.trim() || "Sken";
        const pageName = `${pageNamePrefix} - strana ${index + 1}`;

        try {
          await uploadFile(row.file, {
            contactId: selectedContact.id,
            name: pageName,
            tags,
            uploadSource: "mobile_scan",
          });

          setUploadRows((current) =>
            current.map((candidate) =>
              candidate.key === row.key ? { ...candidate, status: "done", progress: 100, error: null } : candidate,
            ),
          );
        } catch (uploadError) {
          const message = uploadError instanceof Error ? uploadError.message : "Nahrání stránky selhalo.";
          setUploadRows((current) =>
            current.map((candidate) =>
              candidate.key === row.key ? { ...candidate, status: "error", error: message } : candidate,
            ),
          );
        }
      }
    } finally {
      setActiveKey(null);
      setIsUploading(false);
    }
  };

  if (!isNative) return null;

  if (step === "capture") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h1 className="text-lg font-semibold text-slate-900">Skenovat dokument</h1>
          <p className="mt-1 text-sm text-slate-600">
            Vyfoťte dokument, zkontrolujte jednotlivé strany a pokračujte k nahrání.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <h2 className="mb-3 text-sm font-medium text-slate-700">Naskenované strany ({pages.length})</h2>

          {pages.length === 0 ? (
            <p className="text-sm text-slate-500">Zatím není přidaná žádná strana.</p>
          ) : (
            <div className="flex gap-3 overflow-x-auto pb-1">
              {pages.map((page, index) => (
                <div key={fileKey(page)} className="shrink-0">
                  <ScanThumbnail file={page} alt={`Strana ${index + 1}`} />
                  <div className="mt-2 flex gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        void retakePage(index);
                      }}
                      className="min-h-[44px] rounded-lg border border-slate-300 px-3 text-xs font-semibold text-slate-700"
                    >
                      Znovu
                    </button>
                    <button
                      type="button"
                      onClick={() => removePage(index)}
                      className="min-h-[44px] rounded-lg border border-red-200 px-3 text-xs font-semibold text-red-700"
                    >
                      Odebrat
                    </button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              onClick={() => {
                setError(null);
                void capturePage();
              }}
              disabled={isCapturing || !canAddMore}
              className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {isCapturing ? "Otevírám kameru..." : canAddMore ? "Přidat stranu" : "Limit 10 stran"}
            </button>
            <button
              type="button"
              onClick={() => setStep("metadata")}
              disabled={pages.length === 0}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Pokračovat
            </button>
          </div>
        </div>
      </div>
    );
  }

  const hasErrors = uploadRows.some((row) => row.status === "error");
  const hasDone = uploadRows.some((row) => row.status === "done");

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-900">Nahrání skenu</h1>
        <p className="mt-1 text-sm text-slate-600">Doplňte metadata a nahrajte všechny naskenované strany.</p>
      </div>

      {globalError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{globalError}</div> : null}

      <ContactPicker value={selectedContact} onChange={setSelectedContact} />

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <label className="mb-2 block text-sm font-medium text-slate-700" htmlFor="scan-doc-type">
          Typ dokumentu
        </label>
        <input
          id="scan-doc-type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          placeholder="Např. smlouva, faktura"
          className="h-11 w-full rounded-lg border border-slate-300 px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />

        <label className="mb-2 mt-3 block text-sm font-medium text-slate-700" htmlFor="scan-note">
          Poznámka
        </label>
        <textarea
          id="scan-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Volitelná poznámka ke skenu"
          className="min-h-24 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="rounded-2xl border border-slate-200 bg-white p-3">
        <h2 className="mb-2 text-sm font-medium text-slate-700">Strany k nahrání</h2>
        <div className="space-y-2">
          {uploadRows.map((row, index) => (
            <div key={row.key} className="rounded-xl border border-slate-200 p-3">
              <div className="mb-2 flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <ScanThumbnail file={row.file} alt={`Strana ${index + 1}`} />
                  <div>
                    <div className="text-sm font-medium text-slate-900">Strana {index + 1}</div>
                    <div className="text-xs text-slate-500">{formatSize(row.file.size)}</div>
                  </div>
                </div>
                <span
                  className={`rounded-full px-2 py-1 text-xs font-medium ${
                    row.status === "done"
                      ? "bg-emerald-100 text-emerald-700"
                      : row.status === "error"
                        ? "bg-red-100 text-red-700"
                        : row.status === "uploading"
                          ? "bg-blue-100 text-blue-700"
                          : "bg-slate-100 text-slate-600"
                  }`}
                >
                  {row.status === "done"
                    ? "Hotovo"
                    : row.status === "error"
                      ? "Chyba"
                      : row.status === "uploading"
                        ? "Nahrávám"
                        : "Čeká"}
                </span>
              </div>

              <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
                <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${row.progress}%` }} />
              </div>
              {row.error ? <div className="mt-2 text-xs text-red-600">{row.error}</div> : null}
            </div>
          ))}
        </div>
      </div>

      <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isUploading || uploadRows.length === 0}
            onClick={() => {
              void uploadAll(false);
            }}
            className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {isUploading ? "Nahrávám..." : "Nahrát sken"}
          </button>
          <button
            type="button"
            disabled={isUploading || !hasErrors}
            onClick={() => {
              void uploadAll(true);
            }}
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
          >
            Zkusit znovu chybné
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isUploading}
            onClick={() => setStep("capture")}
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Zpět na focení
          </button>
          <button
            type="button"
            disabled={!hasDone || isUploading || !selectedContact}
            onClick={() => {
              clearPages();
              router.push(selectedContact ? `/portal/contacts/${selectedContact.id}` : "/portal/today");
            }}
            className="min-h-[44px] flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700 disabled:opacity-50"
          >
            Otevřít klienta
          </button>
        </div>
      </div>
    </div>
  );
}
