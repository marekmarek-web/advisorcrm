"use client";

import { useState, useEffect, useRef } from "react";
import { Plus } from "lucide-react";
import { QuickActionsMenuContent } from "@/app/portal/quick-new-ui";
import { dashboardPrimaryCtaClassNameNav } from "@/lib/ui/button-presets";

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
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${dashboardPrimaryCtaClassNameNav} transition-all duration-200 ${
          open ? "bg-aidv-dashboard-cta-hover shadow-lg scale-[0.98]" : ""
        }`}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Nový – rychlé akce"
      >
        <Plus size={18} strokeWidth={2.5} className={`shrink-0 transition-transform duration-200 ${open ? "rotate-45" : "group-hover:scale-110"}`} />
        <span className="hidden sm:block">Nový</span>
      </button>
      {open && (
        <div
          role="menu"
          className="absolute right-0 top-full mt-2 z-50 w-56 rounded-2xl shadow-xl border border-slate-100 bg-white p-2"
        >
          <QuickActionsMenuContent variant="dropdown" onClose={() => setOpen(false)} />
        </div>
      )}
    </div>
  );
}
