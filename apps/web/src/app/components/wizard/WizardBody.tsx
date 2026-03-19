"use client";

import { useEffect, useRef } from "react";
import { WIZARD_SLIDE_CSS } from "./wizard-styles";

export function WizardBody({
  children,
  withSlide = true,
}: {
  children: React.ReactNode;
  withSlide?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
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
  }, [children]);

  return (
    <div ref={containerRef} className="p-8 relative z-10 flex-1 overflow-y-auto min-h-0">
      <style>{WIZARD_SLIDE_CSS}</style>
      {withSlide ? (
        <div className="wizard-slide-enter">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
