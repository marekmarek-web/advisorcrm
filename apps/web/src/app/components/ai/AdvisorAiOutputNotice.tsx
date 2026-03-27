"use client";

import { Info } from "lucide-react";
import clsx from "clsx";

const DEFAULT_TEXT =
  "Výstup je pouze informativní interní podklad pro poradce. Nejde o doporučení klientovi.";

type Props = {
  className?: string;
  /** Default: full notice box. Compact: one line for tight layouts. */
  variant?: "default" | "compact";
};

export function AdvisorAiOutputNotice({ className, variant = "default" }: Props) {
  if (variant === "compact") {
    return (
      <p
        className={clsx(
          "text-[11px] leading-snug text-[color:var(--wp-text-secondary)] border-l-2 border-indigo-300 dark:border-indigo-600 pl-2.5 py-0.5",
          className
        )}
        role="note"
      >
        {DEFAULT_TEXT}
      </p>
    );
  }

  return (
    <div
      className={clsx(
        "flex gap-2.5 rounded-xl border border-indigo-200/80 bg-indigo-50/90 dark:border-indigo-800/50 dark:bg-indigo-950/40 px-3 py-2.5 text-sm text-indigo-950 dark:text-indigo-100",
        className
      )}
      role="note"
    >
      <Info size={18} className="shrink-0 text-indigo-600 dark:text-indigo-300 mt-0.5" aria-hidden />
      <p className="leading-snug font-medium">{DEFAULT_TEXT}</p>
    </div>
  );
}
