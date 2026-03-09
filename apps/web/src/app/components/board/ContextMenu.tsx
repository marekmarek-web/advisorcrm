"use client";

import { createPortal } from "react-dom";
import { useRef, useEffect, useState, useLayoutEffect } from "react";

export type ContextMenuItem =
  | { type: "action"; label: string; icon?: React.ReactNode; onClick: () => void; danger?: boolean }
  | { type: "separator" }
  | { type: "submenu"; label: string; icon?: React.ReactNode; children: ContextMenuItem[] };

export interface ContextMenuProps {
  items: ContextMenuItem[];
  /** Initial position (used when anchorEl not provided). */
  anchorRect: { top: number; left: number };
  /** When provided, menu position tracks this element on scroll (anchored to cell, not viewport). */
  anchorEl?: HTMLElement | null;
  /** Vertical gap below anchor (default 4). */
  anchorGap?: number;
  onClose: () => void;
}

function getRect(el: HTMLElement, gap: number): { top: number; left: number } {
  const rect = el.getBoundingClientRect();
  return { top: rect.bottom + gap, left: rect.left };
}

export function ContextMenu({ items, anchorRect, anchorEl, anchorGap = 4, onClose }: ContextMenuProps) {
  const menuRef = useRef<HTMLDivElement>(null);
  const [openSubmenuIdx, setOpenSubmenuIdx] = useState<number | null>(null);
  const [position, setPosition] = useState(anchorRect);

  useLayoutEffect(() => {
    if (!anchorEl) {
      setPosition(anchorRect);
      return;
    }
    const update = () => setPosition(getRect(anchorEl!, anchorGap));
    update();
    const scrollHandler = () => update();
    window.addEventListener("scroll", scrollHandler, true);
    window.addEventListener("resize", update);
    return () => {
      window.removeEventListener("scroll", scrollHandler, true);
      window.removeEventListener("resize", update);
    };
  }, [anchorEl, anchorGap, anchorRect]);

  useEffect(() => {
    const handleMouseDown = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) {
        onClose();
      }
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("mousedown", handleMouseDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("mousedown", handleMouseDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [onClose]);

  return createPortal(
    <div
      className="b-menu"
      style={{ top: position.top, left: position.left }}
      ref={menuRef}
    >
      {items.map((item, i) => {
        if (item.type === "separator") return <div key={i} className="b-menu-sep" />;
        if (item.type === "submenu")
          return (
            <div key={i} className="relative">
              <button
                type="button"
                className="b-menu-item"
                onMouseEnter={() => setOpenSubmenuIdx(i)}
                onClick={() => setOpenSubmenuIdx(openSubmenuIdx === i ? null : i)}
              >
                {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
                <span className="flex-1">{item.label}</span>
                <span className="text-[10px] opacity-60">▶</span>
              </button>
              {openSubmenuIdx === i && (
                <div className="b-menu absolute left-full top-0 ml-1">
                  {item.children.map((child, ci) => {
                    if (child.type === "separator") return <div key={ci} className="b-menu-sep" />;
                    if (child.type === "action")
                      return (
                        <button
                          key={ci}
                          type="button"
                          className={`b-menu-item ${child.danger ? "is-danger" : ""}`}
                          onClick={() => {
                            child.onClick();
                            onClose();
                          }}
                        >
                          {child.icon && <span className="w-4 h-4 flex items-center justify-center">{child.icon}</span>}
                          {child.label}
                        </button>
                      );
                    return null;
                  })}
                </div>
              )}
            </div>
          );
        return (
          <button
            key={i}
            type="button"
            className={`b-menu-item ${item.danger ? "is-danger" : ""}`}
            onClick={() => {
              item.onClick();
              onClose();
            }}
          >
            {item.icon && <span className="w-4 h-4 flex items-center justify-center">{item.icon}</span>}
            {item.label}
          </button>
        );
      })}
    </div>,
    document.body
  );
}
