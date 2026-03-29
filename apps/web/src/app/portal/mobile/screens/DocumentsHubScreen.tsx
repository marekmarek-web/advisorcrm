"use client";

import { useCallback, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import {
  FileText,
  Image,
  FileSearch,
  Upload,
  Camera,
  FolderOpen,
  File,
  RefreshCw,
  User,
  CheckCircle2,
  Clock,
  Loader2,
  AlertTriangle,
  ChevronRight,
  Tag,
  Eye,
  EyeOff,
  Trash2,
  ScanLine,
  Pencil,
  Download,
} from "lucide-react";
import {
  listDocuments,
  deleteDocument,
  updateDocument,
  updateDocumentVisibleToClient,
  type DocumentRow,
} from "@/app/actions/documents";
import {
  BottomSheet,
  EmptyState,
  ErrorState,
  FilterChips,
  FloatingActionButton,
  LoadingSkeleton,
  MobileCard,
  SearchBar,
  StatusBadge,
} from "@/app/shared/mobile-ui/primitives";
import type { DeviceClass } from "@/lib/ui/useDeviceClass";
import { useCaptureCapabilities } from "@/lib/device/useCaptureCapabilities";
import { humanizeAdvisorActionError } from "@/lib/ui/humanize-action-error";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";
import { isIosWebKitPdfEmbedUnreliable, openDocumentUrlInNewTab } from "@/lib/browser/pdf-document-open";

function cx(...classes: Array<string | false | null | undefined>) {
  return classes.filter(Boolean).join(" ");
}

/* ------------------------------------------------------------------ */
/*  Types & helpers                                                    */
/* ------------------------------------------------------------------ */

type DocItem = DocumentRow & { contactName?: string | null };
type SourceFilter = "all" | "pdf" | "image" | "scan";

function getFileIcon(mimeType: string | null) {
  if (mimeType?.startsWith("image/")) return Image;
  if (mimeType === "application/pdf") return FileText;
  return File;
}

function getSourceLabel(source: string | null): string {
  switch (source) {
    case "mobile_camera": return "Fotoaparát";
    case "mobile_gallery": return "Galerie";
    case "mobile_file": return "Soubor";
    case "mobile_scan":
    case "web_scan":
      return "Sken";
    case "mobile_share": return "Sdílení";
    case "ai_drawer": return "AI";
    default: return "Web";
  }
}

function getProcessingConfig(status: string | null) {
  switch (status) {
    case "completed":
    case "extracted":
      return { label: "Zpracováno", tone: "success" as const, Icon: CheckCircle2 };
    case "processing":
    case "queued":
    case "preprocessing_running":
    case "preprocessing_pending":
    case "extraction_running":
      return { label: "Zpracování…", tone: "info" as const, Icon: Loader2 };
    case "failed":
    case "preprocessing_failed":
      return { label: "Chyba", tone: "danger" as const, Icon: AlertTriangle };
    case "review_required":
      return { label: "K revizi", tone: "warning" as const, Icon: FileSearch };
    default:
      return { label: "Čeká", tone: "info" as const, Icon: Clock };
  }
}

function formatRelativeDate(d: Date) {
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffMin = Math.floor(diffMs / 60000);
  if (diffMin < 1) return "Právě teď";
  if (diffMin < 60) return `Před ${diffMin} min`;
  const diffH = Math.floor(diffMin / 60);
  if (diffH < 24) return `Před ${diffH} hod`;
  const diffD = Math.floor(diffH / 24);
  if (diffD < 7) return `Před ${diffD} dny`;
  return d.toLocaleDateString("cs-CZ", { day: "numeric", month: "short" });
}

function formatSize(bytes: number | null | undefined): string {
  if (!bytes) return "";
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/* ------------------------------------------------------------------ */
/*  Document card                                                      */
/* ------------------------------------------------------------------ */

function DocumentCard({
  doc,
  onClick,
  active,
}: {
  doc: DocItem;
  onClick: () => void;
  active?: boolean;
}) {
  const FileIcon = getFileIcon(doc.mimeType);
  const proc = getProcessingConfig(doc.processingStatus);
  const ProcIcon = proc.Icon;
  const isImage = doc.mimeType?.startsWith("image/");
  const isPdf = doc.mimeType === "application/pdf";

  return (
    <button
      type="button"
      onClick={onClick}
      className={cx(
        "w-full text-left border rounded-xl overflow-hidden transition-colors",
        active ? "ring-2 ring-indigo-300 border-indigo-300" : "border-[color:var(--wp-surface-card-border)]"
      )}
    >
      <div className="p-3.5">
        <div className="flex items-start gap-3">
          <div className={cx(
            "w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0",
            isImage ? "bg-purple-50" : isPdf ? "bg-rose-50" : "bg-[color:var(--wp-surface-muted)]"
          )}>
            <FileIcon size={18} className={cx(
              isImage ? "text-purple-500" : isPdf ? "text-rose-500" : "text-[color:var(--wp-text-secondary)]"
            )} />
          </div>
          <div className="flex-1 min-w-0">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-bold text-[color:var(--wp-text)] truncate">{doc.name}</p>
              <ChevronRight size={14} className="text-[color:var(--wp-text-tertiary)] flex-shrink-0" />
            </div>
            {doc.contactName ? (
              <p className="text-[10px] text-[color:var(--wp-text-secondary)] mt-0.5 flex items-center gap-1">
                <User size={9} /> {doc.contactName}
              </p>
            ) : null}
            <div className="flex items-center gap-1.5 mt-1.5 flex-wrap">
              <div className="flex items-center gap-1">
                <ProcIcon size={10} className={cx(
                  proc.tone === "success" ? "text-emerald-500" :
                  proc.tone === "danger" ? "text-rose-500" :
                  proc.tone === "warning" ? "text-amber-500" : "text-indigo-500",
                  (doc.processingStatus === "processing" || doc.processingStatus === "queued") && "animate-spin"
                )} />
                <StatusBadge tone={proc.tone}>{proc.label}</StatusBadge>
              </div>
              {doc.isScanLike ? (
                <span className="text-[9px] font-bold text-[color:var(--wp-text-tertiary)] bg-[color:var(--wp-surface-muted)] rounded px-1 py-0.5 flex items-center gap-0.5">
                  <ScanLine size={8} /> Sken
                </span>
              ) : null}
              {doc.visibleToClient ? (
                <span className="text-[9px] font-bold text-emerald-600 bg-emerald-50 rounded px-1 py-0.5 flex items-center gap-0.5">
                  <Eye size={8} /> Klient
                </span>
              ) : null}
              <span className="text-[10px] text-[color:var(--wp-text-tertiary)] ml-auto">
                {formatRelativeDate(doc.createdAt)}
              </span>
            </div>
            {doc.tags?.length ? (
              <div className="flex items-center gap-1 mt-1.5 flex-wrap">
                <Tag size={9} className="text-[color:var(--wp-text-tertiary)]" />
                {doc.tags.slice(0, 3).map((tag) => (
                  <span key={tag} className="text-[9px] font-bold text-indigo-600 bg-indigo-50 rounded px-1 py-0.5">
                    {tag}
                  </span>
                ))}
                {doc.tags.length > 3 ? (
                  <span className="text-[9px] text-[color:var(--wp-text-tertiary)]">+{doc.tags.length - 3}</span>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}

/* ------------------------------------------------------------------ */
/*  Detail panel                                                       */
/* ------------------------------------------------------------------ */

function parseTagsInput(raw: string): string[] {
  return raw
    .split(/[,;]/)
    .map((t) => t.trim())
    .filter(Boolean);
}

function DocumentDetailPanel({
  doc,
  pending,
  onToggleVisibility,
  onDelete,
  onSaveMetadata,
}: {
  doc: DocItem;
  pending: boolean;
  onToggleVisibility: () => void;
  onDelete: () => void;
  onSaveMetadata: (name: string, tags: string[]) => Promise<void>;
}) {
  const FileIcon = getFileIcon(doc.mimeType);
  const proc = getProcessingConfig(doc.processingStatus);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [editMode, setEditMode] = useState(false);
  const [editName, setEditName] = useState(doc.name);
  const [editTags, setEditTags] = useState(doc.tags?.join(", ") ?? "");
  const [saveError, setSaveError] = useState<string | null>(null);
  const [savingMeta, setSavingMeta] = useState(false);

  useEffect(() => {
    setEditMode(false);
    setEditName(doc.name);
    setEditTags(doc.tags?.join(", ") ?? "");
    setSaveError(null);
  }, [doc.id, doc.name, doc.tags]);

  const downloadHref = `/api/documents/${doc.id}/download`;

  async function handleSaveMeta() {
    const name = editName.trim();
    if (!name) {
      setSaveError("Název je povinný.");
      return;
    }
    setSavingMeta(true);
    setSaveError(null);
    try {
      await onSaveMetadata(name, parseTagsInput(editTags));
      setEditMode(false);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "Uložení se nepodařilo.");
    } finally {
      setSavingMeta(false);
    }
  }

  return (
    <div className="space-y-3 pb-4">
      {/* Hero */}
      <MobileCard className="p-4 bg-gradient-to-br from-[#0a0f29] to-indigo-900 border-0 rounded-xl">
        <div className="flex items-start gap-3">
          <div className="w-12 h-12 rounded-xl bg-[color:var(--wp-surface-card)]/10 flex items-center justify-center flex-shrink-0">
            <FileIcon size={22} className="text-indigo-300" />
          </div>
          <div className="flex-1 min-w-0">
            {editMode ? (
              <input
                type="text"
                value={editName}
                onChange={(e) => setEditName(e.target.value)}
                className="w-full min-h-[40px] rounded-lg border border-white/30 bg-[color:var(--wp-surface-card)]/10 text-white text-sm font-bold px-2 py-1.5"
                placeholder="Název dokumentu"
              />
            ) : (
              <p className="text-base font-black text-white truncate">{doc.name}</p>
            )}
            {doc.contactName ? (
              <p className="text-xs text-indigo-300 mt-0.5 flex items-center gap-1">
                <User size={10} /> {doc.contactName}
              </p>
            ) : null}
            <div className="flex items-center gap-2 mt-1.5">
              <StatusBadge tone={proc.tone}>{proc.label}</StatusBadge>
              {doc.isScanLike ? <StatusBadge tone="info">Sken</StatusBadge> : null}
            </div>
          </div>
        </div>
      </MobileCard>

      {/* Meta */}
      <MobileCard className="divide-y divide-[color:var(--wp-surface-card-border)] py-0">
        <div className="flex items-center justify-between py-3 px-0.5">
          <span className="text-xs text-[color:var(--wp-text-secondary)]">Typ</span>
          <span className="text-xs font-bold text-[color:var(--wp-text)]">{doc.mimeType || "Neznámý"}</span>
        </div>
        <div className="flex items-center justify-between py-3 px-0.5">
          <span className="text-xs text-[color:var(--wp-text-secondary)]">Zdroj</span>
          <span className="text-xs font-bold text-[color:var(--wp-text)]">{getSourceLabel(doc.uploadSource)}</span>
        </div>
        {doc.sizeBytes ? (
          <div className="flex items-center justify-between py-3 px-0.5">
            <span className="text-xs text-[color:var(--wp-text-secondary)]">Velikost</span>
            <span className="text-xs font-bold text-[color:var(--wp-text)]">{formatSize(doc.sizeBytes)}</span>
          </div>
        ) : null}
        {doc.pageCount ? (
          <div className="flex items-center justify-between py-3 px-0.5">
            <span className="text-xs text-[color:var(--wp-text-secondary)]">Počet stran</span>
            <span className="text-xs font-bold text-[color:var(--wp-text)]">{doc.pageCount}</span>
          </div>
        ) : null}
        <div className="flex items-center justify-between py-3 px-0.5">
          <span className="text-xs text-[color:var(--wp-text-secondary)]">Nahráno</span>
          <span className="text-xs font-bold text-[color:var(--wp-text)]">
            {doc.createdAt.toLocaleDateString("cs-CZ", { day: "numeric", month: "long", year: "numeric" })}
          </span>
        </div>
        <div className="flex items-center justify-between py-3 px-0.5">
          <span className="text-xs text-[color:var(--wp-text-secondary)]">Processing</span>
          <div className="flex items-center gap-1.5">
            <span className="text-xs text-[color:var(--wp-text-secondary)]">{doc.processingStage || "—"}</span>
            <StatusBadge tone={proc.tone}>{proc.label}</StatusBadge>
          </div>
        </div>
        {doc.aiInputSource && doc.aiInputSource !== "none" ? (
          <div className="flex items-center justify-between py-3 px-0.5">
            <span className="text-xs text-[color:var(--wp-text-secondary)]">AI vstup</span>
            <StatusBadge tone="info">{doc.aiInputSource}</StatusBadge>
          </div>
        ) : null}
      </MobileCard>

      {/* Tags */}
      <MobileCard className="p-3.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">Tagy</p>
        {editMode ? (
          <>
            <textarea
              value={editTags}
              onChange={(e) => setEditTags(e.target.value)}
              rows={3}
              className="w-full rounded-xl border border-[color:var(--wp-surface-card-border)] px-3 py-2 text-sm"
              placeholder="např. smlouva, 2024, hypotéka (čárkou oddělené)"
            />
            {saveError ? <p className="text-xs text-rose-600 font-semibold mt-2">{saveError}</p> : null}
            <div className="grid grid-cols-2 gap-2 mt-3">
              <button
                type="button"
                onClick={() => {
                  setEditMode(false);
                  setEditName(doc.name);
                  setEditTags(doc.tags?.join(", ") ?? "");
                  setSaveError(null);
                }}
                disabled={savingMeta}
                className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)]"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={handleSaveMeta}
                disabled={savingMeta}
                className={cx(portalPrimaryButtonClassName, "text-sm")}
              >
                {savingMeta ? "Ukládám…" : "Uložit"}
              </button>
            </div>
          </>
        ) : doc.tags?.length ? (
          <div className="flex flex-wrap gap-1.5">
            {doc.tags.map((tag) => (
              <span key={tag} className="text-xs font-bold text-indigo-700 bg-indigo-50 border border-indigo-100 rounded-lg px-2 py-1">
                {tag}
              </span>
            ))}
          </div>
        ) : (
          <p className="text-xs text-[color:var(--wp-text-secondary)]">Žádné tagy — použijte Upravit.</p>
        )}
      </MobileCard>

      {/* Actions */}
      <MobileCard className="p-3.5">
        <p className="text-[10px] font-black uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2.5">
          Akce
        </p>
        <div className="space-y-2">
          {doc.mimeType === "application/pdf" ? (
            <>
              <button
                type="button"
                onClick={() => openDocumentUrlInNewTab(downloadHref)}
                className="w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800 flex items-center justify-center gap-2"
              >
                <Download size={14} /> Otevřít PDF (nový panel)
              </button>
              {isIosWebKitPdfEmbedUnreliable() ? (
                <p className="text-xs text-[color:var(--wp-text-secondary)] rounded-lg border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3 py-2">
                  Na iOS Safari použijte tlačítko výše — vložený náhled PDF v aplikaci bývá nespolehlivý.
                </p>
              ) : (
                <details className="rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] overflow-hidden">
                  <summary className="min-h-[44px] cursor-pointer list-none px-3 py-2.5 text-sm font-bold text-[color:var(--wp-text-secondary)] flex items-center gap-2">
                    <Eye size={14} /> Náhled v aplikaci
                  </summary>
                  <div className="border-t border-[color:var(--wp-surface-card-border)] px-2 pb-2">
                    <div className="relative mx-auto mt-2 aspect-[210/297] max-h-[min(55vh,520px)] w-full overflow-hidden rounded-lg bg-[color:var(--wp-surface-card)]">
                      <iframe
                        title="Náhled PDF"
                        src={`${downloadHref}#view=FitH`}
                        className="absolute inset-0 h-full w-full border-0"
                      />
                    </div>
                    <p className="text-[10px] text-[color:var(--wp-text-tertiary)] mt-2 px-1">
                      Pokud je rámeček prázdný, použijte „Otevřít PDF (nový panel)“.
                    </p>
                  </div>
                </details>
              )}
            </>
          ) : (
            <a
              href={downloadHref}
              target="_blank"
              rel="noreferrer"
              className="w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 text-sm font-bold text-indigo-800 flex items-center justify-center gap-2"
            >
              <Download size={14} /> Otevřít / stáhnout
            </a>
          )}
          <button
            type="button"
            onClick={() => {
              setEditMode((v) => {
                if (v) {
                  setEditName(doc.name);
                  setEditTags(doc.tags?.join(", ") ?? "");
                  setSaveError(null);
                }
                return !v;
              });
            }}
            disabled={pending || savingMeta}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)] flex items-center justify-center gap-2"
          >
            <Pencil size={14} /> {editMode ? "Zavřít úpravy" : "Upravit název a tagy"}
          </button>
          <button
            type="button"
            onClick={onToggleVisibility}
            disabled={pending}
            className="w-full min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)] flex items-center justify-center gap-2"
          >
            {doc.visibleToClient ? <EyeOff size={14} /> : <Eye size={14} />}
            {doc.visibleToClient ? "Skrýt pro klienta" : "Zobrazit klientovi"}
          </button>
          {!confirmDelete ? (
            <button
              type="button"
              onClick={() => setConfirmDelete(true)}
              className="w-full min-h-[44px] rounded-xl border border-rose-200 text-sm font-bold text-rose-600 flex items-center justify-center gap-2"
            >
              <Trash2 size={14} /> Smazat dokument
            </button>
          ) : (
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setConfirmDelete(false)}
                className="min-h-[44px] rounded-xl border border-[color:var(--wp-surface-card-border)] text-sm font-bold text-[color:var(--wp-text-secondary)]"
              >
                Zrušit
              </button>
              <button
                type="button"
                onClick={onDelete}
                disabled={pending}
                className="min-h-[44px] rounded-xl bg-rose-600 text-white text-sm font-bold"
              >
                Potvrdit smazání
              </button>
            </div>
          )}
        </div>
      </MobileCard>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Upload bottom sheet                                                */
/* ------------------------------------------------------------------ */

function UploadSheet({
  open,
  onClose,
  onUpload,
  busy,
  showMultiPageScan,
}: {
  open: boolean;
  onClose: () => void;
  onUpload: (file: File, source: string) => void;
  busy: boolean;
  showMultiPageScan: boolean;
}) {
  const router = useRouter();
  return (
    <BottomSheet open={open} onClose={onClose} title="Nahrát dokument">
      <div className="space-y-3">
        <p className="text-xs text-[color:var(--wp-text-secondary)]">PDF nebo obrázek (max 20 MB).</p>
        {showMultiPageScan ? (
          <button
            type="button"
            onClick={() => {
              onClose();
              router.push("/portal/scan");
            }}
            className="w-full min-h-[44px] rounded-xl border border-indigo-200 bg-indigo-50 px-3 flex items-center justify-center gap-2 text-sm font-bold text-indigo-800"
          >
            <ScanLine size={18} className="text-indigo-600 shrink-0" />
            Vícestránkový sken (PDF)
          </button>
        ) : null}
        <div className="grid grid-cols-2 gap-2">
          <label className="flex flex-col items-center justify-center gap-1.5 min-h-[80px] rounded-xl border border-dashed border-indigo-300 bg-indigo-50/50 cursor-pointer">
            <Camera size={22} className="text-indigo-600" />
            <span className="text-xs font-bold text-indigo-700">Fotoaparát</span>
            <input
              type="file"
              accept="image/*"
              capture="environment"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f, "mobile_camera");
              }}
            />
          </label>
          <label className="flex flex-col items-center justify-center gap-1.5 min-h-[80px] rounded-xl border border-dashed border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)]/50 cursor-pointer">
            <Image size={22} className="text-[color:var(--wp-text-secondary)]" />
            <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">Galerie</span>
            <input
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f, "mobile_gallery");
              }}
            />
          </label>
          <label className="flex flex-col items-center justify-center gap-1.5 min-h-[80px] rounded-xl border border-dashed border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)]/50 cursor-pointer">
            <FileText size={22} className="text-[color:var(--wp-text-secondary)]" />
            <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">PDF soubor</span>
            <input
              type="file"
              accept="application/pdf"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f, "mobile_file");
              }}
            />
          </label>
          <label className="flex flex-col items-center justify-center gap-1.5 min-h-[80px] rounded-xl border border-dashed border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)]/50 cursor-pointer">
            <FolderOpen size={22} className="text-[color:var(--wp-text-secondary)]" />
            <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">Jakýkoli soubor</span>
            <input
              type="file"
              accept="application/pdf,image/*"
              className="hidden"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onUpload(f, "mobile_file");
              }}
            />
          </label>
        </div>
        {busy ? (
          <div className="flex items-center justify-center gap-2 py-2">
            <Loader2 size={16} className="animate-spin text-indigo-600" />
            <span className="text-xs font-bold text-[color:var(--wp-text-secondary)]">Nahrávám…</span>
          </div>
        ) : null}
      </div>
    </BottomSheet>
  );
}

