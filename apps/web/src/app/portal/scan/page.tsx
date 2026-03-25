"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  TouchSensor,
  useSensor,
  useSensors,
  type DragEndEvent,
} from "@dnd-kit/core";
import {
  SortableContext,
  useSortable,
  rectSortingStrategy,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import Link from "next/link";
import { ContactPicker, type ContactPickerValue } from "@/app/components/upload/ContactPicker";
import { getPlatform } from "@/lib/capacitor/platform";
import { useCaptureCapabilities } from "@/lib/device/useCaptureCapabilities";
import { useScanCapture, type ScanPage } from "@/lib/scan/useScanCapture";
import { useFileUpload } from "@/lib/upload/useFileUpload";

type ScanStep = "capture" | "metadata" | "preview";

function buildPageLevelCaptureWarnings(scanPages: ScanPage[]): string[] {
  const out: string[] = [];
  for (const p of scanPages) {
    for (const issue of p.quality?.issues ?? []) {
      out.push(`${issue.code}:${issue.severity}`);
    }
  }
  return out;
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

function QualityBadge({ quality }: { quality?: ScanPage["quality"] }) {
  if (!quality || quality.ok) return null;
  const errorIssues = quality.issues.filter((i) => i.severity === "error");
  if (errorIssues.length === 0) return null;
  return (
    <div className="absolute right-1 top-1 rounded-full bg-amber-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
      !
    </div>
  );
}

function SortablePageCard({
  scanPage,
  index,
  onRetake,
  onRemove,
  isCapturing,
}: {
  scanPage: ScanPage;
  index: number;
  onRetake: (index: number) => void;
  onRemove: (index: number) => void;
  isCapturing: boolean;
}) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: scanPage.id,
  });

  const hasError = scanPage.quality && !scanPage.quality.ok;
  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className={`shrink-0 rounded-xl border p-2 ${hasError ? "border-amber-300 bg-amber-50" : "border-slate-200 bg-white"}`}>
      <div {...attributes} {...listeners} className="cursor-grab touch-none active:cursor-grabbing">
        <div className="mb-1 text-center text-xs font-medium text-slate-500">{index + 1}</div>
        <div className="relative">
          <ScanThumbnail file={scanPage.file} alt={`Strana ${index + 1}`} />
          <QualityBadge quality={scanPage.quality} />
        </div>
      </div>
      {hasError ? (
        <div className="mt-1 text-center text-[10px] text-amber-700">
          Nízká kvalita – doporučujeme přefotit
        </div>
      ) : null}
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => onRetake(index)}
          disabled={isCapturing}
          className={`min-h-[40px] flex-1 rounded-lg border px-2 text-xs font-semibold disabled:opacity-50 ${hasError ? "border-amber-400 bg-amber-100 text-amber-800" : "border-slate-300 text-slate-700"}`}
        >
          {hasError ? "Přefotit" : "Znovu"}
        </button>
        <button
          type="button"
          onClick={() => onRemove(index)}
          className="min-h-[40px] flex-1 rounded-lg border border-red-200 px-2 text-xs font-semibold text-red-700"
        >
          Smazat
        </button>
      </div>
    </div>
  );
}

