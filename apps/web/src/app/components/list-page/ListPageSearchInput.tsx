"use client";

import { Search, X } from "lucide-react";

/**
 * Search input matching Contacts style: icon left, pl-9, bg-slate-50, rounded-[var(--wp-radius-sm)].
 */
export function ListPageSearchInput({
  placeholder = "Hledat…",
  value,
  onChange,
  className = "",
  "aria-label": ariaLabel,
}: {
  placeholder?: string;
  value: string;
  onChange: (value: string) => void;
  className?: string;
  "aria-label"?: string;
}) {
  const hasValue = value.trim().length > 0;
  return (
    <div className={`relative flex-1 md:w-72 min-w-0 ${className}`}>
      <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-[color:var(--wp-text-tertiary)]" />
      <input
        type="search"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={`w-full rounded-[var(--wp-radius-sm)] border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] py-2 pl-9 text-sm font-medium text-[color:var(--wp-input-text)] outline-none transition-all focus:border-[color:var(--wp-header-input-focus-border)] focus:ring-2 focus:ring-[color:var(--wp-header-input-focus-ring)] ${hasValue ? "pr-10" : "pr-4"}`}
        aria-label={ariaLabel ?? placeholder}
      />
      {hasValue ? (
        <button
          type="button"
          onClick={() => onChange("")}
          className="absolute right-2 top-1/2 -translate-y-1/2 rounded-[var(--wp-radius-xs)] p-1 text-[color:var(--wp-text-tertiary)] hover:bg-[color:var(--wp-surface-muted)] hover:text-[color:var(--wp-text-secondary)]"
          aria-label="Vymazat hledaný výraz"
        >
          <X size={16} strokeWidth={2.25} />
        </button>
      ) : null}
    </div>
  );
}
