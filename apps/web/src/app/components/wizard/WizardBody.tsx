"use client";

import { WIZARD_SLIDE_CSS } from "./wizard-styles";

export function WizardBody({
  children,
  withSlide = true,
}: {
  children: React.ReactNode;
  withSlide?: boolean;
}) {
  return (
    <div className="p-8 relative z-10 flex-1 overflow-y-auto min-h-0">
      <style>{WIZARD_SLIDE_CSS}</style>
      {withSlide ? (
        <div className="wizard-slide-enter">{children}</div>
      ) : (
        children
      )}
    </div>
  );
}
