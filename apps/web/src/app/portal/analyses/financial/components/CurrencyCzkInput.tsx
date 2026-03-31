"use client";

import { useCallback, useEffect, useState } from "react";
import { formatCurrency } from "@/lib/analyses/financial/formatters";
import { COMPANY_RISK_MONTHLY_PREMIUM_MAX_CZK } from "@/lib/analyses/financial/constants";

export { COMPANY_RISK_MONTHLY_PREMIUM_MAX_CZK as CURRENCY_CZK_MONTHLY_PREMIUM_MAX };

/** Textové pole s českým formátem tisíců (hodnota v Kč jako číslo). */
export function CurrencyCzkInput({
  value,
  onChange,
  placeholder,
  unitLabel,
  id,
  className = "",
  /** Pokud je nastaveno, hodnota se po zadání ořízne na 0…clampMax (např. měsíční pojistné). */
  clampMax,
}: {
  value: number | undefined;
  onChange: (v: number | undefined) => void;
  placeholder?: string;
  unitLabel: string;
  id?: string;
  className?: string;
  clampMax?: number;
}) {
  const [focused, setFocused] = useState(false);
  const [text, setText] = useState("");

  useEffect(() => {
    if (!focused) {
      setText(value != null && !Number.isNaN(value) ? formatCurrency(value) : "");
    }
  }, [value, focused]);

  const commit = useCallback(() => {
    const raw = text.replace(/\s/g, "").replace(",", ".").trim();
    if (raw === "") {
      onChange(undefined);
      setText("");
      return;
    }
    let n = Math.round(Number(raw));
    if (!Number.isFinite(n) || Number.isNaN(n)) {
      setText(value != null ? formatCurrency(value) : "");
      return;
    }
    if (n < 0) n = 0;
    if (clampMax != null && n > clampMax) n = clampMax;
    onChange(n);
    setText(formatCurrency(n));
  }, [text, value, onChange, clampMax]);

  return (
    <div className={`relative w-full ${className}`}>
      <input
        id={id}
        type="text"
        inputMode="decimal"
        autoComplete="off"
        spellCheck={false}
        placeholder={placeholder}
        value={focused ? text : value != null && !Number.isNaN(value) ? formatCurrency(value) : ""}
        onFocus={() => {
          setFocused(true);
          setText(value != null && !Number.isNaN(value) ? String(value) : "");
        }}
        onChange={(e) => setText(e.target.value)}
        onBlur={() => {
          setFocused(false);
          commit();
        }}
        className="relative z-10 w-full min-h-[52px] rounded-xl border-2 border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] px-4 py-3 pr-[7.25rem] text-base font-semibold tabular-nums tracking-tight text-[color:var(--wp-text)] shadow-sm placeholder:font-normal placeholder:text-[color:var(--wp-text-tertiary)] caret-indigo-600 selection:bg-indigo-200/50 selection:text-[color:var(--wp-text)] focus:border-indigo-500 focus:outline-none focus:ring-2 focus:ring-indigo-500/25 dark:caret-indigo-400 dark:selection:bg-indigo-500/30"
        style={{
          color: "var(--wp-text)",
          WebkitTextFillColor: "var(--wp-text)",
        }}
      />
      <span className="pointer-events-none absolute right-3 top-1/2 z-0 max-w-[6.25rem] -translate-y-1/2 text-right text-[11px] font-bold leading-tight text-[color:var(--wp-text-secondary)] sm:text-xs">
        {unitLabel}
      </span>
    </div>
  );
}
