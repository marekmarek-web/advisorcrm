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
}

export function CustomDropdown({
  value,
  onChange,
  options,
  placeholder = "— Vybrat —",
  icon: Icon,
  direction = "down",
  variant = "input",
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const selected = options.find((o) => o.id === value);
  const isPlaceholder = !selected || selected.id === "" || selected.id === "none";

  const isInput = variant === "input";

  const buttonClasses = isInput
    ? `w-full px-4 py-3 bg-slate-50 border border-slate-200 hover:border-indigo-300 rounded-xl text-sm font-bold transition-all focus:bg-white focus:ring-2 focus:ring-indigo-100 focus:border-indigo-400 flex items-center justify-between min-h-[44px] ${isPlaceholder ? "text-slate-400" : "text-slate-800"}`
    : "flex items-center gap-2 px-4 py-2.5 bg-indigo-50 hover:bg-indigo-100 border border-indigo-100 rounded-xl text-xs font-bold text-indigo-700 transition-all shadow-sm active:scale-95 min-h-[44px]";

  return (
    <div className="relative">
      <style>{`
        .custom-dropdown-scroll::-webkit-scrollbar { width: 6px; }
        .custom-dropdown-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-dropdown-scroll::-webkit-scrollbar-thumb { background-color: #e2e8f0; border-radius: 10px; }
        .custom-dropdown-scroll::-webkit-scrollbar-thumb:hover { background-color: #cbd5e1; }
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
                className={isPlaceholder ? "text-slate-300 shrink-0" : "text-slate-500 shrink-0"}
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
          className={`shrink-0 transition-transform duration-200 ${isOpen ? "rotate-180" : ""} ${isInput ? "text-slate-400" : ""}`}
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
            className={`absolute ${isInput ? "left-0 w-full" : "left-0 w-56"} bg-white border border-slate-100 rounded-2xl shadow-xl shadow-indigo-900/10 py-2 z-[120] max-h-60 overflow-y-auto custom-dropdown-scroll
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
                className={`w-full flex items-center justify-between px-4 py-2.5 text-sm font-bold transition-colors hover:bg-slate-50 text-left
                  ${value === opt.id ? "text-indigo-600 bg-indigo-50/50" : "text-slate-600"}
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
