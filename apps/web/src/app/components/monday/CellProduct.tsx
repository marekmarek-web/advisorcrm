"use client";

import { useState, useRef, useEffect } from "react";
import { ProductPicker } from "@/app/components/weplan/ProductPicker";
import type { ProductPickerValue } from "@/app/components/weplan/ProductPicker";

interface CellProductProps {
  value: string;
  onChange?: (value: string) => void;
}

export function CellProduct({ value, onChange }: CellProductProps) {
  const [open, setOpen] = useState(false);
  const [pickerValue, setPickerValue] = useState<ProductPickerValue>({ partnerId: "", productId: "" });
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const h = (e: MouseEvent) => ref.current && !ref.current.contains(e.target as Node) && setOpen(false);
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  function handleApply() {
    const label = [pickerValue.partnerName, pickerValue.productName].filter(Boolean).join(" – ") || "";
    onChange?.(label);
    setOpen(false);
  }

  return (
    <div ref={ref} className="relative min-h-[28px] flex items-center">
      <button
        type="button"
        onClick={() => onChange && setOpen((o) => !o)}
        className="w-full min-h-[24px] flex items-center px-1.5 text-[13px] text-monday-text cursor-pointer text-left rounded-[var(--monday-radius)] hover:bg-monday-row-hover border border-transparent hover:border-monday-border"
      >
        {value || <span className="text-monday-text-muted">— vybrat produkt</span>}
      </button>
      {open && (
        <div
          className="wp-dropdown absolute left-0 top-full mt-1 p-3 min-w-[220px] z-[100]"
          role="dialog"
          aria-label="Výběr produktu"
        >
          <ProductPicker value={pickerValue} onChange={setPickerValue} />
          <div className="flex gap-2 mt-3 pt-2 border-t border-monday-border">
            <button
              type="button"
              onClick={handleApply}
              className="flex-1 px-2 py-1.5 text-[12px] font-medium text-white bg-monday-blue rounded-[var(--monday-radius)] hover:opacity-90"
            >
              Použít
            </button>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="px-2 py-1.5 text-[12px] font-medium text-monday-text-muted hover:bg-monday-row-hover rounded-[var(--monday-radius)]"
            >
              Zrušit
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
