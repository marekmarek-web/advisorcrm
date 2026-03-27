"use client";

import type { CalculatorPageShellProps } from "./types";

/**
 * Calculator page shell aligned with portal list pages (ListPageShell).
 * CRM mode: max-w-[1600px], consistent padding, space-y-6.
 */
export function CalculatorPageShell({
  children,
  maxWidth = "max-w-[1160px]",
  className = "",
}: CalculatorPageShellProps) {
  return (
    <div
      className={`${maxWidth} mx-auto space-y-4 rounded-[20px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-4 sm:p-6 ${className}`.trim()}
    >
      {children}
      <p className="text-center text-sm text-[color:var(--wp-text-secondary)] pt-2">
        Orientační výpočet. Nejedná se o finanční poradenství ani závaznou nabídku.
      </p>
    </div>
  );
}
