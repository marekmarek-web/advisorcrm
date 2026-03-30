"use client";

import { useState, useEffect, useRef } from "react";
import clsx from "clsx";
import { QuickActionsMenuContent } from "@/app/portal/quick-new-ui";
import { CreateActionButton } from "@/app/components/ui/CreateActionButton";
import type { QuickActionsConfig } from "@/lib/quick-actions";

export function QuickNewMenu({ initialQuickActions }: { initialQuickActions?: QuickActionsConfig }) {
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
        className={clsx(
          open &&
            "ring-2 ring-indigo-500 ring-offset-2 ring-offset-[color:var(--wp-portal-header-bg)] scale-[0.98] dark:ring-indigo-400",
        )}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="Nový – rychlé akce"
      >
        Nový
      </CreateActionButton>
      {open && (
        <div
          role="menu"
          className="wp-quick-new-menu absolute right-0 top-full z-dropdown mt-3 w-56 origin-top-right animate-in fade-in zoom-in-95 p-2 duration-200"
        >
          <QuickActionsMenuContent
            variant="dropdown"
            onClose={() => setOpen(false)}
            initialConfig={initialQuickActions}
          />
        </div>
      )}
    </div>
  );
}
