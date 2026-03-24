"use client";

import { useCallback, useMemo, useState } from "react";
import { useDocumentCapture } from "@/lib/upload/useDocumentCapture";
import { buildPdfFromImages } from "./pdfBuilder";

export type ScanCaptureResult = {
  ok: boolean;
  error?: string;
};

export type ScanPage = {
  id: string;
  file: File;
};

let _pageIdCounter = 0;
function nextPageId(): string {
  return `scan-page-${Date.now()}-${++_pageIdCounter}`;
}

export function useScanCapture() {
  const { captureFromCamera, isAvailable } = useDocumentCapture();
  const [scanPages, setScanPages] = useState<ScanPage[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [isBuildingPdf, setIsBuildingPdf] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pages = useMemo(() => scanPages.map((p) => p.file), [scanPages]);
  const pageIds = useMemo(() => scanPages.map((p) => p.id), [scanPages]);

  const capturePage = useCallback(async (): Promise<ScanCaptureResult> => {
    if (isCapturing) return { ok: false, error: "Fotoaparát se právě otevírá." };
    setIsCapturing(true);
    try {
      const result = await captureFromCamera();
      if (!result.file) {
        const message = result.error ?? "Pořízení fotografie selhalo.";
        setError(message);
        return { ok: false, error: message };
      }
      setScanPages((prev) => [...prev, { id: nextPageId(), file: result.file as File }]);
      setError(null);
      return { ok: true };
    } finally {
      setIsCapturing(false);
    }
  }, [captureFromCamera, isCapturing]);

  const retakePage = useCallback(
    async (index: number): Promise<ScanCaptureResult> => {
      if (index < 0 || index >= scanPages.length) {
        return { ok: false, error: "Stránka pro přefocení nebyla nalezena." };
      }
      if (isCapturing) return { ok: false, error: "Fotoaparát se právě otevírá." };

      setIsCapturing(true);
      try {
        const result = await captureFromCamera();
        if (!result.file) {
          const message = result.error ?? "Přefocení stránky selhalo.";
          setError(message);
          return { ok: false, error: message };
        }
        setScanPages((prev) =>
          prev.map((page, pageIndex) =>
            pageIndex === index ? { ...page, file: result.file as File } : page
          )
        );
        setError(null);
        return { ok: true };
      } finally {
        setIsCapturing(false);
      }
    },
    [captureFromCamera, isCapturing, scanPages.length]
  );

  const removePage = useCallback((index: number) => {
    setScanPages((prev) => prev.filter((_, pageIndex) => pageIndex !== index));
  }, []);

  const reorderPages = useCallback((fromIndex: number, toIndex: number) => {
    setScanPages((prev) => {
      const next = [...prev];
      const [moved] = next.splice(fromIndex, 1);
      next.splice(toIndex, 0, moved);
      return next;
    });
  }, []);

  const clearPages = useCallback(() => {
    setScanPages([]);
    setError(null);
  }, []);

  const buildPdf = useCallback(
    async (documentName?: string): Promise<File | null> => {
      if (scanPages.length === 0) return null;
      setIsBuildingPdf(true);
      try {
        const pdf = await buildPdfFromImages(
          scanPages.map((p) => p.file),
          { documentName }
        );
        return pdf;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Vytvoření PDF selhalo.";
        setError(message);
        return null;
      } finally {
        setIsBuildingPdf(false);
      }
    },
    [scanPages]
  );

  const canAddMore = useMemo(() => scanPages.length < 20, [scanPages.length]);

  return {
    pages,
    scanPages,
    pageIds,
    isAvailable,
    isCapturing,
    isBuildingPdf,
    error,
    canAddMore,
    setError,
    capturePage,
    retakePage,
    removePage,
    reorderPages,
    clearPages,
    buildPdf,
  };
}
