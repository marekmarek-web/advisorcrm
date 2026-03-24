"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
import { ContactPicker, type ContactPickerValue } from "@/app/components/upload/ContactPicker";
import { useNativePlatform } from "@/lib/capacitor/useNativePlatform";
import { useScanCapture, type ScanPage } from "@/lib/scan/useScanCapture";
import { useFileUpload } from "@/lib/upload/useFileUpload";

type ScanStep = "capture" | "metadata";

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

  const style = {
    transform: CSS.Transform.toString(transform),
    transition,
    opacity: isDragging ? 0.5 : 1,
    zIndex: isDragging ? 50 : undefined,
  };

  return (
    <div ref={setNodeRef} style={style} className="shrink-0 rounded-xl border border-slate-200 bg-white p-2">
      <div {...attributes} {...listeners} className="cursor-grab touch-none active:cursor-grabbing">
        <div className="mb-1 text-center text-xs font-medium text-slate-500">{index + 1}</div>
        <ScanThumbnail file={scanPage.file} alt={`Strana ${index + 1}`} />
      </div>
      <div className="mt-2 flex gap-1.5">
        <button
          type="button"
          onClick={() => onRetake(index)}
          disabled={isCapturing}
          className="min-h-[40px] flex-1 rounded-lg border border-slate-300 px-2 text-xs font-semibold text-slate-700 disabled:opacity-50"
        >
          Znovu
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
  const { isNative } = useNativePlatform();
  const {
    scanPages,
    pageIds,
    pages,
    capturePage,
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
  } = useScanCapture();
  const { uploadFile, progress } = useFileUpload();
  const hasStartedCapture = useRef(false);

  const [step, setStep] = useState<ScanStep>("capture");
  const [selectedContact, setSelectedContact] = useState<ContactPickerValue | null>(null);
  const [documentType, setDocumentType] = useState("");
  const [note, setNote] = useState("");
  const [isUploading, setIsUploading] = useState(false);
  const [uploadState, setUploadState] = useState<"idle" | "building" | "uploading" | "done" | "error">("idle");
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [globalError, setGlobalError] = useState<string | null>(null);

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 200, tolerance: 5 } })
  );

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

  function handleDragEnd(event: DragEndEvent) {
    const { active, over } = event;
    if (!over || active.id === over.id) return;
    const fromIndex = pageIds.indexOf(active.id as string);
    const toIndex = pageIds.indexOf(over.id as string);
    if (fromIndex !== -1 && toIndex !== -1) {
      reorderPages(fromIndex, toIndex);
    }
  }

  const uploadAsPdf = async () => {
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

      setUploadState("uploading");

      await uploadFile(pdf, {
        contactId: selectedContact.id,
        name: docName,
        tags,
        uploadSource: "mobile_scan",
        pageCount: pages.length,
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

  if (!isNative) return null;

  if (step === "capture") {
    return (
      <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
        <div className="rounded-2xl border border-slate-200 bg-white p-4">
          <h1 className="text-lg font-semibold text-slate-900">Skenovat dokument</h1>
          <p className="mt-1 text-sm text-slate-600">
            Vyfoťte jednotlivé strany dokumentu. Přetažením změníte pořadí.
          </p>
        </div>

        {error ? (
          <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
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
              {isCapturing ? "Otevírám kameru..." : canAddMore ? "Přidat stranu" : "Limit 20 stran"}
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
        </div>
      </div>
    );
  }

  const uploadLabel =
    uploadState === "building"
      ? "Sestavuji PDF..."
      : uploadState === "uploading"
        ? `Nahrávám... ${progress}%`
        : uploadState === "done"
          ? "Nahráno"
          : "Nahrát jako PDF";

  return (
    <div className="mx-auto flex w-full max-w-3xl flex-col gap-4 px-4 pb-8 pt-4 sm:px-6">
      <div className="rounded-2xl border border-slate-200 bg-white p-4">
        <h1 className="text-lg font-semibold text-slate-900">Nahrání skenu</h1>
        <p className="mt-1 text-sm text-slate-600">
          Všechny strany se složí do jednoho PDF a nahrají jako jeden dokument.
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
            disabled={isUploading || isBuildingPdf || pages.length === 0 || uploadState === "done"}
            onClick={() => void uploadAsPdf()}
            className="min-h-[44px] flex-1 rounded-lg bg-blue-600 px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-300"
          >
            {uploadLabel}
          </button>
        </div>

        <div className="mt-2 flex flex-col gap-2 sm:flex-row">
          <button
            type="button"
            disabled={isUploading || isBuildingPdf}
            onClick={() => {
              setUploadState("idle");
              setUploadError(null);
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
              onClick={() => void uploadAsPdf()}
              className="min-h-[44px] flex-1 rounded-lg border border-amber-300 bg-amber-50 px-4 text-sm font-semibold text-amber-700 disabled:opacity-50"
            >
              Zkusit znovu
            </button>
          ) : null}

          {uploadState === "done" ? (
            <button
              type="button"
              onClick={() => {
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
