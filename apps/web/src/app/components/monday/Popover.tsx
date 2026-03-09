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
    const rect = anchor.getBoundingClientRect();
    setPosition({ top: rect.bottom + 4, left: rect.left });
  }, [open, anchor]);

  useEffect(() => {
    if (!open) return;
    const h = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("keydown", h);
    return () => document.removeEventListener("keydown", h);
  }, [open, onClose]);

  if (!open || !position) return null;

  return (
    <>
      <div className="fixed inset-0 z-40" aria-hidden onMouseDown={onClose} />
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
