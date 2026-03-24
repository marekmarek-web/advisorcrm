"use client";

import { useState } from "react";

type ProcessingStatusBadgeProps = {
  documentId: string;
  processingStatus: string | null;
  processingStage: string | null;
  aiInputSource: string | null;
  isScanLike: boolean | null;
  compact?: boolean;
};

const STATUS_CONFIG: Record<string, { label: string; className: string }> = {
  none: { label: "Nezpracováno", className: "bg-slate-100 text-slate-600" },
  queued: { label: "Ve frontě", className: "bg-amber-100 text-amber-700" },
  processing: { label: "Zpracovávám", className: "bg-blue-100 text-blue-700 animate-pulse" },
  completed: { label: "Zpracováno", className: "bg-emerald-100 text-emerald-700" },
  failed: { label: "Selhalo", className: "bg-red-100 text-red-700" },
  skipped: { label: "Přeskočeno", className: "bg-slate-100 text-slate-500" },
};

const STAGE_LABELS: Record<string, string> = {
  none: "",
  ocr: "OCR",
  markdown: "Markdown",
  extract: "Extrakce",
  completed: "Hotovo",
};

const AI_SOURCE_LABELS: Record<string, string> = {
  markdown: "Markdown",
  extract: "Strukturovaná data",
  ocr_text: "OCR text",
  native_text: "Textový PDF",
  none: "Bez zpracování",
};

export function ProcessingStatusBadge({
  documentId,
  processingStatus,
  processingStage,
  aiInputSource,
  isScanLike,
  compact = false,
}: ProcessingStatusBadgeProps) {
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const status = processingStatus ?? "none";
  const config = STATUS_CONFIG[status] ?? STATUS_CONFIG.none;
  const stageLabel = STAGE_LABELS[processingStage ?? "none"] ?? "";
  const aiLabel = AI_SOURCE_LABELS[aiInputSource ?? "none"] ?? "";

  async function triggerProcessing() {
    setIsProcessing(true);
    setError(null);
    try {
      const response = await fetch(`/api/documents/${documentId}/process`, { method: "POST" });
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: "Zpracování selhalo" }));
        setError(data.error ?? "Zpracování selhalo");
      }
    } catch {
      setError("Síťová chyba");
    } finally {
      setIsProcessing(false);
    }
  }

  if (compact) {
    return (
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
        {config.label}
        {status === "processing" && stageLabel ? ` · ${stageLabel}` : ""}
      </span>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ${config.className}`}>
        {config.label}
        {status === "processing" && stageLabel ? ` · ${stageLabel}` : ""}
      </span>

      {status === "completed" && aiLabel ? (
        <span className="text-xs text-slate-500">AI vstup: {aiLabel}</span>
      ) : null}

      {isScanLike ? (
        <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-xs font-medium text-indigo-600">Sken</span>
      ) : null}

      {(status === "none" || status === "failed" || status === "skipped") ? (
        <button
          type="button"
          onClick={() => void triggerProcessing()}
          disabled={isProcessing}
          className="min-h-[36px] rounded-lg border border-slate-300 px-3 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
        >
          {isProcessing ? "Zpracovávám…" : status === "failed" ? "Znovu zpracovat" : "Zpracovat dokument"}
        </button>
      ) : null}

      {error ? <span className="text-xs text-red-600">{error}</span> : null}
    </div>
  );
}
