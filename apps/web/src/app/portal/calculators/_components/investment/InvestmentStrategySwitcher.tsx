"use client";

import type { InvestmentProfile } from "@/lib/calculators/investment/investment.config";

export interface InvestmentStrategySwitcherProps {
  profiles: InvestmentProfile[];
  activeIndex: number;
  onSelect: (index: number) => void;
}

export function InvestmentStrategySwitcher({
  profiles,
  activeIndex,
  onSelect,
}: InvestmentStrategySwitcherProps) {
  return (
    <div className="space-y-3">
      <p className="text-[11px] font-semibold uppercase tracking-[0.16em] text-[color:var(--wp-text-tertiary)]">
        Vyberte strategii
      </p>
      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
        {profiles.map((profile, index) => {
          const isActive = index === activeIndex;
          return (
            <button
              key={profile.id}
              type="button"
              onClick={() => onSelect(index)}
              className={`group flex min-h-[44px] touch-manipulation items-center justify-center rounded-[10px] border-[1.5px] px-4 py-2 text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-1 ${
                isActive
                  ? "border-[#0d1f4e] bg-[#0d1f4e] text-white shadow-sm dark:border-indigo-400/45 dark:bg-indigo-950/90 dark:text-indigo-50"
                  : "border-[color:var(--wp-border-strong)] bg-[color:var(--wp-surface-card)] text-[color:var(--wp-text-secondary)] hover:border-blue-500 hover:bg-blue-50 hover:text-blue-700 dark:hover:border-indigo-500/50 dark:hover:bg-[color:var(--wp-surface-muted)] dark:hover:text-[color:var(--wp-text)]"
              }`}
              data-profile={index}
              aria-pressed={isActive}
            >
              <span className="truncate">{profile.name}</span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
