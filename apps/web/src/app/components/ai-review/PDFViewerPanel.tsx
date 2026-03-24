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
  const highlights = buildHighlights(doc);
  const pageHighlights = highlights.filter((h) => h.page === activePage);
  const hasPdf = !!doc.pdfUrl;

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
      className={`flex flex-col bg-[#e2e8f0] ${
        isFullscreen
          ? "fixed inset-0 z-50"
          : "relative"
      }`}
    >
      {/* Toolbar */}
      <div className="h-14 md:h-16 px-4 md:px-6 border-b border-slate-300 bg-slate-100 flex items-center justify-between flex-shrink-0 shadow-sm z-10">
        <div className="flex items-center gap-2 min-w-0">
          <FileText size={16} className="text-slate-500 shrink-0" />
          <span className="text-xs font-bold text-slate-700 truncate">
            {doc.fileName}
          </span>
        </div>

        <div className="flex items-center gap-2">
          {/* Page navigation */}
          <div className="flex items-center gap-1 bg-white px-2 py-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={() => onPageChange(Math.max(1, activePage - 1))}
              disabled={activePage <= 1}
              className="p-1 text-slate-500 hover:bg-slate-100 rounded-lg hover:text-slate-900 transition-colors disabled:opacity-30"
            >
              <ChevronLeft size={14} />
            </button>
            <span className="text-[10px] font-black w-14 text-center text-slate-600">
              {activePage} / {doc.pageCount}
            </span>
            <button
              onClick={() => onPageChange(Math.min(doc.pageCount, activePage + 1))}
              disabled={activePage >= doc.pageCount}
              className="p-1 text-slate-500 hover:bg-slate-100 rounded-lg hover:text-slate-900 transition-colors disabled:opacity-30"
            >
              <ChevronRight size={14} />
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 bg-white p-1 rounded-xl border border-slate-200 shadow-sm">
            <button
              onClick={zoomOut}
              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg hover:text-slate-900 transition-colors"
            >
              <ZoomOut size={16} />
            </button>
            <span className="text-[10px] font-black w-10 text-center text-slate-600">
              {zoomLevel}%
            </span>
            <button
              onClick={zoomIn}
              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg hover:text-slate-900 transition-colors"
            >
              <ZoomIn size={16} />
            </button>
            <div className="w-px h-4 bg-slate-200 mx-0.5" />
            <button
              onClick={onFullscreenToggle}
              className="p-1.5 text-slate-500 hover:bg-slate-100 rounded-lg hover:text-slate-900 transition-colors"
            >
              {isFullscreen ? <Minimize size={16} /> : <Maximize size={16} />}
            </button>
          </div>
        </div>
      </div>

      {/* Viewer area */}
      <div className="flex-1 overflow-auto custom-scroll p-4 md:p-8 flex justify-center">
        {loadState === "loading" && (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-500 py-20">
            <Loader2 size={32} className="animate-spin text-indigo-400" />
            <p className="text-sm font-medium">Načítám dokument…</p>
          </div>
        )}

        {loadState === "error" && (
          <div className="flex flex-col items-center justify-center gap-3 text-slate-500 py-20">
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
            className="w-full max-w-[700px] bg-white shadow-2xl rounded-sm relative"
            style={{
              transform: `scale(${zoomLevel / 100})`,
              transformOrigin: "top center",
            }}
          >
            {hasPdf ? (
              <iframe
                src={doc.pdfUrl}
                className="w-full min-h-[1000px]"
                title="PDF náhled"
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
  return (
    <div className="min-h-[900px] p-8 md:p-12 relative font-serif text-slate-700">
      {/* Contract header */}
      <div className="border-b-2 border-slate-800 pb-6 mb-8 flex justify-between items-end">
        <div className="w-32 h-10 bg-emerald-600 text-white font-black text-xl flex items-center justify-center font-sans rounded">
          KOOP
        </div>
        <div className="text-right">
          <h2 className="text-2xl font-bold text-slate-900 font-sans">
            Pojistná smlouva
          </h2>
          <p className="text-sm text-slate-500 font-sans">Číslo: 6543219870</p>
        </div>
      </div>

      <div className="space-y-8 text-sm leading-relaxed">
        {/* Pojistník section */}
        <HighlightBlock
          fieldId="pojistnik"
          isActive={activeFieldId === "pojistnik"}
          status="success"
          onClick={onHighlightClick}
        >
          <strong>Pojistník:</strong>{" "}
          <HighlightValue fieldId="pojistnik" active={activeFieldId} onClick={onHighlightClick} status="success">
            Jan Novák
          </HighlightValue>
          , nar.{" "}
          <HighlightValue fieldId="rc" active={activeFieldId} onClick={onHighlightClick} status="success">
            850415/1234
          </HighlightValue>
          , trvale bytem{" "}
          <HighlightValue fieldId="adresa" active={activeFieldId} onClick={onHighlightClick} status="success">
            Sluneční 145, Praha 4
          </HighlightValue>
          .
        </HighlightBlock>

        <p>
          Smluvní strany uzavírají tuto pojistnou smlouvu pro produkt FLEXI
          Životní pojištění. Počátek pojištění je stanoven na{" "}
          <HighlightValue fieldId="pocatek" active={activeFieldId} onClick={onHighlightClick} status="success">
            01. 05. 2026
          </HighlightValue>
          .
        </p>

        <h4 className="font-bold text-slate-900 text-lg mt-8 mb-4 font-sans">
          Rozsah pojištění
        </h4>
        <table className="w-full border-collapse border border-slate-300 text-sm font-sans">
          <tbody>
            <tr>
              <td className="border border-slate-300 p-3">
                Základní pojištění pro případ smrti
              </td>
              <td className="border border-slate-300 p-3 text-right bg-indigo-50/30">
                <HighlightValue fieldId="smrt" active={activeFieldId} onClick={onHighlightClick} status="success">
                  2 500 000 Kč
                </HighlightValue>
              </td>
            </tr>
            <tr>
              <td className="border border-slate-300 p-3">
                Trvalé následky úrazu
              </td>
              <td className="border border-slate-300 p-3 text-right">
                <HighlightValue fieldId="trvale" active={activeFieldId} onClick={onHighlightClick} status="success">
                  1 000 000 Kč
                </HighlightValue>
              </td>
            </tr>
          </tbody>
        </table>

        <div className="mt-10 pt-10 border-t border-slate-200 space-y-6">
          <p className="flex items-center gap-2 font-sans">
            <strong>Měsíční pojistné:</strong>
            <HighlightValue fieldId="platba" active={activeFieldId} onClick={onHighlightClick} status="warning">
              1 450 Kč
            </HighlightValue>
          </p>
          <p className="flex items-center gap-2 font-sans">
            <strong>Obmyšlená osoba:</strong>
            <HighlightValue fieldId="obmyslena" active={activeFieldId} onClick={onHighlightClick} status="error">
              Dle zákona (Není uvedena)
            </HighlightValue>
          </p>
        </div>
      </div>
    </div>
  );
}

function HighlightBlock({
  fieldId,
  isActive,
  status,
  onClick,
  children,
}: {
  fieldId: string;
  isActive: boolean;
  status: FieldStatus;
  onClick: (fieldId: string) => void;
  children: React.ReactNode;
}) {
  return (
    <div
      onClick={() => onClick(fieldId)}
      className={`p-2 -mx-2 rounded-lg border cursor-pointer transition-all ${highlightBorder(
        status,
        isActive
      )}`}
    >
      {children}
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
