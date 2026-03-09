"use client";

import { useEffect } from "react";

export function TooltipBlurListener() {
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const target = e.target as Element;
      if (target?.closest?.("select") ?? target?.tagName === "OPTION") return;
      if (target?.closest?.("input") ?? target?.closest?.("textarea")) return;
      if (target?.closest?.("[role=\"listbox\"]") ?? target?.closest?.("[role=\"menu\"]")) return;
      if (target?.closest?.(".wp-dropdown")) return;
      if (!target?.closest?.("[data-tip]")) {
        (document.activeElement as HTMLElement)?.blur?.();
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return null;
}
