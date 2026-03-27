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

type ScanStep = "mode" | "quick" | "capture" | "metadata" | "preview";

async function triggerDocumentBackgroundProcessing(documentId: string): Promise<void> {
  await fetch(`/api/documents/${documentId}/process`, { method: "POST", credentials: "same-origin" });
}

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
    return <div className="h-24 w-24 animate-pulse rounded-lg bg-[color:var(--wp-surface-muted)]" aria-hidden />;
  }

  return <img src={url} alt={alt} className="h-24 w-24 rounded-lg border border-[color:var(--wp-surface-card-border)] object-cover" />;
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
  onRotateCw,
  isCapturing,
}: {
  scanPage: ScanPage;
  index: number;
  onRetake: (index: number) => void;
  onRemove: (index: number) => void;
  onRotateCw: (index: number) => void;
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
    <div ref={setNodeRef} style={style} className={`shrink-0 rounded-xl border p-2 ${hasError ? "border-amber-300 bg-amber-50" : "border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]"}`}>
      <div {...attributes} {...listeners} className="cursor-grab touch-none active:cursor-grabbing">
        <div className="mb-1 text-center text-xs font-medium text-[color:var(--wp-text-secondary)]">{index + 1}</div>
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
          className={`min-h-[40px] flex-1 rounded-lg border px-2 text-xs font-semibold disabled:opacity-50 ${hasError ? "border-amber-400 bg-amber-100 text-amber-800" : "border-[color:var(--wp-border-strong)] text-[color:var(--wp-text-secondary)]"}`}
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
      <button
        type="button"
        onClick={() => onRotateCw(index)}
        disabled={isCapturing}
        className="mt-1.5 min-h-[40px] w-full rounded-lg border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)] px-2 text-xs font-semibold text-[color:var(--wp-text)] disabled:opacity-50"
      >
        Otočit o 90°
      </button>
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
    addPagesFromDocumentScanner,
    retakePage,
    removePage,
    reorderPages,
    rotatePage,
    clearPages,
    buildPdf,
    isCapturing,
    isBuildingPdf,
    error,
    setError,
    canAddMore,
    qualityWarnings,
    hasQualityIssues,
    didManualRotate,
  } = useScanCapture();
  const { uploadFile, progress } = useFileUpload();
  const [step, setStep] = useState<ScanStep>("mode");
  const [selectedContact, setSelectedContact] = useState<ContactPickerValue | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [note, setNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "building" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);
  const [preparedPdf, setPreparedPdf] = useState<File | null>(null);
  const [pdfPreviewUrl, setPdfPreviewUrl] = useState<string | null>(null);

  const [quickFiles, setQuickFiles] = useState<File[]>([]);
  const [quickName, setQuickName] = useState("");
  const [quickError, setQuickError] = useState<string | null>(null);
  const [quickUploading, setQuickUploading] = useState(false);
  const [quickDocId, setQuickDocId] = useState<string | null>(null);
  const [quickProcessingStatus, setQuickProcessingStatus] = useState<string | null>(null);
  const [quickProcessingStage, setQuickProcessingStage] = useState<string | null>(null);

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

  useEffect(() => {
    if (!quickDocId) return;
    let cancelled = false;
    const poll = async () => {
      try {
        const res = await fetch(`/api/documents/${quickDocId}/process`, { credentials: "same-origin" });
        if (!res.ok || cancelled) return;
        const data = (await res.json()) as {
          processingStatus?: string | null;
          processingStage?: string | null;
        };
        setQuickProcessingStatus(data.processingStatus ?? null);
        setQuickProcessingStage(data.processingStage ?? null);
      } catch {
        /* ignore */
      }
    };
    void poll();
    const id = window.setInterval(poll, 2500);
    return () => {
      cancelled = true;
      window.clearInterval(id);
    };
  }, [quickDocId]);

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

      const uploadResponse = await uploadFile(preparedPdf, {
        contactId: selectedContact.id,
        name: docName,
        tags,
        uploadSource: tier === "native_capacitor" ? "mobile_scan" : "web_scan",
        pageCount: pages.length,
        capturedPlatform,
        captureMode: "multi_page_scan",
        captureQualityWarnings: captureQualityWarnings.length ? captureQualityWarnings : undefined,
        manualCropApplied: false,
        rotationAdjusted: didManualRotate,
      });

      const docId = uploadResponse.documentId ?? uploadResponse.id;
      if (docId) {
        void triggerDocumentBackgroundProcessing(docId).catch(() => {});
      }

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
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5">
          <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Sken na tomto zařízení</h1>
          <p className="mt-2 text-sm text-[color:var(--wp-text-secondary)]">
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
              className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)]"
            >
              Zpět na přehled
            </Link>
          </div>
        </div>
      </div>
    );
  }

  if (step === "mode") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
          <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Nahrát dokument</h1>
          <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
            Zvolte, zda chcete kvalitní sken v aplikaci, nebo rychlé nahrání souborů.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setStep("capture")}
          className="flex w-full flex-col gap-1 rounded-2xl border-2 border-blue-500 bg-blue-50/80 p-4 text-left transition hover:bg-blue-50"
        >
          <span className="text-base font-semibold text-blue-950">Skenovat dokument</span>
          <span className="text-sm text-blue-900/90">
            V mobilní aplikaci systémový skener (ořez, perspektiva). Úprava stran, náhled PDF, nahrání do Aidvisory.
            Po uložení spustíme přípravu textu na pozadí (OCR a extrakce), pokud je zapnutá.
          </span>
        </button>

        <button
          type="button"
          onClick={() => {
            setQuickError(null);
            setQuickFiles([]);
            setQuickDocId(null);
            setQuickProcessingStatus(null);
            setQuickProcessingStage(null);
            setStep("quick");
          }}
          className="flex w-full flex-col gap-1 rounded-2xl border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] p-4 text-left transition hover:bg-[color:var(--wp-surface-muted)]"
        >
          <span className="text-base font-semibold text-[color:var(--wp-text)]">Rychlé nahrání</span>
          <span className="text-sm text-[color:var(--wp-text-secondary)]">
            Vyberte fotky nebo jedno PDF — soubor je hned v dokumentech. Z více fotek složíme PDF na serveru. Následně
            proběhne zpracování na pozadí (textová vrstva a data pro AI). Nejrychlejší cesta, bez skenovacího průvodce.
          </span>
        </button>

        <Link
          href="/portal/today"
          className="inline-flex min-h-[44px] items-center justify-center rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)]"
        >
          Zpět
        </Link>
      </div>
    );
  }

  if (step === "quick") {
    const processingLabel = (() => {
      const s = quickProcessingStatus ?? "queued";
      if (s === "completed") return "Zpracování dokončeno";
      if (s === "failed" || s === "preprocessing_failed") return "Zpracování selhalo";
      if (s === "skipped") return "Zpracování přeskočeno (vypnuto nebo nepodporováno)";
      if (s === "processing" || s === "preprocessing_running")
        return `Probíhá zpracování${quickProcessingStage && quickProcessingStage !== "none" ? ` · ${quickProcessingStage}` : ""}…`;
      return "Ve frontě na zpracování…";
    })();

    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
          <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Rychlé nahrání</h1>
          <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
            Jedno PDF nebo více fotek (max. 20). PDF z fotek vytvoříme na serveru. Stav zpracování textu sledujte níže.
          </p>
        </div>

        <button
          type="button"
          onClick={() => {
            setQuickDocId(null);
            setQuickProcessingStatus(null);
            setStep("mode");
          }}
          className="inline-flex min-h-[44px] w-fit items-center text-sm font-semibold text-[color:var(--wp-text-secondary)] underline-offset-2 hover:underline"
        >
          Zpět na výběr
        </button>

        {!quickDocId ? (
          <>
            <ContactPicker value={selectedContact} onChange={setSelectedContact} />

            <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
              <label className="mb-2 block text-sm font-medium text-[color:var(--wp-text-secondary)]" htmlFor="quick-doc-name">
                Název dokumentu (volitelné)
              </label>
              <input
                id="quick-doc-name"
                value={quickName}
                onChange={(e) => setQuickName(e.target.value)}
                placeholder="Např. smlouva, faktura"
                className="h-11 w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
              />
            </div>

            <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
              <label className="mb-2 block text-sm font-medium text-[color:var(--wp-text-secondary)]" htmlFor="quick-files">
                Soubory
              </label>
              <input
                id="quick-files"
                type="file"
                multiple
                accept="image/*,.pdf,application/pdf"
                className="min-h-[44px] w-full text-sm text-[color:var(--wp-text)]"
                onChange={(e) => {
                  const list = e.target.files ? Array.from(e.target.files) : [];
                  setQuickFiles(list);
                  setQuickError(null);
                }}
              />
              {quickFiles.length > 0 ? (
                <ul className="mt-2 space-y-1 text-xs text-[color:var(--wp-text-secondary)]">
                  {quickFiles.map((f, i) => (
                    <li key={`${f.name}-${i}`}>
                      {f.name} · {formatSize(f.size)}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>

            {quickError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{quickError}</div>
            ) : null}

            <button
              type="button"
              disabled={quickUploading}
              onClick={() => {
                void (async () => {
                  if (!selectedContact?.id) {
                    setQuickError("Vyberte klienta.");
                    return;
                  }
                  if (quickFiles.length === 0) {
                    setQuickError("Vyberte alespoň jeden soubor.");
                    return;
                  }
                  setQuickUploading(true);
                  setQuickError(null);
                  try {
                    const fd = new FormData();
                    for (const f of quickFiles) {
                      fd.append("files", f);
                    }
                    fd.set("contactId", selectedContact.id);
                    if (quickName.trim()) fd.set("name", quickName.trim());
                    fd.set("uploadSource", tier === "native_capacitor" ? "mobile_quick" : "web_quick");
                    const res = await fetch("/api/documents/quick-upload", {
                      method: "POST",
                      body: fd,
                      credentials: "same-origin",
                    });
                    const data = (await res.json()) as { error?: string; documentId?: string; id?: string };
                    if (!res.ok) {
                      setQuickError(data.error ?? "Nahrání selhalo.");
                      return;
                    }
                    const id = data.documentId ?? data.id;
                    if (id) setQuickDocId(id);
                  } catch {
                    setQuickError("Nahrání selhalo.");
                  } finally {
                    setQuickUploading(false);
                  }
                })();
              }}
              className="min-h-[48px] w-full rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:opacity-50"
            >
              {quickUploading ? "Nahrávám…" : "Nahrát"}
            </button>
          </>
        ) : (
          <div className="space-y-3 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-4">
            <p className="text-sm font-medium text-[color:var(--wp-text)]">Dokument je uložený.</p>
            <p className="text-sm text-[color:var(--wp-text-secondary)]">
              <strong>Stav zpracování:</strong> {processingLabel}
            </p>
            <p className="text-xs text-[color:var(--wp-text-secondary)]">
              Úplný stav uvidíte u přílohy u klienta v sekci dokumentů. Obnovení stránky tady ukončí sledování — dokument v
              systému zůstane.
            </p>
            <div className="flex flex-col gap-2 sm:flex-row">
              <Link
                href={selectedContact ? `/portal/contacts/${selectedContact.id}` : "/portal/documents"}
                className="inline-flex min-h-[44px] flex-1 items-center justify-center rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white"
              >
                Otevřít klienta / dokumenty
              </Link>
              <button
                type="button"
                onClick={() => {
                  setQuickDocId(null);
                  setQuickFiles([]);
                  setQuickName("");
                  setQuickProcessingStatus(null);
                  setQuickProcessingStage(null);
                  setStep("mode");
                }}
                className="min-h-[44px] flex-1 rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)]"
              >
                Nahrát další
              </button>
            </div>
          </div>
        )}
      </div>
    );
  }

  if (step === "capture") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <button
          type="button"
          onClick={() => setStep("mode")}
          className="inline-flex w-fit min-h-[44px] items-center text-sm font-semibold text-[color:var(--wp-text-secondary)] underline-offset-2 hover:underline"
        >
          Zpět na výběr
        </button>
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
          <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Skenovat dokument</h1>
          <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
            Vyfoťte jednotlivé strany dokumentu. Přetažením změníte pořadí.
          </p>
        </div>

        {tier === "web_mobile" ? (
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-3 text-xs text-[color:var(--wp-text-secondary)]">
            V prohlížeči je sken omezený na fotky bez automatického ořezu dokumentu. Pro nejlepší výsledek použijte{" "}
            <strong>mobilní aplikaci Aidvisora</strong> (sken dokumentu) nebo nahrajte už hotové PDF z galerie přes
            dokumenty. Po klepnutí na <strong>Přidat stranu</strong> se otevře fotoaparát nebo výběr souboru; více stran
            najednou přes <strong>Více z galerie</strong>.
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

        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
          <h2 className="mb-3 text-sm font-medium text-[color:var(--wp-text-secondary)]">
            Naskenované strany ({scanPages.length})
          </h2>

          {scanPages.length > 0 ? (
            <div className="mb-3 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              Připraveno k uložení do PDF · <strong>{scanPages.length}</strong>{" "}
              {scanPages.length === 1 ? "strana" : scanPages.length < 5 ? "strany" : "stran"} · pokračujte k údajům a
              náhledu
            </div>
          ) : null}

          {scanPages.length === 0 ? (
            <p className="text-sm text-[color:var(--wp-text-secondary)]">Zatím není přidaná žádná strana.</p>
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
                      onRotateCw={(i) => void rotatePage(i, 1)}
                      isCapturing={isCapturing}
                    />
                  ))}
                </div>
              </SortableContext>
            </DndContext>
          )}
        </div>

        <div className="sticky bottom-0 z-10 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 p-3 backdrop-blur">
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
                className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[color:var(--wp-surface-card-border)]"
              >
                {isCapturing ? "Otevírám výběr…" : canAddMore ? "Přidat stranu" : "Limit 20 stran"}
              </button>
              <button
                type="button"
                onClick={() => setStep("metadata")}
                disabled={pages.length === 0}
                className="min-h-[44px] flex-1 rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)] disabled:cursor-not-allowed disabled:opacity-50"
              >
                Pokračovat ({pages.length} {pages.length === 1 ? "strana" : pages.length < 5 ? "strany" : "stran"})
              </button>
            </div>
            {tier === "native_capacitor" ? (
              <button
                type="button"
                onClick={() => {
                  setError(null);
                  void addPagesFromDocumentScanner();
                }}
                disabled={isCapturing || !canAddMore}
                className="min-h-[44px] w-full rounded-lg border-2 border-blue-500 bg-blue-50 px-4 text-sm font-semibold text-blue-900 disabled:cursor-not-allowed disabled:opacity-50"
              >
                Skenovat dokument (systémový skener)
              </button>
            ) : null}
            <button
              type="button"
              onClick={() => {
                setError(null);
                void addPagesFromGalleryBatch();
              }}
              disabled={isCapturing || !canAddMore}
              className="min-h-[44px] w-full rounded-lg border border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] px-4 text-sm font-semibold text-[color:var(--wp-text)] disabled:cursor-not-allowed disabled:opacity-50"
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
        <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
          <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Náhled PDF</h1>
          <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
            Zkontrolujte složený dokument. Teprve poté ho odešlete do knihovny dokumentů.
          </p>
        </div>

        {pdfPreviewUrl ? (
          <div className="space-y-2">
            <div className="w-full overflow-hidden rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)]">
              <iframe
                title="Náhled PDF před nahráním"
                src={`${pdfPreviewUrl}#toolbar=0&navpanes=0&view=FitH`}
                className="block min-h-[55vh] w-full border-0 bg-[color:var(--wp-surface-card)] sm:min-h-[65vh]"
              />
            </div>
            <p className="text-xs text-[color:var(--wp-text-secondary)]">
              Pokud se PDF v rámečku nezobrazí (Safari), otevřete ho v novém okně nebo systémovým prohlížečem PDF.
            </p>
            <a
              href={pdfPreviewUrl}
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-[44px] items-center text-sm font-semibold text-blue-700 underline-offset-2 hover:underline"
            >
              Otevřít PDF v novém okně / systému
            </a>
          </div>
        ) : (
          <p className="text-sm text-[color:var(--wp-text-secondary)]">Náhled není k dispozici.</p>
        )}

        {uploadState === "uploading" ? (
          <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
            <div className="mb-1 text-sm font-medium text-[color:var(--wp-text-secondary)]">Nahrávání</div>
            <div className="h-2 w-full overflow-hidden rounded bg-[color:var(--wp-surface-muted)]">
              <div className="h-full bg-blue-500 transition-all duration-150" style={{ width: `${progress}%` }} />
            </div>
          </div>
        ) : null}

        {uploadError ? (
          <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
        ) : null}

        <div className="sticky bottom-0 z-10 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 p-3 backdrop-blur">
          <div className="flex flex-col gap-2 sm:flex-row">
            <button
              type="button"
              disabled={isUploading || uploadState === "done"}
              onClick={() => void uploadPreparedPdf()}
              className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[color:var(--wp-surface-card-border)]"
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
              className="min-h-[44px] flex-1 rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)] disabled:opacity-50"
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
              <>
                <p className="mb-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                  Na pozadí běží příprava textu (OCR a data pro AI), pokud je zpracování v projektu zapnuté. Stav uvidíte u
                  dokumentu u klienta.
                </p>
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
              </>
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
      <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4">
        <h1 className="text-lg font-semibold text-[color:var(--wp-text)]">Nahrání skenu</h1>
        <p className="mt-1 text-sm text-[color:var(--wp-text-secondary)]">
          Vyplňte údaje, zobrazte náhled PDF a teprve poté nahrajte dokument.
        </p>
      </div>

      {globalError ? <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{globalError}</div> : null}

      {pages.length > 0 ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          Připraveno k uložení do PDF · <strong>{pages.length}</strong>{" "}
          {pages.length === 1 ? "strana" : pages.length < 5 ? "strany" : "stran"}
        </div>
      ) : null}

      <ContactPicker value={selectedContact} onChange={setSelectedContact} />

      <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
        <label className="mb-2 block text-sm font-medium text-[color:var(--wp-text-secondary)]" htmlFor="scan-doc-type">
          Typ dokumentu
        </label>
        <input
          id="scan-doc-type"
          value={documentType}
          onChange={(event) => setDocumentType(event.target.value)}
          placeholder="Např. smlouva, faktura"
          className="h-11 w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />

        <label className="mb-2 mt-3 block text-sm font-medium text-[color:var(--wp-text-secondary)]" htmlFor="scan-note">
          Poznámka
        </label>
        <textarea
          id="scan-note"
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="Volitelná poznámka ke skenu"
          className="min-h-24 w-full rounded-lg border border-[color:var(--wp-border-strong)] px-3 py-2 text-sm outline-none focus:border-blue-500 focus:ring-2 focus:ring-blue-200"
        />
      </div>

      <div className="rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-3">
        <h2 className="mb-2 text-sm font-medium text-[color:var(--wp-text-secondary)]">
          Strany v dokumentu ({pages.length})
        </h2>
        <div className="flex flex-wrap gap-3">
          {scanPages.map((sp, index) => (
            <div key={sp.id} className="shrink-0 text-center">
              <ScanThumbnail file={sp.file} alt={`Strana ${index + 1}`} />
              <div className="mt-1 text-xs text-[color:var(--wp-text-secondary)]">
                {index + 1} · {formatSize(sp.file.size)}
              </div>
            </div>
          ))}
        </div>
      </div>

      {uploadError ? (
        <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{uploadError}</div>
      ) : null}

      <div className="sticky bottom-0 z-10 rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)]/95 p-3 backdrop-blur">
        <div className="flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isUploading || isBuildingPdf || pages.length === 0}
            onClick={() => void preparePreviewPdf()}
            className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-[color:var(--wp-surface-card-border)]"
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
            className="min-h-[44px] flex-1 rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)] disabled:opacity-50"
          >
            Zpět na focení
          </button>
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
              setStep("mode");
            }}
            className="min-h-[44px] flex-1 rounded-lg border border-[color:var(--wp-border-strong)] px-4 text-sm font-semibold text-[color:var(--wp-text-secondary)] disabled:opacity-50"
          >
            Změnit způsob nahrání
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
