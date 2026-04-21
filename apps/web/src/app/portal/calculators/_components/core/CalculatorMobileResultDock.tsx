"use client";

import { ChevronDown, ChevronUp } from "lucide-react";
import { useState } from "react";

export interface CalculatorMobileResultDockProps {
  children: React.ReactNode;
  /**
   * Krátký summary zobrazený v collapsed režimu (např. „Předp. hodnota: 1,2 M Kč").
   * Když není zadán, ve sbalené variantě se ukáže jen šipka.
   */
  collapsedSummary?: React.ReactNode;
}

/**
 * Shared mobile floating dock used by calculator pages.
 *
 * 2026-04-20: přidán collapse (drag handle + chevron), aby uživatel viděl
 * i obsah za dockem. Sbalený dock drží jen ~56 px, aby nepřekrýval kalkulačku.
 * V expanded režimu má max 70 vh, vlastní scroll a blur pod obsahem.
 */
export function CalculatorMobileResultDock({
  children,
  collapsedSummary,
}: CalculatorMobileResultDockProps) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div
      className="lg:hidden fixed bottom-0 left-0 right-0 z-fixed-cta p-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pointer-events-none"
      data-testid="calculator-mobile-result-dock"
    >
      <div
        className={[
          "pointer-events-auto mx-auto w-full max-w-[420px] overflow-hidden rounded-[18px] border border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] shadow-2xl",
          "transition-[max-height] duration-300 ease-out",
          collapsed ? "max-h-[56px]" : "max-h-[70vh]",
        ].join(" ")}
      >
        <button
          type="button"
          onClick={() => setCollapsed((v) => !v)}
          className="flex w-full items-center gap-2 border-b border-white/10 bg-[#0d1f4e] px-3 py-2 text-left text-white"
          aria-expanded={!collapsed}
          aria-label={collapsed ? "Rozbalit výsledek" : "Sbalit výsledek"}
        >
          <div className="h-1 w-10 rounded-full bg-white/30" aria-hidden />
          <span className="flex-1 truncate text-[11px] font-black uppercase tracking-[0.12em] text-white/80">
            {collapsed && collapsedSummary ? collapsedSummary : "Výsledek kalkulačky"}
          </span>
          {collapsed ? (
            <ChevronUp size={16} className="shrink-0 text-white/80" />
          ) : (
            <ChevronDown size={16} className="shrink-0 text-white/80" />
          )}
        </button>
        <div
          className={[
            "overflow-y-auto",
            collapsed ? "max-h-0 opacity-0" : "max-h-[calc(70vh-56px)] opacity-100",
          ].join(" ")}
          aria-hidden={collapsed}
        >
          {children}
        </div>
      </div>
    </div>
  );
}
