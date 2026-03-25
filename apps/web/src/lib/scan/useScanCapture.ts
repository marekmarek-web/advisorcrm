"use client";

import { useCallback, useMemo, useState } from "react";
import { useDocumentCapture } from "@/lib/upload/useDocumentCapture";
import { pickMultipleImagesFromGallery } from "@/lib/upload/webImagePick";
import { buildPdfFromImages } from "./pdfBuilder";
import { checkScanQuality, type ScanQualityResult, type ScanQualityIssue } from "./quality-checks";

export type ScanCaptureResult = {
  ok: boolean;
  error?: string;
  qualityResult?: ScanQualityResult;
};

export type ScanPage = {
  id: string;
  file: File;
  quality?: ScanQualityResult;
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
  const [qualityWarnings, setQualityWarnings] = useState<ScanQualityIssue[]>([]);

  const pages = useMemo(() => scanPages.map((p) => p.file), [scanPages]);
  const pageIds = useMemo(() => scanPages.map((p) => p.id), [scanPages]);

  const capturePage = useCallback(async (): Promise<ScanCaptureResult> => {
    if (isCapturing) return { ok: false, error: "Fotoaparát se právě otevírá." };
    setIsCapturing(true);
    setQualityWarnings([]);
    try {
      const result = await captureFromCamera();
      if (!result.file) {
        const message = result.error ?? "Pořízení fotografie selhalo.";
        setError(message);
        return { ok: false, error: message };
      }

      const quality = await checkScanQuality(result.file);
      if (quality.issues.length > 0) {
        setQualityWarnings(quality.issues);
      }

      setScanPages((prev) => [...prev, { id: nextPageId(), file: result.file as File, quality }]);
      setError(null);
      return { ok: true, qualityResult: quality };
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
      setQualityWarnings([]);
      try {
        const result = await captureFromCamera();
        if (!result.file) {
          const message = result.error ?? "Přefocení stránky selhalo.";
          setError(message);
          return { ok: false, error: message };
        }

        const quality = await checkScanQuality(result.file);
        if (quality.issues.length > 0) {
          setQualityWarnings(quality.issues);
        }

        setScanPages((prev) =>
          prev.map((page, pageIndex) =>
            pageIndex === index ? { ...page, file: result.file as File, quality } : page
          )
        );
        setError(null);
        return { ok: true, qualityResult: quality };
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

  /** Pick several images at once (file input); works in mobile browsers and Capacitor WebView. */
  const addPagesFromGalleryBatch = useCallback(async (): Promise<ScanCaptureResult> => {
    if (isCapturing) return { ok: false, error: "Probíhá výběr souborů." };
    const remaining = 20 - scanPages.length;
    if (remaining <= 0) return { ok: false, error: "Limit 20 stran." };

    setIsCapturing(true);
    setQualityWarnings([]);
    try {
      const files = await pickMultipleImagesFromGallery(remaining);
      if (files.length === 0) {
        const message = "Výběr byl zrušen.";
        setError(message);
        return { ok: false, error: message };
      }

      const newPages: ScanPage[] = [];
      let lastQuality: ScanQualityResult | undefined;
      for (const file of files) {
        const quality = await checkScanQuality(file);
        lastQuality = quality;
        newPages.push({ id: nextPageId(), file, quality });
      }
      if (lastQuality && lastQuality.issues.length > 0) {
        setQualityWarnings(lastQuality.issues);
      }

      setScanPages((prev) => [...prev, ...newPages]);
      setError(null);
      return { ok: true, qualityResult: lastQuality };
    } finally {
      setIsCapturing(false);
    }
  }, [isCapturing, scanPages.length]);

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

  const hasQualityIssues = useMemo(
    () => scanPages.some((p) => p.quality && !p.quality.ok),
    [scanPages]
  );

  return {
    pages,
    scanPages,
    pageIds,
    isAvailable,
    isCapturing,
    isBuildingPdf,
    error,
    canAddMore,
    qualityWarnings,
    hasQualityIssues,
    setError,
    capturePage,
    addPagesFromGalleryBatch,
    retakePage,
    removePage,
    reorderPages,
    clearPages,
    buildPdf,
  };
}