/* ------------------------------------------------------------------ */
/*  Main screen                                                        */
/* ------------------------------------------------------------------ */

export function DocumentsHubScreen({
  deviceClass = "phone",
  hideScreenFab = false,
}: {
  deviceClass?: DeviceClass;
  /** Skryje lokální FAB — používá se se spodní lištou s centrálním +. */
  hideScreenFab?: boolean;
}) {
  const { supportsMultiPageScan } = useCaptureCapabilities();
  const searchParams = useSearchParams();
  const docIdFromQuery = searchParams.get("doc");
  const deepLinkHandled = useRef(false);

  const [docs, setDocs] = useState<DocItem[]>([]);
  const [search, setSearch] = useState("");
  const [sourceFilter, setSourceFilter] = useState<SourceFilter>("all");
  const [selectedDoc, setSelectedDoc] = useState<DocItem | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => {
    startTransition(async () => {
      setError(null);
      try {
        const rows = await listDocuments();
        setDocs(rows);
      } catch (e) {
        setError(humanizeAdvisorActionError(e, "Načtení dokumentů selhalo."));
      }
    });
  }, []);

  useEffect(() => { load(); }, [load]);

  useEffect(() => {
    if (docIdFromQuery && docs.length > 0 && !deepLinkHandled.current) {
      const target = docs.find((d) => d.id === docIdFromQuery);
      if (target) {
        setSelectedDoc(target);
        setDetailOpen(true);
        deepLinkHandled.current = true;
      }
    }
  }, [docIdFromQuery, docs]);

  const filtered = useMemo(() => {
    let list = docs;
    if (search.trim()) {
      const q = search.trim().toLowerCase();
      list = list.filter((d) =>
        d.name.toLowerCase().includes(q) ||
        d.contactName?.toLowerCase().includes(q) ||
        d.tags?.some((t) => t.toLowerCase().includes(q))
      );
    }
    if (sourceFilter === "pdf") {
      list = list.filter((d) => d.mimeType === "application/pdf");
    } else if (sourceFilter === "image") {
      list = list.filter((d) => d.mimeType?.startsWith("image/"));
    } else if (sourceFilter === "scan") {
      list = list.filter((d) => d.isScanLike);
    }
    return list;
  }, [docs, search, sourceFilter]);

  const pdfCount = docs.filter((d) => d.mimeType === "application/pdf").length;
  const imgCount = docs.filter((d) => d.mimeType?.startsWith("image/")).length;
  const scanCount = docs.filter((d) => d.isScanLike).length;

  async function handleUpload(file: File, source: string) {
    const form = new FormData();
    form.append("file", file);
    form.append("uploadSource", source);
    startTransition(async () => {
      setError(null);
      try {
        const res = await fetch("/api/documents/upload", { method: "POST", body: form });
        const json = await res.json();
        if (!res.ok) throw new Error(json?.error || "Nahrání dokumentu selhalo.");
        setUploadOpen(false);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Nahrání dokumentu selhalo.");
      }
    });
  }

  async function handleToggleVisibility() {
    if (!selectedDoc) return;
    startTransition(async () => {
      try {
        await updateDocumentVisibleToClient(selectedDoc.id, !selectedDoc.visibleToClient);
        load();
        setSelectedDoc((prev) => prev ? { ...prev, visibleToClient: !prev.visibleToClient } : null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Změna viditelnosti selhala.");
      }
    });
  }

  async function handleDelete() {
    if (!selectedDoc) return;
    startTransition(async () => {
      try {
        await deleteDocument(selectedDoc.id);
        setDetailOpen(false);
        setSelectedDoc(null);
        load();
      } catch (e) {
        setError(e instanceof Error ? e.message : "Smazání dokumentu selhalo.");
      }
    });
  }

  function handleSaveDocumentMetadata(name: string, tags: string[]) {
    return new Promise<void>((resolve, reject) => {
      startTransition(async () => {
        try {
          const id = selectedDoc?.id;
          if (!id) throw new Error("Žádný dokument");
          await updateDocument(id, { name, tags });
          const rows = await listDocuments();
          setDocs(rows);
          setSelectedDoc((prev) => {
            if (!prev || prev.id !== id) return prev;
            return rows.find((d) => d.id === id) ?? prev;
          });
          resolve();
        } catch (e) {
          reject(e);
        }
      });
    });
  }

  const isTablet = deviceClass === "tablet" || deviceClass === "desktop";

  return (
    <>
      {error ? <ErrorState title={error} onRetry={load} /> : null}

      {/* Header */}
      <div className="px-4 py-3 bg-[color:var(--wp-surface-card)] border-b border-[color:var(--wp-surface-card-border)] space-y-2">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <FolderOpen size={18} className="text-indigo-600" />
            <h2 className="text-base font-black text-[color:var(--wp-text)]">Dokumenty</h2>
            <span className="text-[11px] font-black text-[color:var(--wp-text-secondary)] bg-[color:var(--wp-surface-muted)] border border-[color:var(--wp-surface-card-border)] px-1.5 py-0.5 rounded-lg">
              {docs.length}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={load}
              disabled={pending}
              className="w-9 h-9 rounded-xl border border-[color:var(--wp-surface-card-border)] flex items-center justify-center"
            >
              <RefreshCw size={14} className={cx("text-[color:var(--wp-text-secondary)]", pending && "animate-spin")} />
            </button>
          </div>
        </div>
        <FilterChips
          value={sourceFilter}
          onChange={(v) => setSourceFilter(v as SourceFilter)}
          options={[
            { id: "all", label: "Vše", badge: docs.length },
            { id: "pdf", label: "PDF", badge: pdfCount },
            { id: "image", label: "Obrázky", badge: imgCount },
            { id: "scan", label: "Skeny", badge: scanCount },
          ]}
        />
        <SearchBar value={search} onChange={setSearch} placeholder="Hledat dokument nebo klienta…" />
      </div>

      {pending && docs.length === 0 ? <LoadingSkeleton rows={4} /> : null}

      {!pending && filtered.length === 0 ? (
        <div className="px-4 pt-8">
          <EmptyState
            title="Žádné dokumenty"
            description="Nahrajte první dokument přes tlačítko + v dolní liště (rychlé akce)."
          />
        </div>
      ) : null}

      {/* Content */}
      {isTablet ? (
        <div className="grid grid-cols-2 gap-0 h-[calc(100vh-13rem)]">
          <div className="border-r border-[color:var(--wp-surface-card-border)] overflow-y-auto px-4 py-3 space-y-2">
            {filtered.map((doc) => (
              <DocumentCard
                key={doc.id}
                doc={doc}
                active={selectedDoc?.id === doc.id}
                onClick={() => { setSelectedDoc(doc); setDetailOpen(true); }}
              />
            ))}
          </div>
          <div className="overflow-y-auto px-4 py-3">
            {selectedDoc ? (
              <DocumentDetailPanel
                doc={selectedDoc}
                pending={pending}
                onToggleVisibility={handleToggleVisibility}
                onDelete={handleDelete}
                onSaveMetadata={handleSaveDocumentMetadata}
              />
            ) : (
              <div className="h-full flex items-center justify-center">
                <EmptyState title="Vyberte dokument" description="Klikněte na dokument vlevo." />
              </div>
            )}
          </div>
        </div>
      ) : (
        <div className="px-4 py-3 space-y-2 pb-20">
          {filtered.map((doc) => (
            <DocumentCard
              key={doc.id}
              doc={doc}
              onClick={() => { setSelectedDoc(doc); setDetailOpen(true); }}
            />
          ))}
        </div>
      )}

      {!hideScreenFab ? (
        <FloatingActionButton onClick={() => setUploadOpen(true)} label="Nahrát dokument" />
      ) : null}

      {/* Upload sheet */}
      <UploadSheet
        open={uploadOpen}
        onClose={() => setUploadOpen(false)}
        onUpload={handleUpload}
        busy={pending}
        showMultiPageScan={supportsMultiPageScan}
      />

      {/* Phone detail sheet */}
      {!isTablet && selectedDoc ? (
        <BottomSheet
          open={detailOpen}
          onClose={() => { setDetailOpen(false); setSelectedDoc(null); }}
          title={selectedDoc.name}
        >
          <DocumentDetailPanel
            doc={selectedDoc}
            pending={pending}
            onToggleVisibility={handleToggleVisibility}
            onDelete={handleDelete}
            onSaveMetadata={handleSaveDocumentMetadata}
          />
        </BottomSheet>
      ) : null}
    </>
  );
}
