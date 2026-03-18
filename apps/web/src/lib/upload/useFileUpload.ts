"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { validateFile } from "./validation";

export type UploadSource = "web" | "mobile_camera" | "mobile_gallery" | "mobile_file" | "mobile_share" | "mobile_scan";
export type UploadState = "idle" | "selected" | "uploading" | "done" | "error";

export type UploadMetadata = {
  contactId?: string;
  opportunityId?: string;
  contractId?: string;
  name?: string;
  tags?: string[];
  visibleToClient?: boolean;
  uploadSource?: UploadSource;
};

export type UploadResponse = {
  id: string;
  name: string;
  mimeType: string | null;
  sizeBytes: number | null;
};

type UseFileUploadOptions = {
  allowedMimeTypes?: readonly string[];
  maxSizeBytes?: number;
};

type RetryPayload = {
  file: File;
  metadata: UploadMetadata;
};

function parseErrorText(payload: unknown): string {
  if (payload && typeof payload === "object" && "error" in payload) {
    const value = (payload as { error?: unknown }).error;
    if (typeof value === "string" && value.trim()) return value;
  }
  return "Nahrání dokumentu selhalo.";
}

function isImage(file: File | null): boolean {
  return !!file && file.type.startsWith("image/");
}

export function useFileUpload(options: UseFileUploadOptions = {}) {
  const [state, setState] = useState<UploadState>("idle");
  const [file, setFile] = useState<File | null>(null);
  const [previewUrl, setPreviewUrl] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState(0);
  const [result, setResult] = useState<UploadResponse | null>(null);
  const lastAttemptRef = useRef<RetryPayload | null>(null);
  const xhrRef = useRef<XMLHttpRequest | null>(null);

  const cleanupPreview = useCallback(() => {
    setPreviewUrl((prev) => {
      if (prev) URL.revokeObjectURL(prev);
      return null;
    });
  }, []);

  const selectFile = useCallback(
    (nextFile: File | null): boolean => {
      if (!nextFile) {
        setFile(null);
        setState("idle");
        setError(null);
        setProgress(0);
        setResult(null);
        cleanupPreview();
        return false;
      }

      const validation = validateFile(nextFile, {
        allowedMimeTypes: options.allowedMimeTypes,
        maxSizeBytes: options.maxSizeBytes,
      });

      if (!validation.valid) {
        setFile(null);
        setState("error");
        setError(validation.error ?? "Soubor je neplatný.");
        setProgress(0);
        setResult(null);
        cleanupPreview();
        return false;
      }

      setFile(nextFile);
      setState("selected");
      setError(null);
      setProgress(0);
      setResult(null);
      cleanupPreview();
      if (isImage(nextFile)) {
        setPreviewUrl(URL.createObjectURL(nextFile));
      }
      return true;
    },
    [cleanupPreview, options.allowedMimeTypes, options.maxSizeBytes]
  );

  const uploadWithFile = useCallback(
    async (uploadFile: File, metadata: UploadMetadata): Promise<UploadResponse> => {
      if (!uploadFile) {
        const message = "Nejprve vyberte soubor.";
        setState("error");
        setError(message);
        throw new Error(message);
      }

      const formData = new FormData();
      formData.set("file", uploadFile);
      if (metadata.contactId) formData.set("contactId", metadata.contactId);
      if (metadata.opportunityId) formData.set("opportunityId", metadata.opportunityId);
      if (metadata.contractId) formData.set("contractId", metadata.contractId);
      if (metadata.name?.trim()) formData.set("name", metadata.name.trim());
      if (metadata.tags?.length) formData.set("tags", metadata.tags.join(","));
      if (metadata.visibleToClient != null) formData.set("visibleToClient", String(metadata.visibleToClient));
      formData.set("uploadSource", metadata.uploadSource ?? "web");

      setState("uploading");
      setError(null);
      setProgress(0);
      setResult(null);
      lastAttemptRef.current = { file: uploadFile, metadata };

      try {
        const response = await new Promise<UploadResponse>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhrRef.current = xhr;
          xhr.open("POST", "/api/documents/upload");
          xhr.responseType = "json";

          xhr.upload.onprogress = (event) => {
            if (!event.lengthComputable) return;
            const nextProgress = Math.round((event.loaded / event.total) * 100);
            setProgress(Math.min(100, Math.max(0, nextProgress)));
          };

          xhr.onerror = () => {
            reject(new Error("Síťová chyba při nahrávání dokumentu."));
          };

          xhr.onabort = () => {
            reject(new Error("Nahrávání bylo zrušeno."));
          };

          xhr.onload = () => {
            const payload = xhr.response;
            if (xhr.status >= 200 && xhr.status < 300 && payload?.id) {
              resolve(payload as UploadResponse);
              return;
            }
            reject(new Error(parseErrorText(payload)));
          };

          xhr.send(formData);
        });

        setState("done");
        setProgress(100);
        setResult(response);
        return response;
      } catch (err) {
        const message = err instanceof Error ? err.message : "Nahrání dokumentu selhalo.";
        setState("error");
        setError(message);
        throw new Error(message);
      } finally {
        xhrRef.current = null;
      }
    },
    []
  );

  const upload = useCallback(
    async (metadata: UploadMetadata): Promise<UploadResponse> => {
      if (!file) {
        const message = "Nejprve vyberte soubor.";
        setState("error");
        setError(message);
        throw new Error(message);
      }
      return uploadWithFile(file, metadata);
    },
    [file, uploadWithFile]
  );

  const uploadFile = useCallback(
    async (nextFile: File, metadata: UploadMetadata): Promise<UploadResponse> => {
      return uploadWithFile(nextFile, metadata);
    },
    [uploadWithFile]
  );

  const retry = useCallback(async (): Promise<UploadResponse> => {
    const lastAttempt = lastAttemptRef.current;
    if (!lastAttempt) {
      throw new Error("Není co opakovat.");
    }
    setFile(lastAttempt.file);
    return uploadWithFile(lastAttempt.file, lastAttempt.metadata);
  }, [uploadWithFile]);

  const cancelUpload = useCallback(() => {
    xhrRef.current?.abort();
    xhrRef.current = null;
  }, []);

  const reset = useCallback(() => {
    cancelUpload();
    setState("idle");
    setFile(null);
    setError(null);
    setProgress(0);
    setResult(null);
    cleanupPreview();
  }, [cancelUpload, cleanupPreview]);

  useEffect(() => {
    return () => {
      xhrRef.current?.abort();
      cleanupPreview();
    };
  }, [cleanupPreview]);

  const isImagePreview = useMemo(() => isImage(file), [file]);

  return {
    state,
    file,
    previewUrl,
    isImagePreview,
    progress,
    error,
    result,
    selectFile,
    upload,
    uploadFile,
    retry,
    cancelUpload,
    reset,
  };
}
