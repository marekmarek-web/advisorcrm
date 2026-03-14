"use client";

import { useEffect, useRef, useCallback, useState } from "react";
import { MD_BREAKPOINT_PX } from "@/app/lib/breakpoints";

export interface WizardShellProps {
  open: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
}

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

export function WizardShell({
  open,
  onClose,
  title,
  children,
}: WizardShellProps) {
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
    const firstInContent =
      focusables.find((node) => node !== closeBtn) ?? focusables[0];
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
      if (
        !isMobile &&
        e.target === e.currentTarget &&
        e.currentTarget === backdropTarget
      )
        onClose();
      setBackdropTarget(null);
    },
    [onClose, backdropTarget, isMobile],
  );

  if (!open) return null;

  const backdropClass =
    "fixed inset-0 z-modal flex items-center justify-center p-4 bg-black/40";
  const mobileBackdropClass =
    "fixed inset-0 z-modal flex flex-col p-0 bg-white";

  const panelBase =
    "w-full max-w-[640px] bg-white rounded-[24px] shadow-2xl shadow-indigo-900/5 border border-slate-100 flex flex-col overflow-hidden relative max-h-[90vh]";
  const panelMobile = "rounded-none min-h-full max-h-full border-0 shadow-none";

  return (
    <div
      className={isMobile ? mobileBackdropClass : backdropClass}
      onMouseDown={handleBackdropMouseDown}
      onMouseUp={handleBackdropMouseUp}
      role="dialog"
      aria-modal="true"
      aria-labelledby="wizard-title"
    >
      {isMobile && (
        <div
          className="flex-1 min-h-0 overflow-hidden flex items-center justify-center p-4"
          role="presentation"
        >
          <div
            ref={ref}
            className={`${panelBase} ${isMobile ? panelMobile : ""} w-full`}
            onClick={(e) => e.stopPropagation()}
          >
            {/* Glow blob */}
            <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 opacity-50 rounded-full blur-3xl pointer-events-none" />
            {children}
          </div>
        </div>
      )}
      {!isMobile && (
        <div
          ref={ref}
          className={`${panelBase}`}
          onClick={(e) => e.stopPropagation()}
        >
          <div className="absolute top-0 right-0 w-64 h-64 bg-indigo-50 opacity-50 rounded-full blur-3xl pointer-events-none" />
          {children}
        </div>
      )}
    </div>
  );
}
