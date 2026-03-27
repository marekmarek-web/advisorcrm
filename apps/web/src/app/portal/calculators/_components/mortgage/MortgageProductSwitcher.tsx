"use client";

import type { ProductType } from "@/lib/calculators/mortgage";

export interface MortgageProductSwitcherProps {
  product: ProductType;
  onProductChange: (product: ProductType) => void;
}

export function MortgageProductSwitcher({
  product,
  onProductChange,
}: MortgageProductSwitcherProps) {
  return (
    <div className="grid grid-cols-2 gap-2">
      <button
        type="button"
        onClick={() => onProductChange("mortgage")}
        className={`min-h-[44px] min-w-[44px] px-5 sm:px-6 py-2.5 rounded-[10px] border-[1.5px] font-semibold text-xs sm:text-sm transition-all touch-manipulation ${
          product === "mortgage"
            ? "bg-[#0d1f4e] border-[#0d1f4e] text-white shadow-sm"
            : "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
        }`}
      >
        Hypotéka
      </button>
      <button
        type="button"
        onClick={() => onProductChange("loan")}
        className={`min-h-[44px] min-w-[44px] px-5 sm:px-6 py-2.5 rounded-[10px] border-[1.5px] font-semibold text-xs sm:text-sm transition-all touch-manipulation ${
          product === "loan"
            ? "bg-[#0d1f4e] border-[#0d1f4e] text-white shadow-sm"
            : "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-muted)] text-[color:var(--wp-text-secondary)] hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
        }`}
      >
        Úvěry
      </button>
    </div>
  );
}
