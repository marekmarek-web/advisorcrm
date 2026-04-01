"use client";

import { useCallback, useEffect, useId, useState } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { ProcessingStatusBadge } from "./ProcessingStatusBadge";
import type { DocumentRow } from "@/app/actions/documents";

type DocumentPdfPreviewDialogProps = {
  doc: DocumentRow | null;
  visibleToClient: boolean;
  onClose: () => void;
  onToggleVisible: (value: boolean) => void;
  downloadHref: string;
};

/**
 * Plnobodový náhled PDF: desktop = modal uprostřed, mobil = téměř celá obrazovka.
 */
export function DocumentPdfPreviewDialog({
  doc,
  visibleToClient,
  onClose,
  onToggleVisible,
  downloadHref,
}: DocumentPdfPreviewDialogProps) {
  const titleId = useId();
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    if (!doc) {
      setExpanded(false);
      return;
    }
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = prev;
    };
  }, [doc]);

  const onKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        e.preventDefault();
        onClose();
      }
    },
    [onClose],
  );

  useEffect(() => {
    if (!doc) return;
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [doc, onKeyDown]);

  if (!doc || doc.mimeType !== "application/pdf") {
    return null;
  }

  const iframeHeightClass = expanded
    ? "min-h-[calc(100dvh-7rem)] h-[calc(100dvh-7rem)]"
    : "min-h-[min(70vh,720px)] h-[min(70vh,720px)]";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-end md:items-center justify-center p-0 md:p-6"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <button
        type="button"
        className="absolute inset-0 bg-black/50 backdrop-blur-[2px]"
        aria-label="Zavřít náhled"
        onClick={onClose}
      />
      <div
        className={[
          "relative z-[101] flex w-full flex-col overflow-hidden border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] shadow-2xl",
          "rounded-none md:rounded-[var(--wp-radius-lg)]",
          expanded ? "md:max-w-[min(100vw-2rem,1600px)] md:max-h-[calc(100dvh-1.5rem)] h-[100dvh] md:h-[calc(100dvh-1.5rem)]" : "md:max-w-[min(100vw-2rem,1200px)] max-h-[100dvh] md:max-h-[calc(100dvh-1.5rem)] h-[92dvh] md:h-auto",
        ].join(" ")}
      >
        <header className="flex shrink-0 flex-col gap-3 border-b border-[color:var(--wp-border)] bg-[color:var(--wp-surface-muted)] px-4 py-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
          <div className="min-w-0 flex-1">
            <h2 id={titleId} className="truncate text-base font-semibold text-[color:var(--wp-text)]">
              {doc.name}
            </h2>
            <div className="mt-1 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-[color:var(--wp-text-muted)]">
              <span>{new Date(doc.createdAt).toLocaleString("cs-CZ")}</span>
              {doc.sizeBytes != null && doc.sizeBytes > 0 && (
                <span>{formatBytes(doc.sizeBytes)}</span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <ProcessingStatusBadge
                documentId={doc.id}
                processingStatus={doc.processingStatus}
                processingStage={doc.processingStage}
                aiInputSource={doc.aiInputSource}
                isScanLike={doc.isScanLike}
                compact
              />
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-2 sm:justify-end">
            <label className="flex min-h-[44px] cursor-pointer items-center gap-2 rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-3 py-2 text-xs font-medium text-[color:var(--wp-text-muted)]">
              <input
                type="checkbox"
                checked={visibleToClient}
                onChange={(e) => onToggleVisible(e.target.checked)}
                className="rounded border-[color:var(--wp-border-strong)]"
              />
              Viditelné klientovi
            </label>
            <a
              href={downloadHref}
              className="inline-flex min-h-[44px] items-center justify-center rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] px-3 py-2 text-xs font-semibold text-[var(--wp-accent)] hover:bg-[color:var(--wp-surface-inset)]"
            >
              Stáhnout
            </a>
            <button
              type="button"
              onClick={() => setExpanded((v) => !v)}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] text-[color:var(--wp-text-muted)] hover:bg-[color:var(--wp-surface-inset)]"
              title={expanded ? "Menší náhled" : "Větší náhled"}
              aria-pressed={expanded}
            >
              {expanded ? <Minimize2 size={18} /> : <Maximize2 size={18} />}
            </button>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex min-h-[44px] min-w-[44px] items-center justify-center rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] text-[color:var(--wp-text)] hover:bg-red-50 hover:text-red-700"
              aria-label="Zavřít"
            >
              <X size={20} />
            </button>
          </div>
        </header>
        <div className="min-h-0 flex-1 overflow-auto bg-[color:var(--wp-surface-inset)] p-2 sm:p-4">
          <iframe
            src={downloadHref}
            className={`w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-white shadow-inner ${iframeHeightClass}`}
            title={`Náhled – ${doc.name}`}
          />
        </div>
      </div>
    </div>
  );
}

function formatBytes(n: number): string {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${(n / (1024 * 1024)).toFixed(1)} MB`;
}
