"use client";

import { useState, useEffect, useRef } from "react";
import { QuickActionsMenuContent } from "@/app/portal/quick-new-ui";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";

export function QuickNewMenu() {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onClose = () => setOpen(false);
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    const onMouseDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    document.addEventListener("keydown", onKeyDown);
    document.addEventListener("mousedown", onMouseDown);
    return () => {
      document.removeEventListener("keydown", onKeyDown);
      document.removeEventListener("mousedown", onMouseDown);
    };
  }, [open]);

  return (
    <div className="relative shrink-0" ref={ref}>
      <CreateActionButton
        type="button"
        onClick={() => setOpen((v) => !v)}
        iconClassName={open ? "rotate-45 duration-200" : "duration-200"}
        className={open ? "!bg-aidv-create-hover shadow-lg scale-[0.98] hover:!translate-y-0" : undefined}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Nový – rychlé akce"
      >
        <span className="hidden sm:inline">Nový</span>
      </CreateActionButton>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full z-50 mt-2 w-56 rounded-2xl border border-slate-100 bg-white p-2 shadow-xl"
        >
          <QuickActionsMenuContent variant="dropdown" onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