export default function ScanPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { supportsMultiPageScan, tier } = useCaptureCapabilities();
  const {
    scanPages,
    pageIds,
    pages,
    capturePage,
    addPagesFromGalleryBatch,
    retakePage,
    removePage,
    reorderPages,
    clearPages,
    buildPdf,
    isCapturing,
    isBuildingPdf,
    error,
    setError,
    canAddMore,
    qualityWarnings,
    hasQualityIssues,
  } = useScanCapture();
  const { uploadFile, progress } = useFileUpload();
  const [step, setStep] = useState<ScanStep>("capture");
  const [selectedContact, setSelectedContact] = useState<ContactPickerValue | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [note, setNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "building" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [preparedPdf, setPreparedPdf] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

  useEffect(() => {
    const initialContactId = searchParams.get("contactId");
    if (!initialContactId || selectedContact) return;
    setSelectedContact({ id: initialContactId, name: "Vybraný klient" });
  }, [searchParams, selectedContact]);

  useEffect(() => {
    return () => {
      if (pdfPreviewUrl) URL.revokeObjectURL(pdfPreviewUrl);
    };
  }, [pdfPreviewUrl]);

  const tags = useMemo(() => {
    const nextTags: string[] = [];
    if (documentType.trim()) nextTags.push(documentType.trim());
    if (note.trim()) nextTags.push(`poznamka:${note.trim()}`);
    return nextTags;
  }, [documentType, note]);

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = pageIds.indexOf(active.id as string);
    const toIndex = pageIds.indexOf(over.id as string);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderPages(fromIndex, toIndex);
    }
  }

  const preparePreviewPdf = async () => {
    if (!selectedContact?.id) {
      setGlobalError("Vyberte klienta.");
      return;
    }
    if (pages.length === 0) return;

    setGlobalError(null);
    setUploadError(null);
    setIsUploading(true);
    setUploadState("building");

    try {
      const docName = documentType.trim() || "Sken";
      const pdf = await buildPdf(docName);
      if (!pdf) {
        setUploadState("error");
        setUploadError("Vytvoření PDF selhalo.");
        return;
      }

      setPreparedPdf(pdf);
      setPdfPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(pdf);
      });
      setStep("preview");
      setUploadState("idle");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Vytvoření náhledu selhalo.";
      setUploadState("error");
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const uploadPreparedPdf = async () => {
    if (!selectedContact?.id) {
      setGlobalError("Vyberte klienta.");
      return;
    }
    if (!preparedPdf) return;

    setGlobalError(null);
    setUploadError(null);
    setIsUploading(true);
    setUploadState("uploading");

    try {
      const docName = documentType.trim() || "Sken";
      const platform = getPlatform();
      const capturedPlatform =
        tier === "native_capacitor" && (platform === "ios" || platform === "android") ? platform : undefined;
      const captureQualityWarnings = buildPageLevelCaptureWarnings(scanPages);

      await uploadFile(preparedPdf, {
        contactId: selectedContact.id,
        name: docName,
        tags,
        uploadSource: tier === "native_capacitor" ? "mobile_scan" : "web_scan",
        pageCount: pages.length,
        capturedPlatform,
        captureMode: "multi_page_scan",
        captureQualityWarnings: captureQualityWarnings.length ? captureQualityWarnings : undefined,
        manualCropApplied: false,
        rotationAdjusted: false,
      });

      setUploadState("done");
    } catch (err) {
      const message = err instanceof Error ? err.message : "Nahrání selhalo.";
      setUploadState("error");
      setUploadError(message);
    } finally {
      setIsUploading(false);
    }
  };

  const leavePreview = () => {
    setPdfPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
    setPreparedPdf(null);
    setStep("metadata");
  };

  if (!supportsMultiPageScan) {
    return (
      <div className="mx-auto flex w-full max-w-lg flex-col gap-4 px-4 pb-8 pt-8 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h1 className="text-lg font-semibold text-slate-900">Sken na tomto zařízení</h1>
          <p className="mt-2 text-sm text-slate-600">
            Vícestránkové skenování je v širokém webovém zobrazení vypnuté. Nahrajte PDF nebo obrázek v sekci dokumentů,
            nebo použijte telefon (prohlížeč nebo aplikaci Aidvisora).
          </p>
          <div className="mt-4 flex flex-col gap-2 sm:flex-row">
            <Link
              href="/portal/documents"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"
            >
              Otevřít dokumenty
            </Link>
            <Link
              href="/portal/today"
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700"
            >
              Zpět na přehled
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "capture") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h1 className="text-lg font-semibold text-slate-900">Skenovat dokument</h1>
          <p className="mt-1 text-sm text-slate-600">
            Vyfoťte jednotlivé strany dokumentu. Přetažením změníte pořadí.
          </p>
        </div>

        {tier === "web_mobile" ? (
          <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-xs text-slate-700">
            V prohlížeči se po klepnutí na <strong>Přidat stranu</strong> otevře systémové okno fotoaparátu nebo výběr
            souboru. Každou stranu přidejte zvlášť, nebo najednou přes <strong>Více z galerie</strong>.
          </div>
        ) : null}

        <div className="rounded-2xl border border-blue-100 bg-blue-50/60 p-3">
          <h2 className="mb-1 text-xs font-semibold text-blue-800">Tipy pro kvalitní sken</h2>
          <ul className="space-y-0.5 text-xs text-blue-700">
            <li>Foťte celý dokument na dobře osvětleném místě</li>
            <li>Každou stranu zvlášť, nezakrývejte rohy</li>
            <li>Držte telefon pevně a počkejte na zaostření</li>
            <li>Vyhněte se odleskům a stínům</li>
          </ul>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
        ) : null}

        {qualityWarnings.length > 0 ? (
          <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2">
            <div className="mb-1 text-xs font-semibold text-amber-800">Kvalita poslední fotografie</div>
            {qualityWarnings.map((w, i) => (
              <div key={i} className={`text-xs ${w.severity === "error" ? "font-medium text-amber-900" : "text-amber-700"}`}>
                {w.severity === "error" ? "⚠ " : "ℹ "}{w.message}
              </div>
            ))}
          </div>
        ) : null}

        <div className="rounded-2xl border border-slate-200 bg-white p-3">
          <h2 className="mb-3 text-sm font-medium text-slate-700">
            Naskenované strany ({scanPages.length})
          </h2>

          {scanPages.length === 0 ? (
            <p className="text-sm text-slate-500">Zatím není přidaná žádná strana.</p>
          ) : (
            <DndContext sensors={sensors} collisionDetection={closestCenter} onDragEnd={handleDragEnd}>
              <SortableContext items={pageIds} strategy={rectSortingStrategy}>
                <div className="flex flex-wrap gap-3">
                  {scanPages.map((scanPage, index) => (
                    <SortablePageCard
                      key={scanPage.id}
                      scanPage={scanPage}
                      index={index}
                      onRetake={(i) => void retakePage(i)}
                      onRemove={removePage}
                      isCapturing={isCapturing}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
          {hasQualityIssues ? (
            <div className="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
              Některé strany mají nízkou kvalitu. Doporučujeme je přefotit pro lepší rozpoznání textu.
            </div>
          ) : null}
          <div className="flex flex-col gap-2">
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
                {isCapturing ? "Otevírám výběr…" : canAddMore ? "Přidat stranu" : "Limit 20 stran"}
              </button>
              <button
                type="button"
                onClick={() => setStep("metadata")}
                disabled={pages.length === 0}
                className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Pokračovat ({pages.length} {pages.length === 1 ? "strana" : pages.length < 5 ? "strany" : "stran"})
              </button>
            </div>
            <button
              type="button"
              onClick={() => {
                setError(null);
                void addPagesFromGalleryBatch();
              }}
              disabled={isCapturing || !canAddMore}
              className="min-h-[44px] w-full rounded-lg border border-slate-300 bg-white px-4 text-sm font-semibold text-slate-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              Více z galerie (najednou)
            </button>
          </div>
        </div>
      </div>
    );
  }

  if (step === "preview") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h1 className="text-lg font-semibold text-slate-900">Náhled PDF</h1>
          <p className="mt-1 text-sm text-slate-600">
            Zkontrolujte složený dokument. Teprve poté ho odešlete do knihovny dokumentů.
          </p>
        </div>

        {pdfPreviewUrl ? (
          <div className="space-y-2">
            <div className="overflow-hidden rounded-2xl border border-slate-200 bg-slate-100">
              <iframe
                title="Náhled PDF před nahráním"
                src={pdfPreviewUrl}
                className="min-h-[50vh] w-full bg-white"
              />
            </div>
            <a
              href={pdfPreviewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Otevřít náhled v novém okně (Safari / mobil)
            </a>
          </div>
        ) : (
          <p className="text-sm text-slate-500">Náhled není k dispozici.</p>
        )}

        {uploadState === "uploading" ? (
          <div className="rounded-2xl border border-slate-200 bg-white p-3">
            <div className="mb-1 text-sm font-medium text-slate-700">Nahrávání</div>
            <div className="h-2 w-full overflow-hidden rounded bg-slate-100">
              <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {uploadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
        ) : null}

        <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={isUploading || uploadState === "done"}
              onClick={() => void uploadPreparedPdf()}
              className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
            >
              {uploadState === "uploading"
                ? `Nahrávám... ${progress}%`
                : uploadState === "done"
                  ? "Nahráno"
                  : "Nahrát dokument"}
            </button>
          </div>
          <div className="mt-2 flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={isUploading}
              onClick={leavePreview}
              className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
            >
              Zpět k údajům
            </button>
            {uploadState === "error" ? (
              <button
                type="button"
                disabled={isUploading}
                onClick={() => void uploadPreparedPdf()}
                className="min-h-[44px] flex-1 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-700 disabled:opacity-50"
              >
                Zkusit znovu
              </button>
            ) : null}
            {uploadState === "done" ? (
              <button
                type="button"
                onClick={() => {
                  setPdfPreviewUrl((prev) => {
                    if (prev) URL.revokeObjectURL(prev);
                    return null;
                  });
                  setPreparedPdf(null);
                  clearPages();
                  router.push(selectedContact ? `/portal/contacts/${selectedContact.id}` : "/portal/today");
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-emerald-200 bg-emerald-50 px-4 text-sm font-semibold text-emerald-700"
              >
                Otevřít klienta
              </button>
            ) : null}
          </div>
        </div>
      </div>
    );
  }

  const previewButtonLabel =
    uploadState === "building" ? "Připravuji náhled…" : "Zobrazit náhled PDF";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-900">Nahrání skenu</h1>
        <p className="mt-1 text-sm text-slate-600">
          Vyplňte údaje, zobrazte náhled PDF a teprve poté nahrajte dokument.
        </p>
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
        <h2 className="mb-2 text-sm font-medium text-slate-700">
          Strany v dokumentu ({pages.length})
        </h2>
        <div className="flex flex-wrap gap-3">
          {scanPages.map((sp, index) => (
            <div key={sp.id} className="shrink-0 text-center">
              <ScanThumbnail file={sp.file} alt={`Strana ${index + 1}`} />
              <div className="mt-1 text-xs text-slate-500">
                {index + 1} · {formatSize(sp.file.size)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {uploadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
      ) : null}

      <div className="sticky bottom-0 z-10 rounded-2xl border border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isUploading || isBuildingPdf || pages.length === 0}
            onClick={() => void preparePreviewPdf()}
            className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {previewButtonLabel}
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isUploading || isBuildingPdf}
            onClick={() => {
              setUploadState("idle");
              setUploadError(null);
              setPdfPreviewUrl((prev) => {
                if (prev) URL.revokeObjectURL(prev);
                return null;
              });
              setPreparedPdf(null);
              setStep("capture");
            }}
            className="min-h-[44px] flex-1 rounded-lg border border-slate-300 px-4 text-sm font-semibold text-slate-700 disabled:opacity-50"
          >
            Zpět na focení
          </button>

          {uploadState === "error" ? (
            <button
              type="button"
              disabled={isUploading || isBuildingPdf}
              onClick={() => void preparePreviewPdf()}
              className="min-h-[44px] flex-1 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-700 disabled:opacity-50"
            >
              Zkusit znovu
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
