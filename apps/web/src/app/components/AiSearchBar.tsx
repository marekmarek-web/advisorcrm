"use client";

import { useState, useCallback, useRef } from "react";
import "./AiSearchBar.css";

const MAX_FILE_SIZE_MB = 10;
const SCOPE = "weai-search-bar";

interface AiSearchBarProps {
  placeholder?: string;
  value?: string;
  onChange?: (value: string) => void;
  onSubmit?: (value: string) => void;
  onFileSelect?: (file: File) => void;
  onClose?: () => void;
  className?: string;
  variant?: "bar" | "trigger";
  triggerLabel?: string;
  onTriggerClick?: () => void;
}

export function AiSearchBar({
  placeholder = "Ask WeAI",
  value: controlledValue,
  onChange,
  onSubmit,
  onFileSelect,
  onClose,
  className = "",
  variant = "bar",
  triggerLabel = "AI asistent",
  onTriggerClick,
}: AiSearchBarProps) {
  const [internalValue, setInternalValue] = useState("");
  const [fileError, setFileError] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const value = controlledValue ?? internalValue;

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const v = e.target.value;
      setInternalValue(v);
      onChange?.(v);
    },
    [onChange],
  );

  const handleSubmit = useCallback(() => {
    if (value.trim()) onSubmit?.(value.trim());
  }, [value, onSubmit]);

  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if (e.key === "Enter") handleSubmit();
    },
    [handleSubmit],
  );

  const handleFileChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setFileError(null);
      const file = e.target.files?.[0];
      if (!file) return;
      try {
        const maxBytes = MAX_FILE_SIZE_MB * 1024 * 1024;
        if (file.size > maxBytes) {
          setFileError(`Max ${MAX_FILE_SIZE_MB} MB`);
          return;
        }
        onFileSelect?.(file);
      } catch {
        setFileError("Chyba");
      } finally {
        if (fileInputRef.current) fileInputRef.current.value = "";
      }
    },
    [onFileSelect],
  );

  const triggerFileInput = useCallback(() => {
    fileInputRef.current?.click();
  }, []);

  return (
    <>
      {variant === "trigger" ? (
        <button
          type="button"
          className={`${SCOPE} trigger ${className}`.trim()}
          onClick={onTriggerClick}
          aria-label={triggerLabel}
        >
          <div className="inner">
            <span>{triggerLabel}</span>
          </div>
          <div className="border" aria-hidden />
        </button>
      ) : (
        <div className={`${SCOPE} ${className}`.trim()}>
          <input
            ref={fileInputRef}
            type="file"
            className="sr-only"
            aria-hidden
            onChange={handleFileChange}
            tabIndex={-1}
          />
          <div className="inner">
            <button
              type="button"
              className="file-btn"
              onClick={triggerFileInput}
              title="Nahrát soubor"
              aria-label="Nahrát soubor"
            >
              📎
            </button>
            <div className="input-wrap">
              <input
                type="text"
                value={value}
                onChange={handleChange}
                onKeyDown={handleKeyDown}
                placeholder={placeholder}
              />
            </div>
            {fileError && <span className="file-err">{fileError}</span>}
          </div>
          <div className="border" />
        </div>
      )}
    </>
  );
}
