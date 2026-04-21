"use client";

import { useEffect, useRef, useState, useTransition } from "react";
import { UploadCloud } from "lucide-react";
import { useRouter } from "next/navigation";
import { clientUploadDocument } from "@/app/actions/documents";
import {
  ALLOWED_MIME_TYPES_CLIENT_PORTAL,
  MAX_FILE_SIZE_BYTES_CLIENT_PORTAL,
  MAX_FILE_SIZE_LABEL_CLIENT_PORTAL,
  validateFile,
} from "@/lib/upload/validation";

type ClientDocumentUploadProps = {
  onSuccess?: () => void;
};

export function ClientDocumentUpload({ onSuccess }: ClientDocumentUploadProps) {
  const [isDragging, setIsDragging] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [progress, setProgress] = useState(0);
  const progressTimerRef = useRef<number | null>(null);
  const router = useRouter();

  useEffect(() => {
    return () => {
      if (progressTimerRef.current) window.clearInterval(progressTimerRef.current);
    };
  }, []);

  function validate(file: File): string | null {
    const result = validateFile(file, {
      allowedMimeTypes: ALLOWED_MIME_TYPES_CLIENT_PORTAL,
      maxSizeBytes: MAX_FILE_SIZE_BYTES_CLIENT_PORTAL,
      maxSizeLabel: MAX_FILE_SIZE_LABEL_CLIENT_PORTAL,
    });
    return result.valid ? null : result.error ?? "Soubor je neplatný.";
  }

  function startProgressSimulation() {
    setProgress(5);
    progressTimerRef.current = window.setInterval(() => {
      setProgress((value) => Math.min(value + 12, 88));
    }, 150);
  }

  function finishProgressSimulation() {
    if (progressTimerRef.current) {
      window.clearInterval(progressTimerRef.current);
      progressTimerRef.current = null;
    }
    setProgress(100);
    window.setTimeout(() => setProgress(0), 600);
  }

  function handleUpload(file: File) {
    const validationError = validate(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setError(null);
    startProgressSimulation();
    startTransition(async () => {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("name", file.name);
      const result = await clientUploadDocument(formData).catch((uploadError) => {
        return {
          success: false as const,
          error:
            uploadError instanceof Error
              ? uploadError.message
              : "Nahrání dokumentu se nezdařilo.",
        };
      });

      if (!result || (result as { success?: boolean }).success === false) {
        setError((result as { error?: string }).error || "Nahrání dokumentu se nezdařilo.");
        finishProgressSimulation();
        return;
      }

      finishProgressSimulation();
      onSuccess?.();
      router.refresh();
    });
  }

  function onFileInputChange(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;
    handleUpload(file);
    event.target.value = "";
  }

  function onDrop(event: React.DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    const file = event.dataTransfer.files?.[0];
    if (!file) return;
    handleUpload(file);
  }

  return (
    <div className="space-y-3">
      <label
        onDragOver={(event) => {
          event.preventDefault();
          setIsDragging(true);
        }}
        onDragLeave={() => setIsDragging(false)}
        onDrop={onDrop}
        className={`border-2 border-dashed rounded-[24px] p-8 sm:p-10 flex flex-col items-center justify-center text-center cursor-pointer transition-all ${
          isDragging
            ? "border-indigo-400 bg-indigo-50 text-indigo-700"
            : "border-slate-200 bg-slate-50/60 text-slate-500 hover:border-indigo-300 hover:bg-indigo-50/40"
        }`}
      >
        <input
          type="file"
          className="hidden"
          onChange={onFileInputChange}
          accept=".pdf,.jpg,.jpeg,.png,.webp"
          disabled={isPending}
        />
        <UploadCloud size={34} className="mb-3" />
        <p className="text-sm font-bold">Přetáhněte soubor sem nebo klikněte pro výběr</p>
        <p className="text-xs mt-1">PDF, JPG, PNG, WEBP • max {MAX_FILE_SIZE_LABEL_CLIENT_PORTAL}</p>
      </label>

      {progress > 0 && (
        <div className="w-full h-2 rounded-full bg-slate-100 overflow-hidden">
          <div
            className="h-full bg-indigo-500 transition-all duration-150"
            style={{ width: `${progress}%` }}
          />
        </div>
      )}

      {error && (
        <p className="text-sm text-rose-600 bg-rose-50 border border-rose-200 rounded-xl px-3 py-2">
          {error}
        </p>
      )}
    </div>
  );
}
