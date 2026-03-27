"use client";

import type { TabType } from "@/lib/calculators/mortgage";
import type { ProductType } from "@/lib/calculators/mortgage";

export interface MortgageTabSwitcherProps {
  product: ProductType;
  type: TabType;
  onTypeChange: (type: TabType) => void;
}

export function MortgageTabSwitcher({
  product,
  type,
  onTypeChange,
}: MortgageTabSwitcherProps) {
  return (
    <div className="flex flex-wrap items-center gap-2">
      <button
        type="button"
        onClick={() => onTypeChange("new")}
        className={`min-h-[40px] min-w-[44px] px-4 sm:px-5 py-2 rounded-full border-[1.5px] font-medium text-xs sm:text-sm transition-all touch-manipulation ${
          type === "new"
            ? "bg-[#0d1f4e] border-[#0d1f4e] text-white"
            : "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
        }`}
      >
        {product === "loan" ? "Nový úvěr" : "Nová hypotéka"}
      </button>
      <button
        type="button"
        onClick={() => onTypeChange("refi")}
        className={`min-h-[40px] min-w-[44px] px-4 sm:px-5 py-2 rounded-full border-[1.5px] font-medium text-xs sm:text-sm transition-all touch-manipulation ${
          type === "refi"
            ? "bg-[#0d1f4e] border-[#0d1f4e] text-white"
            : "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:border-indigo-500 hover:bg-indigo-500/10 hover:text-indigo-700 dark:hover:bg-indigo-950/40 dark:hover:text-indigo-300"
        }`}
      >
        Refinancování
      </button>
    </div>
  );
}
