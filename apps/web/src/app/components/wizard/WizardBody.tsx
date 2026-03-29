"use client";

import { useEffect, useRef } from "react";
import { WIZARD_SLIDE_CSS } from "./wizard-styles";

export function WizardBody({
  children,
  withSlide = true,
  /**
   * When this value changes (e.g. wizard `step`), move focus to the first focusable field.
   * Do NOT tie focus to `children` — every keystroke creates new element references and would
   * steal focus back to the first input (see Nový klient wizard).
   */
  focusFirstFieldKey,
}: {
  children: React.ReactNode;
  withSlide?: boolean;
  focusFirstFieldKey?: string | number;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (focusFirstFieldKey === undefined) return;
    if (!containerRef.current) return;
    const timer = requestAnimationFrame(() => {
      const el = containerRef.current;
      if (!el || !el.isConnected) return;
      const firstInput = el.querySelector<HTMLElement>(
        'input:not([type="hidden"]):not([disabled]), select:not([disabled]), textarea:not([disabled])'
      );
      firstInput?.focus();
    });
    return () => cancelAnimationFrame(timer);
  }, [focusFirstFieldKey]);

  return (
    <div ref={containerRef} className="p-8 sm:p-10 relative z-10 flex-1 overflow-y-auto min-h-0">
      <style>{WIZARD_SLIDE_CSS}</style>
      {withSlide ? (
        <div className="wizard-slide-enter">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
