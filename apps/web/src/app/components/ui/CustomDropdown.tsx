"use client";

import { useState, useRef, useLayoutEffect, useCallback } from "react";
import { createPortal } from "react-dom";
import { ChevronDown, Check, type LucideIcon } from "lucide-react";

export type CustomDropdownOption = { id: string; label: string };

const MENU_MAX_HEIGHT_PX = 240;
const GAP_PX = 8;
const VIEWPORT_PAD = 8;
const BUTTON_MENU_WIDTH_PX = 224;
const Z_BACKDROP = 190;
const Z_MENU = 200;

function computeMenuPlacement(
  trigger: DOMRect,
  direction: "up" | "down",
  isInput: boolean
): { left: number; top: number; width: number; maxHeight: number } {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const menuWidth = isInput ? trigger.width : BUTTON_MENU_WIDTH_PX;

  let left = trigger.left;
  if (left + menuWidth > vw - VIEWPORT_PAD) {
    left = Math.max(VIEWPORT_PAD, vw - VIEWPORT_PAD - menuWidth);
  }
  if (left < VIEWPORT_PAD) left = VIEWPORT_PAD;

  const spaceBelow = vh - trigger.bottom - GAP_PX - VIEWPORT_PAD;
  const spaceAbove = trigger.top - GAP_PX - VIEWPORT_PAD;

  let openUp = direction === "up";
  if (direction === "down" && spaceBelow < 140 && spaceAbove > spaceBelow) openUp = true;
  if (direction === "up" && spaceAbove < 140 && spaceBelow > spaceAbove) openUp = false;

  let top: number;
  let maxHeight: number;

  if (openUp) {
    maxHeight = Math.min(MENU_MAX_HEIGHT_PX, Math.max(80, spaceAbove));
    top = trigger.top - GAP_PX - maxHeight;
    if (top < VIEWPORT_PAD) {
      maxHeight = Math.max(80, trigger.top - VIEWPORT_PAD - GAP_PX);
      top = VIEWPORT_PAD;
    }
  } else {
    maxHeight = Math.min(MENU_MAX_HEIGHT_PX, Math.max(80, spaceBelow));
    top = trigger.bottom + GAP_PX;
    if (top + maxHeight > vh - VIEWPORT_PAD) {
      maxHeight = Math.max(80, vh - VIEWPORT_PAD - top);
    }
  }

  return { left, top, width: menuWidth, maxHeight };
}

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
  /** Přimíchá se k trigger tlačítku (např. wizard / toolbar). */
  buttonClassName?: string;
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
  buttonClassName = "",
}: CustomDropdownProps) {
  const [isOpen, setIsOpen] = useState(false);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const [menuPlacement, setMenuPlacement] = useState<{
    left: number;
    top: number;
    width: number;
    maxHeight: number;
  } | null>(null);

  const selected = options.find((o) => o.id === value);
  const isPlaceholder = !selected || selected.id === "" || selected.id === "none";

  const isInput = variant === "input";

  const buttonClasses = isInput
    ? `w-full px-4 py-3 rounded-xl text-sm font-bold transition-all flex items-center justify-between min-h-[44px] border border-[color:var(--wp-input-border)] bg-[color:var(--wp-input-bg)] hover:border-[color:var(--wp-header-input-focus-border)] focus:bg-[color:var(--wp-surface-card)] focus:ring-2 focus:ring-[color:var(--wp-header-input-focus-ring)] focus:border-[color:var(--wp-header-input-focus-border)] ${isPlaceholder ? "text-[color:var(--wp-text-tertiary)]" : "text-[color:var(--wp-text)]"}`
    : `flex min-h-[44px] items-center gap-2 rounded-xl border border-indigo-200/80 bg-indigo-500/10 px-4 py-2.5 text-xs font-bold text-indigo-700 shadow-sm transition-all hover:bg-indigo-500/15 active:scale-95${
        lightIsland
          ? ""
          : " dark:border-indigo-500/35 dark:bg-indigo-500/15 dark:text-indigo-200 dark:hover:bg-indigo-500/25"
      }`;

  const triggerClass = `${buttonClasses}${buttonClassName ? ` ${buttonClassName}` : ""}`;

  const closeDropdown = useCallback(() => {
    setIsOpen(false);
    setMenuPlacement(null);
  }, []);

  const updatePlacement = useCallback(() => {
    if (!isOpen || !triggerRef.current) return;
    const r = triggerRef.current.getBoundingClientRect();
    setMenuPlacement(computeMenuPlacement(r, direction, isInput));
  }, [isOpen, direction, isInput]);

  useLayoutEffect(() => {
    if (!isOpen) return;
    updatePlacement();
    const el = triggerRef.current;
    const ro = el ? new ResizeObserver(updatePlacement) : null;
    if (el && ro) ro.observe(el);
    window.addEventListener("resize", updatePlacement);
    window.addEventListener("scroll", updatePlacement, true);
    return () => {
      ro?.disconnect();
      window.removeEventListener("resize", updatePlacement);
      window.removeEventListener("scroll", updatePlacement, true);
    };
  }, [isOpen, updatePlacement]);

  const portalEl = typeof document !== "undefined" ? document.body : null;

  return (
    <div className="relative">
      <style>{`
        .custom-dropdown-scroll::-webkit-scrollbar { width: 6px; }
        .custom-dropdown-scroll::-webkit-scrollbar-track { background: transparent; }
        .custom-dropdown-scroll::-webkit-scrollbar-thumb { background-color: var(--wp-surface-card-border); border-radius: 10px; }
        .custom-dropdown-scroll::-webkit-scrollbar-thumb:hover { background-color: var(--wp-border-strong); }
      `}</style>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => {
          if (isOpen) closeDropdown();
          else setIsOpen(true);
        }}
        className={triggerClass}
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

      {isOpen &&
        portalEl &&
        createPortal(
          <>
            <div
              className="fixed inset-0"
              style={{ zIndex: Z_BACKDROP }}
              onClick={closeDropdown}
              aria-hidden
            />
            {menuPlacement && (
              <div
                role="listbox"
                className={`fixed overflow-y-auto rounded-2xl border border-[color:var(--wp-dropdown-border)] bg-[color:var(--wp-dropdown-surface)] py-2 shadow-xl shadow-indigo-900/10${lightIsland ? "" : " dark:shadow-black/40"} custom-dropdown-scroll animate-in fade-in duration-200 slide-in-from-top-2`}
                style={{
                  zIndex: Z_MENU,
                  left: menuPlacement.left,
                  top: menuPlacement.top,
                  width: menuPlacement.width,
                  maxHeight: menuPlacement.maxHeight,
                }}
              >
                {options.map((opt) => (
                  <button
                    key={opt.id}
                    type="button"
                    role="option"
                    aria-selected={value === opt.id}
                    onClick={() => {
                      onChange(opt.id);
                      closeDropdown();
                    }}
                    className={`flex w-full items-center justify-between px-4 py-2.5 text-left text-sm font-bold transition-colors hover:bg-[color:var(--wp-surface-muted)]
                  ${
                    value === opt.id
                      ? lightIsland
                        ? "bg-indigo-500/10 text-indigo-600"
                        : "bg-indigo-500/10 text-indigo-600 dark:text-indigo-300"
                      : "text-[color:var(--wp-text)]"
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
            )}
          </>,
          portalEl
        )}
    </div>
  );
}
