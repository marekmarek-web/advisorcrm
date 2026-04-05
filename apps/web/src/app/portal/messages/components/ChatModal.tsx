"use client";

import { useEffect } from "react";
import { X } from "lucide-react";

export function ChatModal({
  open,
  title,
  onClose,
  children,
  footer,
}: {
  open: boolean;
  title: string;
  onClose: () => void;
  children: React.ReactNode;
  footer?: React.ReactNode;
}) {
  useEffect(() => {
    if (!open) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKey);
    return () => document.removeEventListener("keydown", handleKey);
  }, [open, onClose]);

  if (!open) return null;
  return (
    <div
      className="fixed inset-0 z-[400] flex items-center justify-center bg-slate-900/35 p-4 backdrop-blur-[3px]"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="chat-modal-title"
        className="flex max-h-[min(90vh,720px)] w-full max-w-lg flex-col overflow-hidden rounded-2xl border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-xl"
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-[color:var(--wp-surface-card-border)] px-5 py-4">
          <h2 id="chat-modal-title" className="text-sm font-semibold text-[color:var(--wp-text)]">
            {title}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-xl text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)]"
            aria-label="Zavřít"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
        <div className="min-h-0 flex-1 overflow-y-auto px-5 py-4 text-sm text-[color:var(--wp-text-secondary)] leading-relaxed">
          {children}
        </div>
        {footer ? (
          <div className="shrink-0 border-t border-[color:var(--wp-surface-card-border)] px-5 py-3">{footer}</div>
        ) : null}
      </div>
    </div>
  );
}
