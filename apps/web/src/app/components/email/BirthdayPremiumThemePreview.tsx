"use client";

import { useMemo } from "react";
import { getPremiumBirthdayEmailPreviewHtml } from "@/lib/email/birthday/preview-premium";

type Props = {
  className?: string;
  /** Výška iframe v Tailwind jednotkách (např. min-h-[320px]). */
  minHeightClassName?: string;
};

/**
 * Náhled šablony Premium pro narozeninové e-maily (statický obsah).
 */
export function BirthdayPremiumThemePreview({
  className,
  minHeightClassName = "min-h-[360px]",
}: Props) {
  const srcDoc = useMemo(() => getPremiumBirthdayEmailPreviewHtml(), []);

  return (
    <div className={className}>
      <p className="text-[11px] font-bold uppercase tracking-widest text-[color:var(--wp-text-tertiary)] mb-2">
        Náhled
      </p>
      <p className="text-xs text-[color:var(--wp-text-secondary)] mb-3">
        Ukázkový text a údaje — skutečný e-mail použije vaše podpisové údaje a znění přání.
      </p>
      {/* Bez sandbox=same-origin — e-mailové HTML nemá skripty; obrázky z originu fungují */}
      <iframe
        title="Náhled šablony narozeninového e-mailu"
        srcDoc={srcDoc}
        className={`w-full ${minHeightClassName} rounded-xl border border-[color:var(--wp-surface-card-border)] bg-slate-100 shadow-inner`}
      />
    </div>
  );
}
