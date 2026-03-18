"use client";

import { useState, useRef, useEffect } from "react";

interface PopoverProps {
  open: boolean;
  onClose: () => void;
  anchor: HTMLElement | null;
  children: React.ReactNode;
  className?: string;
  align?: "left" | "center" | "right";
}

export function Popover({
  open,
  onClose,
  anchor,
  children,
  className = "",
  align = "left",
}: PopoverProps) {
  const [position, setPosition] = useState<{ top: number; left: number } | null>(null);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open || !anchor) {
      setPosition(null);
      return;
    }
    const calculatePosition = () => {
      const rect = anchor.getBoundingClientRect();
      const menuWidth = ref.current?.offsetWidth ?? 240;
      const menuHeight = ref.current?.offsetHeight ?? 240;
      const spacing = 8;
      const alignedLeft =
        align === "right"
          ? rect.right - menuWidth
          : align === "center"
            ? rect.left + rect.width / 2 - menuWidth / 2
            : rect.left;

      let nextLeft = Math.max(spacing, Math.min(alignedLeft, window.innerWidth - menuWidth - spacing));
      let nextTop = rect.bottom + 4;

      if (nextTop + menuHeight > window.innerHeight - spacing) {
        nextTop = rect.top - menuHeight - 4;
      }
      if (nextTop < spacing) {
        nextTop = Math.max(spacing, window.innerHeight - menuHeight - spacing);
      }
      setPosition({ top: nextTop, left: nextLeft });
    };

    calculatePosition();
    const raf = requestAnimationFrame(calculatePosition);
    window.addEventListener("resize", calculatePosition);
    window.addEventListener("scroll", calculatePosition, true);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", calculatePosition);
      window.removeEventListener("scroll", calculatePosition, true);
    };
  }, [open, anchor, align]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open || !position) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" aria-hidden onMouseDown={onClose} onTouchStart={onClose} />
      <div
        ref={ref}
        className={`fixed z-50 min-w-[160px] py-1 bg-monday-surface border border-monday-border rounded-[var(--monday-radius)] shadow-[var(--monday-shadow)] ${className}`}
        style={{ top: position.top, left: position.left }}
        onClick={(e) => e.stopPropagation()}
      >
        {children}
      </div>
    </>
  );
}
