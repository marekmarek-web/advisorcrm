"use client";

import { useCallback, useMemo, useState } from "react";
import { useDocumentCapture } from "@/lib/upload/useDocumentCapture";

export type ScanCaptureResult = {
  ok: boolean;
  error?: string;
};

export function useScanCapture() {
  const { captureFromCamera, isAvailable } = useDocumentCapture();
  const [pages, setPages] = useState<File[]>([]);
  const [isCapturing, setIsCapturing] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setPages((prev) => [...prev, result.file as File]);
      setError(null);
      return { ok: true };
    } finally {
      setIsCapturing(false);
    }
  }, [captureFromCamera, isCapturing]);

  const retakePage = useCallback(
    async (index: number): Promise<ScanCaptureResult> => {
      if (index < 0 || index >= pages.length) {
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
        setPages((prev) => prev.map((page, pageIndex) => (pageIndex === index ? (result.file as File) : page)));
        setError(null);
        return { ok: true };
      } finally {
        setIsCapturing(false);
      }
    },
    [captureFromCamera, isCapturing, pages.length]
  );

  const removePage = useCallback((index: number) => {
    setPages((prev) => prev.filter((_, pageIndex) => pageIndex !== index));
  }, []);

  const clearPages = useCallback(() => {
    setPages([]);
    setError(null);
  }, []);

  const canAddMore = useMemo(() => pages.length < 10, [pages.length]);

  return {
    pages,
    isAvailable,
    isCapturing,
    error,
    canAddMore,
    setError,
    capturePage,
    retakePage,
    removePage,
    clearPages,
  };
}
