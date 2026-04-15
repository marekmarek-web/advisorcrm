import { TrendingUp, PiggyBank, AlertCircle, Info, type LucideIcon } from "lucide-react";
import { getContractsByContact } from "@/app/actions/contracts";
import { mapContractToCanonicalProduct } from "@/lib/client-portfolio/canonical-contract-read";
import type { CanonicalProduct } from "@/lib/client-portfolio/canonical-contract-read";
import { isFvEligibleSegment } from "@/lib/client-portfolio/portal-portfolio-display";
import {
  computeSharedFutureValue,
  SHARED_FV_DISCLAIMER,
  type SharedFvOutput,
} from "@/lib/fund-library/shared-future-value";

type FvProductEntry = {
  product: CanonicalProduct;
  fv: SharedFvOutput;
};

function segmentFvIcon(segment: string): LucideIcon {
  if (segment === "DPS") return PiggyBank;
  return TrendingUp;
}

export async function ProductsFvSummarySection({ contactId }: { contactId: string }) {
  let contracts;
  try {
    contracts = await getContractsByContact(contactId);
  } catch {
    return null;
  }

  const entries: FvProductEntry[] = [];
  const partialEntries: FvProductEntry[] = [];

  for (const c of contracts) {
    if (!isFvEligibleSegment(c.segment)) continue;
    const product = mapContractToCanonicalProduct(c);
    if (!product.fvReadiness.fvSourceType) continue;

    const fv = computeSharedFutureValue({
      fvSourceType: product.fvReadiness.fvSourceType,
      resolvedFundId: product.fvReadiness.resolvedFundId,
      resolvedFundCategory: product.fvReadiness.resolvedFundCategory,
      investmentHorizon: product.fvReadiness.investmentHorizon,
      monthlyContribution: product.premiumMonthly,
      annualContribution: product.premiumAnnual,
    });

    if (fv.projectionState === "complete" && fv.projectedFutureValue != null) {
      entries.push({ product, fv });
    } else if (fv.projectionState === "partial") {
      partialEntries.push({ product, fv });
    }
  }

  if (entries.length === 0 && partialEntries.length === 0) return null;

  return (
    <section
      className="rounded-[var(--wp-radius-lg)] border border-indigo-200/70 bg-indigo-50/30 p-4 sm:p-5 space-y-4"
      aria-label="Odhad budoucí hodnoty investičních produktů"
    >
      <div className="flex items-center gap-2">
        <div className="w-8 h-8 rounded-lg bg-indigo-100 text-indigo-600 flex items-center justify-center shrink-0">
          <TrendingUp size={16} />
        </div>
        <div>
          <h3 className="text-sm font-black text-[color:var(--wp-text)]">
            Odhad budoucí hodnoty (model)
          </h3>
          <p className="text-[10px] text-[color:var(--wp-text-muted)] font-medium">
            Pouze u investičních a penzijních produktů s dostatečnými daty
          </p>
        </div>
      </div>

      {entries.length > 0 && (
        <div className="grid gap-3 sm:grid-cols-2">
          {entries.map(({ product, fv }) => {
            const Icon = segmentFvIcon(product.segment);
            return (
              <div
                key={product.id}
                className="rounded-[var(--wp-radius)] border border-indigo-100 bg-white p-3 sm:p-4 space-y-2"
              >
                <div className="flex items-center gap-2 min-w-0">
                  <Icon className="size-4 text-indigo-500 shrink-0" aria-hidden />
                  <span className="text-sm font-bold text-[color:var(--wp-text)] truncate">
                    {product.productName || product.segmentLabel}
                  </span>
                </div>
                {product.partnerName && (
                  <p className="text-xs text-[color:var(--wp-text-muted)] truncate">{product.partnerName}</p>
                )}
                {product.contractNumber && (
                  <p className="text-[10px] font-mono text-[color:var(--wp-text-muted)]">
                    č. {product.contractNumber}
                  </p>
                )}
                <div className="pt-1">
                  <p className="text-[10px] font-black uppercase tracking-widest text-indigo-600 mb-0.5">
                    Odhad za {fv.horizonYears} let
                  </p>
                  <p className="text-lg font-black text-indigo-950 tabular-nums">
                    {fv.projectedFutureValue!.toLocaleString("cs-CZ")} Kč
                  </p>
                  <p className="text-[11px] text-indigo-900/80 mt-1 leading-snug">{fv.sourceLabel}</p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {partialEntries.length > 0 && (
        <div className="space-y-2">
          {partialEntries.map(({ product, fv }) => {
            const Icon = segmentFvIcon(product.segment);
            return (
              <div
                key={product.id}
                className="rounded-[var(--wp-radius)] border border-amber-200/70 bg-amber-50/50 px-3 py-2.5 flex items-start gap-2.5"
              >
                <AlertCircle className="size-4 text-amber-600 shrink-0 mt-0.5" aria-hidden />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-[color:var(--wp-text)] truncate flex items-center gap-1.5">
                    <Icon className="size-3.5 text-amber-600 shrink-0" aria-hidden />
                    {product.productName || product.segmentLabel}
                    {product.partnerName ? ` · ${product.partnerName}` : ""}
                  </p>
                  <p className="text-xs text-amber-800 mt-0.5">
                    Odhad budoucí hodnoty nelze dopočítat — chybí{" "}
                    {!fv.horizonYears ? "investiční horizont" : ""}
                    {!fv.horizonYears && !fv.monthlyContribution ? " a " : ""}
                    {!fv.monthlyContribution && fv.horizonYears ? "pravidelný příspěvek" : ""}
                    {!fv.monthlyContribution && !fv.horizonYears ? "pravidelný příspěvek" : ""}
                    {fv.expectedAnnualRatePercent == null && fv.horizonYears && fv.monthlyContribution
                      ? "modelová sazba (fond není v knihovně)"
                      : ""}
                    .
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="flex items-start gap-2 pt-1">
        <Info className="size-3.5 text-indigo-400 shrink-0 mt-0.5" aria-hidden />
        <p className="text-[10px] text-[color:var(--wp-text-muted)] leading-relaxed max-w-3xl">
          {SHARED_FV_DISCLAIMER}
        </p>
      </div>
    </section>
  );
}
