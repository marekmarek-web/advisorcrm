"use client";

import { useEffect, useMemo, useRef } from "react";
import Image from "next/image";
import { FileText, Paperclip, Send } from "lucide-react";
import clsx from "clsx";
import { portalPrimaryButtonClassName } from "@/lib/ui/create-action-button-styles";

function formatFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} kB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

const CHIPS = ["Požádat o dokumenty", "Potvrdit termín schůzky", "Navrhnout další krok"] as const;

export function MessageComposer({
  body,
  onBodyChange,
  onKeyDown,
  onSend,
  files,
  onRemoveFile,
  fileInputRef,
  onAttachClick,
  onFilesPicked,
  sendError,
  onDismissError,
  onRetrySend,
  isPending,
  canSend,
}: {
  body: string;
  onBodyChange: (v: string) => void;
  onKeyDown: (e: React.KeyboardEvent) => void;
  onSend: () => void;
  files: File[];
  onRemoveFile: (index: number) => void;
  fileInputRef: React.RefObject<HTMLInputElement | null>;
  onAttachClick: () => void;
  onFilesPicked: (files: File[]) => void;
  sendError: string | null;
  onDismissError: () => void;
  onRetrySend: () => void;
  isPending: boolean;
  canSend: boolean;
}) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const imagePreviewUrls = useMemo(() => {
    return files.map((f) => (f.type.startsWith("image/") ? URL.createObjectURL(f) : null));
  }, [files]);

  useEffect(() => {
    return () => {
      imagePreviewUrls.forEach((u) => {
        if (u) URL.revokeObjectURL(u);
      });
    };
  }, [imagePreviewUrls]);

  // Auto-grow textarea up to 200 px
  useEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [body]);

  function appendChip(text: string) {
    onBodyChange(body.trim() ? `${body.trim()}\n\n${text}` : text);
  }

  return (
    <div className="shrink-0 border-t border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-4 md:px-6">
      <div className="mx-auto max-w-3xl">
        {sendError ? (
          <div className="mb-3 flex flex-col gap-2 rounded-2xl border border-rose-200 bg-rose-50 px-3 py-2.5 sm:flex-row sm:items-center sm:justify-between dark:border-rose-900/40 dark:bg-rose-950/30">
            <p className="text-sm font-semibold text-rose-800 dark:text-rose-200">{sendError}</p>
            <div className="flex gap-2">
              <button type="button" onClick={onDismissError} className="text-sm font-medium text-rose-700 underline">
                Zavřít
              </button>
              <button
                type="button"
                onClick={onRetrySend}
                disabled={isPending}
                className="rounded-lg bg-rose-600 px-3 py-1.5 text-sm font-bold text-white disabled:opacity-50"
              >
                Zkusit znovu
              </button>
            </div>
          </div>
        ) : null}

        {files.length > 0 ? (
          <div className="mb-2 flex flex-wrap gap-2">
            {files.map((f, i) => {
              const preview = imagePreviewUrls[i];
              return (
                <div
                  key={`${f.name}-${i}-${f.size}`}
                  className="flex max-w-[200px] flex-col gap-1 rounded-xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] p-2 text-xs text-[color:var(--wp-text-secondary)]"
                >
                  {preview ? (
                    <div className="relative h-20 w-full overflow-hidden rounded-lg">
                      <Image src={preview} alt="" fill unoptimized className="object-cover" sizes="200px" />
                    </div>
                  ) : (
                    <div className="flex h-14 items-center justify-center rounded-lg bg-[color:var(--wp-surface-card)]">
                      <FileText className="h-6 w-6 text-[color:var(--wp-text-tertiary)]" />
                    </div>
                  )}
                  <div className="flex items-start justify-between gap-1">
                    <span className="min-w-0 truncate font-medium text-[color:var(--wp-text)]" title={f.name}>
                      {f.name}
                    </span>
                    <button
                      type="button"
                      onClick={() => onRemoveFile(i)}
                      className="shrink-0 text-[color:var(--wp-text-tertiary)] hover:text-[color:var(--wp-text)]"
                      aria-label="Odstranit přílohu"
                    >
                      ×
                    </button>
                  </div>
                  <span className="text-[color:var(--wp-text-tertiary)]">{formatFileSize(f.size)}</span>
                </div>
              );
            })}
          </div>
        ) : null}

        <div className="rounded-[var(--wp-radius-card)] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-2 shadow-sm">
          <div className="flex items-end gap-2">
            <input
              type="file"
              ref={fileInputRef}
              className="sr-only"
              multiple
              accept=".pdf,.doc,.docx,image/*"
              onChange={(e) => {
                const added = Array.from(e.target.files ?? []);
                if (added.length) onFilesPicked(added);
                e.target.value = "";
              }}
            />
            <button
              type="button"
              onClick={onAttachClick}
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-muted)]/80"
              aria-label="Přidat přílohu"
            >
              <Paperclip className="h-5 w-5" />
            </button>

            <textarea
              ref={textareaRef}
              value={body}
              onChange={(e) => onBodyChange(e.target.value)}
              onKeyDown={onKeyDown}
              placeholder="Napište zprávu… (Enter odešle, Shift+Enter nový řádek)"
              rows={1}
              className="min-h-[52px] max-h-[200px] flex-1 resize-none overflow-y-auto rounded-2xl border-0 bg-[color:var(--wp-surface-muted)] px-4 py-3 text-sm leading-6 text-[color:var(--wp-text)] placeholder:text-[color:var(--wp-text-tertiary)] outline-none focus:ring-0"
            />

            <button
              type="button"
              onClick={onSend}
              disabled={isPending || !canSend}
              className={clsx(
                portalPrimaryButtonClassName,
                "inline-flex h-12 shrink-0 items-center gap-2 rounded-2xl px-5 text-sm font-medium disabled:cursor-not-allowed disabled:opacity-50",
              )}
            >
              <Send className="h-4 w-4" />
              Odeslat
            </button>
          </div>

          <div className="mt-2 flex flex-wrap gap-2 px-1 pb-1 pt-2">
            {CHIPS.map((chip) => (
              <button
                key={chip}
                type="button"
                onClick={() => {
                  if (chip === "Požádat o dokumenty") {
                    appendChip("Mohli byste prosím doplnit potřebné dokumenty?");
                  } else if (chip === "Potvrdit termín schůzky") {
                    appendChip("Potvrzuji domluvený termín schůzky. Těším se na setkání.");
                  } else {
                    appendChip("Navrhuji následující krok:");
                  }
                }}
                className="rounded-full border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-muted)] px-3 py-1.5 text-xs font-medium text-[color:var(--wp-text-secondary)] hover:bg-[color:var(--wp-surface-card)]"
              >
                {chip}
              </button>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
