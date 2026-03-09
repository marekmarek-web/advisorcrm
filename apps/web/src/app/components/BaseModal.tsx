"use client";

import { useEffect, useRef, useCallback, useState } from "react";

export interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Optional class for the inner panel (neuromorphic card). */
  panelClassName?: string;
  /** Max width of panel. Default max-w-lg. */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
}

const maxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

export function BaseModal({
  open,
  onClose,
  title,
  children,
  panelClassName = "",
  maxWidth = "lg",
}: BaseModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    previousActive.current = document.activeElement as HTMLElement | null;
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActive.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const focusables = ref.current.querySelectorAll<HTMLElement>(
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
    );
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    first?.focus();

    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      if (e.shiftKey) {
        if (document.activeElement === first) {
          e.preventDefault();
          last?.focus();
        }
      } else {
        if (document.activeElement === last) {
          e.preventDefault();
          first?.focus();
        }
      }
    }
    ref.current.addEventListener("keydown", trap);
    return () => ref.current?.removeEventListener("keydown", trap);
  }, [open]);

  const [backdropTarget, setBackdropTarget] = useState<EventTarget | null>(null);
  const handleBackdropMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) setBackdropTarget(e.target);
  }, []);
  const handleBackdropMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (e.target === e.currentTarget && e.currentTarget === backdropTarget) onClose();
      setBackdropTarget(null);
    },
    [onClose, backdropTarget],
  );

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/40"
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "base-modal-title" : undefined}
    >
      <div
        ref={ref}
        className={`wp-modal-panel rounded-xl border border-slate-200 bg-white shadow-xl w-full overflow-hidden flex flex-col max-h-[90vh] ${maxWidthClass[maxWidth]} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex items-center justify-between px-4 py-3 border-b border-slate-200 shrink-0">
            <h2 id="base-modal-title" className="font-semibold text-slate-800 text-sm">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="p-1.5 text-slate-400 hover:text-slate-600 rounded-lg hover:bg-slate-100"
              aria-label="Zavřít"
            >
              ×
            </button>
          </div>
        )}
        <div className="overflow-auto flex-1">{children}</div>
      </div>
    </div>
  );
}
