"use client";

import { useEffect, useId, useMemo, useRef, useState } from "react";
import { CheckCircle2, Search } from "lucide-react";

export type SearchComboboxItem = {
  id: string;
  label: string;
  meta?: string | null;
  /** Volitelné pole pro výpověď – adresa z registru pojišťoven. */
  insurerAddressLine?: string | null;
  insurerChannelHint?: string | null;
};

type Props = {
  label: string;
  placeholder?: string;
  /** Optional short hint (avoid technical / prototype copy). */
  helperText?: string | null;
  query: string;
  onQueryChange: (q: string) => void;
  items: SearchComboboxItem[];
  selectedId: string | null;
  onSelect: (item: SearchComboboxItem) => void;
  disabled?: boolean;
  /** Max items to show (default 4). */
  maxItems?: number;
  isLoading?: boolean;
  /** Vizuál 1:1 s prototypem výpovědního wizardu (slate/violet). */
  variant?: "portal" | "termination";
};

export function SearchCombobox({
  label,
  placeholder = "Začněte psát…",
  helperText,
  query,
  onQueryChange,
  items,
  selectedId,
  onSelect,
  disabled,
  maxItems = 4,
  isLoading,
  variant = "portal",
}: Props) {
  const listId = useId();
  const wrapperRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const [open, setOpen] = useState(false);
  const [highlight, setHighlight] = useState(0);

  const shown = useMemo(() => items.slice(0, maxItems), [items, maxItems]);

  useEffect(() => {
    function handlePointerDown(event: MouseEvent | TouchEvent) {
      if (!wrapperRef.current) return;
      const t = event.target as Node;
      if (!wrapperRef.current.contains(t)) setOpen(false);
    }
    document.addEventListener("mousedown", handlePointerDown);
    document.addEventListener("touchstart", handlePointerDown);
    return () => {
      document.removeEventListener("mousedown", handlePointerDown);
      document.removeEventListener("touchstart", handlePointerDown);
    };
  }, []);

  useEffect(() => {
    // Reset keyboard selection when výsledky nebo dotaz změní výpis
    // eslint-disable-next-line react-hooks/set-state-in-effect -- synchronizace s externím seznamem
    setHighlight(0);
  }, [shown.length, query]);

  const inputClass =
    variant === "termination"
      ? "h-12 min-h-[44px] w-full rounded-2xl border border-slate-200 bg-white pl-11 pr-4 text-sm text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-violet-300 focus:ring-4 focus:ring-violet-100 dark:border-[color:var(--wp-input-border)] dark:bg-[color:var(--wp-input-bg)] dark:text-[color:var(--wp-text)] dark:placeholder:text-[color:var(--wp-text-muted)] dark:focus:border-violet-400 dark:focus:ring-violet-500/18"
      : "h-12 w-full rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] pl-11 pr-4 text-sm text-[color:var(--wp-text)] outline-none transition placeholder:text-[color:var(--wp-text-muted)] focus:border-[var(--wp-accent)] focus:ring-2 focus:ring-[var(--wp-accent)]/20 min-h-[44px]";

  const labelClass =
    variant === "termination"
      ? "mb-2 ml-1 block text-[10px] font-black uppercase tracking-widest text-slate-400 dark:text-[color:var(--wp-text-tertiary)]"
      : "mb-2 block text-xs font-medium text-[color:var(--wp-text-muted)]";

  return (
    <div ref={wrapperRef} className="relative">
      <label className={labelClass}>{label}</label>
      <div className="relative">
        <Search
          className={
            variant === "termination"
              ? "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400 dark:text-[color:var(--wp-text-muted)]"
              : "pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-[color:var(--wp-text-muted)]"
          }
          aria-hidden
        />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-expanded={open && shown.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          disabled={disabled}
          value={query}
          onChange={(e) => {
            onQueryChange(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          onKeyDown={(e) => {
            if (!open || shown.length === 0) {
              if (e.key === "ArrowDown") {
                setOpen(true);
              }
              return;
            }
            if (e.key === "Escape") {
              e.preventDefault();
              setOpen(false);
              return;
            }
            if (e.key === "ArrowDown") {
              e.preventDefault();
              setHighlight((h) => Math.min(shown.length - 1, h + 1));
            } else if (e.key === "ArrowUp") {
              e.preventDefault();
              setHighlight((h) => Math.max(0, h - 1));
            } else if (e.key === "Enter") {
              e.preventDefault();
              const pick = shown[highlight];
              if (pick) {
                onSelect(pick);
                setOpen(false);
              }
            }
          }}
          placeholder={placeholder}
          className={inputClass}
        />
      </div>
      {helperText ? (
        <p
          className={
            variant === "termination"
              ? "mt-2 text-xs leading-5 text-slate-500 dark:text-[color:var(--wp-text-secondary)]"
              : "mt-2 text-xs leading-5 text-[color:var(--wp-text-secondary)]"
          }
        >
          {helperText}
        </p>
      ) : null}

      {open && shown.length > 0 ? (
        <div
          id={listId}
          role="listbox"
          className={
            variant === "termination"
              ? "absolute left-0 right-0 top-full z-20 mt-2 max-h-[min(280px,40vh)] overflow-y-auto rounded-2xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,0.12)] dark:border-[color:var(--wp-surface-card-border)] dark:bg-[color:var(--wp-surface-card)] dark:shadow-[0_18px_40px_rgba(0,0,0,0.45)]"
              : "absolute left-0 right-0 top-full z-20 mt-2 max-h-[min(280px,40vh)] overflow-y-auto rounded-[var(--wp-radius)] border border-[color:var(--wp-border)] bg-[color:var(--wp-surface)] shadow-lg"
          }
        >
          {isLoading ? (
            <div
              className={
                variant === "termination"
                  ? "px-4 py-3 text-sm text-slate-500 dark:text-[color:var(--wp-text-secondary)]"
                  : "px-4 py-3 text-sm text-[color:var(--wp-text-secondary)]"
              }
            >
              Načítám…
            </div>
          ) : null}
          {shown.map((item, index) => {
            const active = item.id === selectedId;
            const hi = index === highlight;
            return (
              <button
                key={item.id}
                type="button"
                role="option"
                aria-selected={active}
                onMouseEnter={() => setHighlight(index)}
                onClick={() => {
                  onSelect(item);
                  setOpen(false);
                  inputRef.current?.blur();
                }}
                className={[
                  "flex w-full items-start justify-between gap-3 border-b px-4 py-3 text-left last:border-b-0",
                  variant === "termination" ? "border-slate-100 dark:border-[color:var(--wp-surface-card-border)]" : "border-[color:var(--wp-border)]",
                  variant === "termination"
                    ? hi
                      ? "bg-slate-50 dark:bg-[color:var(--wp-surface-muted)]"
                      : "hover:bg-slate-50 dark:hover:bg-[color:var(--wp-surface-muted)]"
                    : hi
                      ? "bg-[color:var(--wp-surface-muted)]"
                      : "hover:bg-[color:var(--wp-surface-muted)]",
                  active ? (variant === "termination" ? "bg-violet-50 dark:bg-violet-950/45" : "bg-[var(--wp-accent)]/10") : "",
                ].join(" ")}
              >
                <div className="min-w-0">
                  <div
                    className={
                      variant === "termination"
                        ? "truncate text-sm font-semibold text-slate-900 dark:text-[color:var(--wp-text)]"
                        : "truncate text-sm font-semibold text-[color:var(--wp-text)]"
                    }
                  >
                    {item.label}
                  </div>
                  {item.meta ? (
                    <div
                      className={
                        variant === "termination"
                          ? "mt-1 line-clamp-2 text-xs text-slate-500 dark:text-[color:var(--wp-text-secondary)]"
                          : "mt-1 line-clamp-2 text-xs text-[color:var(--wp-text-secondary)]"
                      }
                    >
                      {item.meta}
                    </div>
                  ) : null}
                </div>
                {active ? (
                  <CheckCircle2
                    className={
                      variant === "termination"
                        ? "mt-0.5 h-4 w-4 shrink-0 text-violet-600 dark:text-violet-300"
                        : "mt-0.5 h-4 w-4 shrink-0 text-[var(--wp-accent)]"
                    }
                  />
                ) : null}
              </button>
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
