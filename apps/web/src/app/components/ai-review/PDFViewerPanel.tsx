"use client";

import React, { useState, useCallback } from "react";
import {
  FileText,
  ZoomIn,
  ZoomOut,
  Maximize,
  Minimize,
  AlertCircle,
  Loader2,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import type { ExtractionDocument, FieldStatus } from "@/lib/ai-review/types";

type HighlightEntry = {
  fieldId: string;
  label: string;
  value: string;
  status: FieldStatus;
  page: number;
};

type Props = {
  doc: ExtractionDocument;
  activeFieldId: string | null;
  activePage: number;
  zoomLevel: number;
  isFullscreen: boolean;
  onZoomChange: (level: number) => void;
  onPageChange: (page: number) => void;
  onFullscreenToggle: () => void;
  onHighlightClick: (fieldId: string, page?: number) => void;
};

function buildHighlights(doc: ExtractionDocument): HighlightEntry[] {
  const entries: HighlightEntry[] = [];
  for (const group of doc.groups) {
    for (const field of group.fields) {
      if (field.page) {
        entries.push({
          fieldId: field.id,
          label: field.label,
          value: field.value,
          status: field.status,
          page: field.page,
        });
      }
    }
  }
  return entries;
}

function highlightBorder(status: FieldStatus, isActive: boolean) {
  if (isActive) return "border-indigo-400 bg-indigo-50 ring-2 ring-indigo-300";
  const map: Record<FieldStatus, string> = {
    success: "border-indigo-200/60 bg-indigo-50/30",
    warning: "border-amber-300 bg-amber-50/50",
    error: "border-rose-300 bg-rose-50/50",
  };
  return map[status];
}

export function PDFViewerPanel({
  doc,
  activeFieldId,
  activePage,
  zoomLevel,
  isFullscreen,
  onZoomChange,
  onPageChange,
  onFullscreenToggle,
  onHighlightClick,
}: Props) {
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("ready");
  const [iframeError, setIframeError] = useState(false);
  const highlights = buildHighlights(doc);
  const pageHighlights = highlights.filter((h) => h.page === activePage);
  const hasPdf = !!doc.pdfUrl && doc.pdfUrl.length > 0;

  const zoomIn = useCallback(
    () => onZoomChange(Math.min(zoomLevel + 25, 200)),
    [zoomLevel, onZoomChange]
  );
  const zoomOut = useCallback(
    () => onZoomChange(Math.max(zoomLevel - 25, 50)),
    [zoomLevel, onZoomChange]
  );

  return (
    <div
      className={`flex min-h-0 flex-col bg-[#e2e8f0] ${
        isFullscreen ? "fixed inset-0 z-50" : "relative h-full min-h-0"
      }`}
    >
      {/* Toolbar */}
      <div className="h-14 md:h-16 px-4 md:px-6 border-b border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)] flex items-center justify-between flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-[color:var(--wp-text-secondary)] shrink-0" />
          <span className="text-xs font-bold text-[color:var(--wp-text-secondary)] truncate">
            {doc.fileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Page navigation */}
          <div className="flex items-center gap-1 bg-[color:var(--wp-surface-card)] px-2 py-1 rounded-xl border border-[color:var(--wp-surface-card-border)] shadow-sm">
            <button
              onClick={() => onPageChange(Math.max(1, activePage - 1))}
              disabled={activePage <= 1}
              className="p-1 text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg hover:text-[color:var(--wp-text)] transition-colors disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] font-black w-14 text-center text-[color:var(--wp-text-secondary)]">
              {activePage} / {doc.pageCount}
            </span>
            <button
              onClick={() => onPageChange(Math.min(doc.pageCount, activePage + 1))}
              disabled={activePage >= doc.pageCount}
              className="p-1 text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg hover:text-[color:var(--wp-text)] transition-colors disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-[color:var(--wp-surface-card)] p-1 rounded-xl border border-[color:var(--wp-surface-card-border)] shadow-sm">
            <button
              onClick={zoomOut}
              className="p-1.5 text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg hover:text-[color:var(--wp-text)] transition-colors"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-[10px] font-black w-10 text-center text-[color:var(--wp-text-secondary)]">
              {zoomLevel}%
            </span>
            <button
              onClick={zoomIn}
              className="p-1.5 text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg hover:text-[color:var(--wp-text)] transition-colors"
            >
              <ZoomIn size={16} />
            </button>
            <div className="w-px h-4 bg-[color:var(--wp-surface-card-border)] mx-0.5" />
            <button
              onClick={onFullscreenToggle}
              className="p-1.5 text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)] rounded-lg hover:text-[color:var(--wp-text)] transition-colors"
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 overflow-auto custom-scroll p-4 md:p-8 flex justify-center">
        {loadState === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 text-[color:var(--wp-text-secondary)] py-20">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-sm font-medium">Načítám dokument…</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 text-[color:var(--wp-text-secondary)] py-20">
            <AlertCircle size={32} className="text-rose-400" />
            <p className="text-sm font-medium">Nepodařilo se načíst dokument</p>
            <button
              onClick={() => setLoadState("loading")}
              className="text-xs font-bold text-indigo-600 hover:text-indigo-800 transition-colors"
            >
              Zkusit znovu
            </button>
          </div>
        )}

        {loadState === "ready" && (
          <div
            className="w-full max-w-[700px] bg-[color:var(--wp-surface-card)] shadow-2xl rounded-sm relative"
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: "top center",
            }}
          >
            {hasPdf && !iframeError ? (
              <iframe
                src={doc.pdfUrl}
                className="w-full min-h-[1000px]"
                title="PDF náhled"
                onError={() => setIframeError(true)}
              />
            ) : (
              <SimulatedPDFPage
                highlights={pageHighlights}
                activeFieldId={activeFieldId}
                onHighlightClick={onHighlightClick}
              />
            )}
          </div>
        )}
      </div>
    </div>
  );
}

