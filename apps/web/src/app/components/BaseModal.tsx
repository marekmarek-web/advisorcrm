"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { MD_BREAKPOINT_PX } from "@/app/lib/breakpoints";

export type BaseModalMobileVariant = "modal" | "sheet" | "fullScreen";

export interface BaseModalProps {
  open: boolean;
  onClose: () => void;
  title?: string;
  children: React.ReactNode;
  /** Optional class for the inner panel (neuromorphic card). */
  panelClassName?: string;
  /** Max width of panel. Default max-w-lg. Ignorováno při `fullScreen`. */
  maxWidth?: "sm" | "md" | "lg" | "xl" | "2xl";
  /**
   * On viewports below md (768px): "modal" = same centered box; "sheet" = bottom sheet; "fullScreen" = full-screen panel.
   * Default "fullScreen" for better mobile UX.
   */
  mobileVariant?: BaseModalMobileVariant;
  /**
   * Když `true`, modal je fullscreen napříč všemi breakpointy (edge-to-edge panel).
   * Nahrazuje ad-hoc `fixed inset-0 z-[100]` overlaye (např. tasks fullscreen editor).
   */
  fullScreen?: boolean;
}

const maxWidthClass = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
  "2xl": "max-w-2xl",
};

function useIsMobile() {
  const [isMobile, setIsMobile] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${MD_BREAKPOINT_PX - 1}px)`);
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener("change", update);
    return () => mq.removeEventListener("change", update);
  }, []);
  return isMobile;
}

export function BaseModal({
  open,
  onClose,
  title,
  children,
  panelClassName = "",
  maxWidth = "lg",
  mobileVariant = "fullScreen",
  fullScreen = false,
}: BaseModalProps) {
  const ref = useRef<HTMLDivElement>(null);
  const previousActive = useRef<HTMLElement | null>(null);
  const isMobile = useIsMobile();

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (!open) return;
    const active = document.activeElement as HTMLElement | null;
    previousActive.current = active;
    if (active && ref.current && !ref.current.contains(active)) active.blur();
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousActive.current?.focus?.();
    };
  }, [open, handleKeyDown]);

  useEffect(() => {
    if (!open || !ref.current) return;
    const el = ref.current;
    const focusables = Array.from(
      el.querySelectorAll<HTMLElement>(
        'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
      ),
    );
    const closeBtn = el.querySelector<HTMLElement>('[aria-label="Zavřít"]');
    const firstInContent = focusables.find((node) => node !== closeBtn) ?? focusables[0];
    const first = focusables[0];
    const last = focusables[focusables.length - 1];
    if (!el.contains(document.activeElement)) {
      requestAnimationFrame(() => {
        if (!el.isConnected) return;
        firstInContent?.focus();
      });
    }

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
    el.addEventListener("keydown", trap);
    return () => el.removeEventListener("keydown", trap);
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

  const useMobileLayout = isMobile && mobileVariant !== "modal";
  const isMobileFullScreen = useMobileLayout && mobileVariant === "fullScreen";
  const isSheet = useMobileLayout && mobileVariant === "sheet";
  const edgeToEdge = fullScreen || isMobileFullScreen;

  const backdropClass =
    "fixed inset-0 z-modal flex items-center justify-center bg-[color:var(--wp-overlay-scrim)] p-4";
  const fullScreenBackdropClass =
    "fixed inset-0 z-modal flex flex-col bg-[color:var(--wp-surface-card)] p-0";
  const mobileBackdropClass = isMobileFullScreen
    ? fullScreenBackdropClass
    : isSheet
      ? "fixed inset-0 z-modal flex items-end justify-center bg-[color:var(--wp-overlay-scrim)] p-0"
      : backdropClass;

  const backdropFinal = fullScreen
    ? fullScreenBackdropClass
    : useMobileLayout
      ? mobileBackdropClass
      : backdropClass;

  const panelBase =
    "wp-modal-panel flex w-full flex-col overflow-hidden border border-[color:var(--wp-modal-border)] bg-[color:var(--wp-modal-surface)] shadow-xl dark:shadow-black/40";
  const panelDesktop = `rounded-xl max-h-[90vh] ${maxWidthClass[maxWidth]}`;
  const panelFullScreen = "rounded-none min-h-full max-h-full";
  const panelMobile =
    isMobileFullScreen
      ? panelFullScreen
      : isSheet
        ? "rounded-t-2xl max-h-[90vh] border-b-0"
        : panelDesktop;

  const panelFinal = fullScreen
    ? panelFullScreen
    : useMobileLayout
      ? panelMobile
      : panelDesktop;
  void edgeToEdge;

  return (
    <div
      className={backdropFinal}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      role="dialog"
      aria-modal="true"
      aria-labelledby={title ? "base-modal-title" : undefined}
    >
      {isSheet && (
        <div
          className="flex-1 min-h-0 overflow-hidden cursor-default"
          role="presentation"
          onClick={() => onClose()}
          aria-hidden
        />
      )}
      <div
        ref={ref}
        className={`${panelBase} ${panelFinal} ${panelClassName}`}
        onClick={(e) => e.stopPropagation()}
      >
        {title && (
          <div className="flex min-h-[44px] shrink-0 items-center justify-between border-b border-[color:var(--wp-surface-card-border)] px-4 py-3">
            <h2 id="base-modal-title" className="text-sm font-semibold text-[color:var(--wp-text)]">
              {title}
            </h2>
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-[44px] min-w-[44px] items-center justify-center rounded-lg p-2 text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text)]"
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
