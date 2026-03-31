"use client";

export interface CalculatorMobileResultDockProps {
  children: React.ReactNode;
}

/**
 * Shared mobile floating dock used by calculator pages.
 */
export function CalculatorMobileResultDock({
  children,
}: CalculatorMobileResultDockProps) {
  return (
    <div className="lg:hidden fixed bottom-0 left-0 right-0 z-fixed-cta p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none">
      <div className="w-full max-w-[420px] mx-auto pointer-events-auto overflow-hidden rounded-[18px] border border-[color:var(--wp-surface-card-border)] shadow-2xl">
        {children}
      </div>
    </div>
  );
}