/* ─── Simulated PDF Page ────────────────────────────────────────── */

function SimulatedPDFPage({
  highlights,
  activeFieldId,
  onHighlightClick,
}: {
  highlights: HighlightEntry[];
  activeFieldId: string | null;
  onHighlightClick: (fieldId: string, page?: number) => void;
}) {
  if (highlights.length === 0) {
    return (
      <div className="min-h-[900px] p-8 md:p-12 flex flex-col items-center justify-center text-[color:var(--wp-text-tertiary)]">
        <FileText size={48} className="mb-4 opacity-30" />
        <p className="text-sm font-medium">PDF náhled nedostupný</p>
        <p className="text-xs mt-1">Extrahovaná data se zobrazují v levém panelu</p>
      </div>
    );
  }

  return (
    <div className="min-h-[900px] p-8 md:p-12 relative font-sans text-[color:var(--wp-text-secondary)]">
      <div className="border-b-2 border-[color:var(--wp-surface-card-border)] pb-6 mb-8">
        <h2 className="text-xl font-bold text-[color:var(--wp-text)]">Extrahovaná data z dokumentu</h2>
        <p className="text-xs text-[color:var(--wp-text-secondary)] mt-1">
          Klikněte na zvýrazněnou hodnotu pro zobrazení odpovídajícího pole
        </p>
      </div>

      <div className="space-y-4 text-sm">
        {highlights.map((h) => (
          <div
            key={h.fieldId}
            onClick={() => onHighlightClick(h.fieldId)}
            className={`p-3 rounded-lg border cursor-pointer transition-all ${highlightBorder(
              h.status,
              activeFieldId === h.fieldId
            )}`}
          >
            <span className="text-[10px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] block mb-1">
              {h.label}
            </span>
            <HighlightValue
              fieldId={h.fieldId}
              active={activeFieldId}
              onClick={onHighlightClick}
              status={h.status}
            >
              {h.value}
            </HighlightValue>
          </div>
        ))}
      </div>
    </div>
  );
}

function HighlightValue({
  fieldId,
  active,
  onClick,
  status,
  children,
}: {
  fieldId: string;
  active: string | null;
  onClick: (fieldId: string) => void;
  status: FieldStatus;
  children: React.ReactNode;
}) {
  const isActive = active === fieldId;
  const statusStyles: Record<FieldStatus, string> = {
    success: isActive
      ? "bg-indigo-300/60 border-indigo-400"
      : "bg-indigo-200/50",
    warning: isActive
      ? "bg-amber-200 border-amber-400"
      : "bg-amber-100 border-amber-300",
    error: isActive
      ? "bg-rose-200 border-rose-400"
      : "bg-rose-100 border-rose-300",
  };

  return (
    <span
      onClick={(e) => {
        e.stopPropagation();
        onClick(fieldId);
      }}
      className={`px-1 rounded font-sans font-semibold cursor-pointer transition-all ${statusStyles[status]} ${
        status !== "success" ? "border" : ""
      }`}
      title={`Kliknutím zobrazíte pole "${fieldId}"`}
    >
      {children}
    </span>
  );
}
