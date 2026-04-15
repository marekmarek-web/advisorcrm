"use client";

/**
 * Advisor-side FV summary block for investment / DPS / DIP products.
 * Uses the shared FV engine; never fabricates data.
 * Three display states: complete, partial, unavailable.
 */

import { TrendingUp, Clock, Info } from "lucide-react";
import { computeSharedFutureValue } from "@/lib/fund-library/shared-future-value";
import { isFvEligibleSegment } from "@/lib/client-portfolio/portal-portfolio-display";
import type { CanonicalProduct } from "@/lib/client-portfolio/canonical-contract-read";

type FvBlockProps = {
  product: CanonicalProduct;
};

export function AdvisorProductFvBlock({ product }: FvBlockProps) {
  if (!isFvEligibleSegment(product.segment)) return null;

  const fv = computeSharedFutureValue({
    fvSourceType: product.fvReadiness.fvSourceType,
    resolvedFundId: product.fvReadiness.resolvedFundId,
    resolvedFundCategory: product.fvReadiness.resolvedFundCategory,
    investmentHorizon: product.fvReadiness.investmentHorizon,
    monthlyContribution: product.fvReadiness.monthlyAmount,
    annualContribution: product.premiumAnnual,
  });

  if (fv.projectionState === "complete" && fv.projectedFutureValue != null) {
    return (
      <div className="rounded-[var(--wp-radius)] border border-emerald-200/80 bg-emerald-50/60 px-3 py-2.5 mt-1">
        <div className="flex items-center gap-1.5 mb-1">
          <TrendingUp className="size-3.5 text-emerald-600 shrink-0" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-wide text-emerald-700">
            Orientační budoucí hodnota
          </span>
        </div>
        <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
          <span className="text-xl font-black tabular-nums text-emerald-800">
            {fv.projectedFutureValue.toLocaleString("cs-CZ")} Kč
          </span>
          {fv.horizonYears != null ? (
            <span className="text-xs font-semibold text-emerald-700">
              za {fv.horizonYears} let
            </span>
          ) : null}
        </div>
        {fv.expectedAnnualRatePercent != null ? (
          <p className="text-[10px] text-emerald-700/80 mt-1">
            Model: {fv.expectedAnnualRatePercent} % p.a. · {fv.sourceLabel}
          </p>
        ) : null}
        <p className="text-[9px] text-emerald-600/70 mt-1 leading-tight">{fv.disclaimer}</p>
      </div>
    );
  }

  if (fv.projectionState === "partial") {
    return (
      <div className="rounded-[var(--wp-radius)] border border-amber-200/70 bg-amber-50/50 px-3 py-2 mt-1">
        <div className="flex items-center gap-1.5 mb-0.5">
          <Clock className="size-3.5 text-amber-600 shrink-0" aria-hidden />
          <span className="text-[10px] font-bold uppercase tracking-wide text-amber-700">
            FV — neúplné podklady
          </span>
        </div>
        <p className="text-xs text-amber-800">
          {fv.horizonYears == null
            ? "Chybí investiční horizont — doplňte jej pro výpočet orientační hodnoty."
            : fv.monthlyContribution == null
            ? "Chybí měsíční příspěvek — doplňte jej pro výpočet orientační hodnoty."
            : "Nelze sestavit orientační výpočet z dostupných dat."}
        </p>
      </div>
    );
  }

  // projectionState === "unavailable"
  return (
    <div className="rounded-[var(--wp-radius)] border border-slate-200/60 bg-slate-50/60 px-3 py-2 mt-1">
      <div className="flex items-center gap-1.5 mb-0.5">
        <Info className="size-3.5 text-slate-400 shrink-0" aria-hidden />
        <span className="text-[10px] font-bold uppercase tracking-wide text-slate-500">
          FV — nedostupné
        </span>
      </div>
      <p className="text-xs text-slate-500">
        Orientační výpočet budoucí hodnoty není k dispozici — fond nebo kategorie nejsou v evidenci.
      </p>
    </div>
  );
}
