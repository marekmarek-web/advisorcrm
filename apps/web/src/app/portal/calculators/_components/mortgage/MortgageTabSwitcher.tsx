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
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onTypeChange("new")}
        className={`min-h-[44px] min-w-[44px] px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all touch-manipulation ${
          type === "new"
            ? "bg-indigo-600 text-white shadow-md"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        {product === "loan" ? "Nový úvěr" : "Nová hypotéka"}
      </button>
      <button
        type="button"
        onClick={() => onTypeChange("refi")}
        className={`min-h-[44px] min-w-[44px] px-4 sm:px-5 py-2.5 rounded-xl font-bold text-sm uppercase tracking-wider transition-all touch-manipulation ${
          type === "refi"
            ? "bg-indigo-600 text-white shadow-md"
            : "bg-slate-100 text-slate-600 hover:bg-slate-200"
        }`}
      >
        Refinancování
      </button>
    </div>
  );
}
