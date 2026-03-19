"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { FileText, Image as ImageIcon, UploadCloud, X } from "lucide-react";
import { useNativePlatform } from "@/lib/capacitor/useNativePlatform";
import { useDocumentCapture } from "@/lib/upload/useDocumentCapture";
import { type UploadSource, useFileUpload } from "@/lib/upload/useFileUpload";
import { UploadSourceSheet, type UploadSourceOption } from "./UploadSourceSheet";
import { CustomDropdown } from "@/app/components/ui/CustomDropdown";

type ContractOption = {
  id: string;
  label: string;
};

type UploadedDocument = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

type DocumentUploadZoneProps = {
  contactId?: string;
  opportunityId?: string;
  initialContractId?: string;
  initialVisibleToClient?: boolean;
  initialTags?: string[];
  initialName?: string;
  contracts?: ContractOption[];
  showContractSelect?: boolean;
  showTagsInput?: boolean;
  showVisibleToClient?: boolean;
  showNameInput?: boolean;
  accept?: string;
  chooseButtonLabel?: string;
  submitButtonLabel?: string;
  className?: string;
  onUploaded?: (doc: UploadedDocument) => void;
};

function sourceToUploadSource(source: UploadSourceOption, isNative: boolean): UploadSource {
  if (!isNative) return "web";
  if (source === "camera") return "mobile_camera";
  if (source === "gallery") return "mobile_gallery";
  if (source === "scan") return "mobile_scan";
  return "mobile_file";
}

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function DocumentUploadZone({
  contactId,
  opportunityId,
  initialContractId,
  initialVisibleToClient = false,
  initialTags = [],
  initialName = "",
  contracts = [],
  showContractSelect = false,
  showTagsInput = false,
  showVisibleToClient = false,
  showNameInput = true,
  accept = ".pdf,image/*",
  chooseButtonLabel = "Vybrat dokument",
  submitButtonLabel = "Nahrát dokument",
  className = "",
  onUploaded,
}: DocumentUploadZoneProps) {
  const router = useRouter();
  const inputRef = useRef<HTMLInputElement>(null);
  const [sheetOpen, setSheetOpen] = useState(false);
  const [selectedSource, setSelectedSource] = useState<UploadSourceOption>("file");
  const [name, setName] = useState(initialName);
  const [tagsRaw, setTagsRaw] = useState(initialTags.join(", "));
  const [contractId, setContractId] = useState(initialContractId ?? "");
  const [visibleToClient, setVisibleToClient] = useState(initialVisibleToClient);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const { isNative } = useNativePlatform();
  const { captureFromCamera, captureFromGallery } = useDocumentCapture();
  const {
    state,
    file,
    previewUrl,
    isImagePreview,
    progress,
    error,
    selectFile,
    upload,
    retry,
    cancelUpload,
    reset,
  } = useFileUpload();

  const effectiveError = captureError || error;

  const openFilePicker = () => inputRef.current?.click();

  const handleSourceSelect = async (source: UploadSourceOption) => {
    setSheetOpen(false);
    setSelectedSource(source);
    setCaptureError(null);

    if (source === "file") {
      openFilePicker();
      return;
    }

    if (source === "scan") {
      const query = contactId ? `?contactId=${encodeURIComponent(contactId)}` : "";
      router.push(`/portal/scan${query}`);
      return;
    }

    const captureResult = source === "camera" ? await captureFromCamera() : await captureFromGallery();
    if (captureResult.error) {
      setCaptureError(captureResult.error);
      return;
    }
    if (captureResult.file) {
      selectFile(captureResult.file);
      if (!name.trim()) setName(captureResult.file.name);
    }
  };

  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    const nextFile = event.target.files?.[0] ?? null;
    if (!nextFile) return;
    const ok = selectFile(nextFile);
    if (ok && !name.trim()) {
      setName(nextFile.name);
    }
    event.target.value = "";
  };

  const handleDrop = (event: React.DragEvent<HTMLDivElement>) => {
    if (isNative) return;
    event.preventDefault();
    const droppedFile = event.dataTransfer.files?.[0] ?? null;
    if (!droppedFile) return;
    const ok = selectFile(droppedFile);
    if (ok && !name.trim()) {
      setName(droppedFile.name);
    }
  };

  const handleUpload = async () => {
    if (!file) return;
    const tags = tagsRaw
      .split(",")
      .map((tag) => tag.trim())
      .filter(Boolean);

    try {
      const uploaded = await upload({
        contactId,
        opportunityId,
        contractId: contractId || undefined,
        name: name.trim() || file.name,
        tags,
        visibleToClient,
        uploadSource: sourceToUploadSource(selectedSource, isNative),
      });

      onUploaded?.(uploaded);
      setCaptureError(null);
      setName("");
      setTagsRaw("");
      setContractId(initialContractId ?? "");
      setVisibleToClient(initialVisibleToClient);
      reset();
    } catch {
      // Hook already stores error state for UI.
    }
  };

  const inProgress = state === "uploading";

  return (
    <div className={`rounded-[var(--wp-radius-lg)] border border-slate-200 bg-slate-50/60 p-4 space-y-3 ${className}`}>
      <UploadSourceSheet open={sheetOpen} onClose={() => setSheetOpen(false)} onSelect={handleSourceSelect} />
      <input ref={inputRef} type="file" accept={accept} className="hidden" onChange={handleInputChange} />

      {!file && (
        <div
          onDragOver={(event) => {
            if (!isNative) event.preventDefault();
          }}
          onDrop={handleDrop}
          className="rounded-xl border border-dashed border-slate-300 bg-white p-4"
        >
          <button
            type="button"
            onClick={() => (isNative ? setSheetOpen(true) : openFilePicker())}
            className="w-full min-h-[44px] rounded-lg px-4 py-3 border border-slate-200 bg-slate-50 text-sm font-semibold text-slate-700 hover:bg-slate-100 flex items-center justify-center gap-2"
          >
            <UploadCloud size={18} />
            {chooseButtonLabel}
          </button>
          {!isNative && <p className="text-xs text-slate-500 mt-2">Můžete také soubor přetáhnout do této oblasti.</p>}
        </div>
      )}

      {file && (
        <div className="rounded-xl border border-slate-200 bg-white p-3 space-y-3">
          <div className="flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              {isImagePreview && previewUrl ? (
                <img src={previewUrl} alt="Náhled dokumentu" className="h-16 w-16 rounded-lg object-cover border border-slate-200" />
              ) : (
                <div className="h-16 w-16 rounded-lg border border-slate-200 bg-slate-50 flex items-center justify-center text-slate-500">
                  {file.type === "application/pdf" ? <FileText size={22} /> : <ImageIcon size={22} />}
                </div>
              )}
              <div className="min-w-0">
                <p className="text-sm font-semibold text-slate-800 truncate">{file.name}</p>
                <p className="text-xs text-slate-500">{formatFileSize(file.size)}</p>
              </div>
            </div>
            {!inProgress && (
              <button
                type="button"
                onClick={() => {
                  setCaptureError(null);
                  reset();
                }}
                className="min-h-[44px] min-w-[44px] rounded-lg border border-slate-200 text-slate-500 hover:bg-slate-50 flex items-center justify-center"
                aria-label="Odebrat soubor"
              >
                <X size={16} />
              </button>
            )}
          </div>

          {showNameInput && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Název (volitelně)</label>
              <input
                type="text"
                value={name}
                onChange={(event) => setName(event.target.value)}
                placeholder="název dokumentu"
                className="w-full rounded border border-slate-300 px-3 min-h-[44px] text-sm"
              />
            </div>
          )}

          {showTagsInput && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Tagy (oddělené čárkou)</label>
              <input
                type="text"
                value={tagsRaw}
                onChange={(event) => setTagsRaw(event.target.value)}
                placeholder="např. smlouva, příloha"
                className="w-full rounded border border-slate-300 px-3 min-h-[44px] text-sm"
              />
            </div>
          )}

          {showContractSelect && (
            <div>
              <label className="block text-xs font-medium text-slate-500 mb-1">Smlouva</label>
              <CustomDropdown
                value={contractId}
                onChange={setContractId}
                options={[{ id: "", label: "— žádná —" }, ...contracts.map((c) => ({ id: c.id, label: c.label }))]}
                placeholder="— žádná —"
                icon={FileText}
              />
            </div>
          )}

          {showVisibleToClient && (
            <label className="flex items-center gap-2 text-sm text-slate-600 min-h-[44px]">
              <input
                type="checkbox"
                checked={visibleToClient}
                onChange={(event) => setVisibleToClient(event.target.checked)}
                className="rounded border-slate-300"
              />
              Viditelné klientovi
            </label>
          )}

          {inProgress && (
            <div className="space-y-2">
              <div className="h-2 rounded-full bg-slate-100 overflow-hidden">
                <div className="h-full bg-indigo-600 transition-all" style={{ width: `${progress}%` }} />
              </div>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>Nahrávání {progress}%</span>
                <button type="button" onClick={cancelUpload} className="text-slate-600 hover:text-slate-800">
                  Zrušit
                </button>
              </div>
            </div>
          )}

          {effectiveError && <p className="text-sm text-red-600">{effectiveError}</p>}

          <div className="flex flex-wrap gap-2">
            {!inProgress && (
              <button
                type="button"
                onClick={handleUpload}
                className="rounded-[var(--wp-radius)] px-4 py-2.5 min-h-[44px] text-sm font-semibold text-white bg-[var(--wp-accent)] hover:opacity-90"
              >
                {submitButtonLabel}
              </button>
            )}
            {state === "error" && (
              <button
                type="button"
                onClick={() => {
                  retry().catch(() => {});
                }}
                className="rounded-[var(--wp-radius)] px-4 py-2.5 min-h-[44px] text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Zkusit znovu
              </button>
            )}
            {!inProgress && (
              <button
                type="button"
                onClick={() => (isNative ? setSheetOpen(true) : openFilePicker())}
                className="rounded-[var(--wp-radius)] px-4 py-2.5 min-h-[44px] text-sm font-semibold border border-slate-300 text-slate-700 hover:bg-slate-100"
              >
                Vybrat jiný soubor
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
