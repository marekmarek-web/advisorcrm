"use client";

import type { ReactNode } from "react";

/**
 * CRM-style page header for calculator pages: title + optional subtitle.
 * Matches ListPageHeader typography (no hero, no gradient).
 */

export interface CalculatorPageHeaderProps {
  title: string;
  subtitle?: string | null;
  eyebrow?: string;
  /** e.g. PDF export button — stacks under title on small screens, aligns right on md+ */
  actions?: ReactNode;
}

export function CalculatorPageHeader({
  title,
  subtitle,
  eyebrow = "Kalkulačka Aidvisora",
  actions,
}: CalculatorPageHeaderProps) {
  return (
    <div className="mb-1">
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between md:gap-4">
        <div className="min-w-0 flex-1">
          <p className="mb-1 text-[10px] font-semibold uppercase tracking-[0.14em] text-blue-600 sm:text-[11px] dark:text-indigo-400">
            {eyebrow}
          </p>
          <h1 className="font-display text-[1.45rem] font-extrabold leading-[1.12] tracking-[-0.02em] text-[color:var(--wp-text)] sm:text-[1.55rem] md:text-[1.8rem]">
            {title}
          </h1>
          {subtitle && (
            <p className="text-[13px] sm:text-sm text-[color:var(--wp-text-secondary)] mt-1 leading-relaxed">{subtitle}</p>
          )}
        </div>
        {actions ? <div className="flex shrink-0 md:pt-6">{actions}</div> : null}
      </div>
    </div>
  );
}
