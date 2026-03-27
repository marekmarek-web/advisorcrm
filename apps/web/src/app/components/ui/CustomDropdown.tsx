"use client";

import { useState } from "react";
import { ChevronDown, Check, type LucideIcon } from "lucide-react";

export type CustomDropdownOption = { id: string; label: string };

export interface CustomDropdownProps {
  value: string;
  onChange: (id: string) => void;
  options: CustomDropdownOption[];
  placeholder?: string;
  icon?: LucideIcon;
  direction?: "up" | "down";
  variant?: "input" | "button";
  /** Světlý chrome i při tmavém portálu (např. zápisky). */
  lightIsland?: boolean;
}

export function CustomDropdown({
  value,
  onChange,
  options,
  placeholder = "— Vybrat —",
  icon: Icon,
  direction = "down",
  variant = "input",
  lightIsland = false,
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const isPlaceholder = !selected || selected.id === "" || selected.id === "none";

  const isInput = variant === "input";

  const buttonClasses = isInput
    ? `w-full px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-between min-h-[44px] border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] hover:border-[color:var(--wp-header-input-focus-border)] focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-[color:var(--wp-header-input-focus-ring)] focus:border-[color:var(--wp-header-input-focus-border)] ${isPlaceholder ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-input-text)]"}`
    : `flex min-h-[44px] items-center gap-2 rounded-xl border border-indigo-200/80 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-500/15 active:scale-95${
        lightIsland
          ? ""
          : " dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
      }`;

  return (
    <div className="relative">
      <style>{`
        .custom-dropdown-scroll::-webkit-scrollbar { width: 6px; }
        .custom-dropdown-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-dropdown-scroll::-webkit-scrollbar-thumb { background-color: var(--wp-surface-card-border); border-radius: 10px; }
        .custom-dropdown-scroll::-webkit-scrollbar-thumb:hover { background-color: var(--wp-border-strong); }
      `}</style>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={buttonClasses}
      >
        {isInput ? (
          <div className="flex items-center gap-3 truncate min-w-0">
            {Icon && (
              <Icon
                size={18}
                className={isPlaceholder ? "shrink-0 text-[color:var(--wp-text-tertiary)]" : "shrink-0 text-[color:var(--wp-icon-default)]"}
              />
            )}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </div>
        ) : (
          <>
            {Icon && (
              <Icon
                size={14}
                className={!isPlaceholder ? "fill-indigo-200 shrink-0" : "shrink-0"}
              />
            )}
            <span className="truncate">{selected ? selected.label : placeholder}</span>
          </>
        )}
        <ChevronDown
          size={isInput ? 16 : 14}
          className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${isInput ? "text-[color:var(--wp-text-tertiary)]" : ""}`}
        />
      </button>

      {isOpen && (
        <>
          <div
            className="fixed inset-0 z-[110]"
            onClick={() => setIsOpen(false)}
            aria-hidden
          />
          <div
            className={`absolute ${isInput ? "left-0 w-full" : "left-0 w-56"} z-[120] max-h-60 overflow-y-auto rounded-2xl border border-[color:var(--wp-dropdown-border)] bg-[color:var(--wp-dropdown-surface)] py-2 shadow-xl shadow-indigo-900/10${lightIsland ? "" : " dark:shadow-black/40"} custom-dropdown-scroll
              ${direction === "up" ? "bottom-full mb-2" : "top-full mt-2"}
              animate-in fade-in duration-200
              ${direction === "up" ? "slide-in-from-bottom-2" : "slide-in-from-top-2"}
            `}
          >
            {options.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => {
                  onChange(opt.id);
                  setIsOpen(false);
                }}
                className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-bold transition-colors hover:bg-[color:var(--wp-surface-muted)]
                  ${
                    value === opt.id
                      ? lightIsland
                        ? "bg-indigo-500/10 text-indigo-600"
                        : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                      : "text-[color:var(--wp-text-secondary)]"
                  }
                `}
              >
                <span className="truncate pr-4">{opt.label}</span>
                {value === opt.id && (
                  <Check size={16} strokeWidth={3} className="shrink-0" />
                )}
              </button>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
