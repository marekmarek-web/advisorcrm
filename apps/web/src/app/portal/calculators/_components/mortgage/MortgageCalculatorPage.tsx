"use client";

import { useEffect, useMemo, useState } from "react";
import { CalculatorPageShell } from "../core/CalculatorPageShell";
import { CalculatorPageHeader } from "../core/CalculatorPageHeader";
import { CalculatorMobileResultDock } from "../core/CalculatorMobileResultDock";
import { MortgageInputPanel } from "./MortgageInputPanel";
import { MortgageResultsPanel } from "./MortgageResultsPanel";
import { MortgageBankOffers } from "./MortgageBankOffers";
import { MortgageAmortSection } from "./MortgageAmortSection";
import {
  BANKS_DATA,
  DEFAULT_STATE,
  LIMITS,
} from "@/lib/calculators/mortgage/mortgage.config";
import {
  calculateResult,
  getCalculatedLtv,
  getOffersWithBanks,
} from "@/lib/calculators/mortgage/mortgage.engine";
import type { MortgageState } from "@/lib/calculators/mortgage/mortgage.types";
import type { BankEntry } from "@/lib/calculators/mortgage/mortgage.types";
import type { NormalizedOffer } from "@/lib/calculators/mortgage/rates";
import {
  ALLOWED_BANK_IDS,
  normalizedOffersToBankEntries,
  rankOffersByScenario,
} from "@/lib/calculators/mortgage/rates";

export function MortgageCalculatorPage() {
  const [state, setState] = useState<MortgageState>({
    ...DEFAULT_STATE,
    product: "mortgage",
    mortgageType: "standard",
    loanType: "consumer",
    loan: LIMITS.mortgage.default,
    own: 600_000,
    extra: 0,
    term: 30,
    fix: 5,
    type: "new",
    ltvLock: 90,
  });
  const [liveRates, setLiveRates] = useState<NormalizedOffer[] | null>(null);
  const defaultAllowedBanks = useMemo(
    () => BANKS_DATA.filter((bank) => ALLOWED_BANK_IDS.includes(bank.id as (typeof ALLOWED_BANK_IDS)[number])),
    []
  );

  useEffect(() => {
    const ctrl = new AbortController();
    (async () => {
      try {
        const response = await fetch(`/api/calculators/rates?type=${state.product}`, {
          method: "GET",
          signal: ctrl.signal,
        });
        if (!response.ok) return;
        const payload = (await response.json()) as {
          ok: boolean;
          rates?: NormalizedOffer[];
        };
        if (payload.ok && Array.isArray(payload.rates)) {
          setLiveRates(payload.rates);
        }
      } catch {
        // static fallback
      }
    })();
    return () => ctrl.abort();
  }, [state.product]);

  const rankedBanks = useMemo<BankEntry[] | undefined>(() => {
    if (!liveRates || liveRates.length === 0) return defaultAllowedBanks;
    const scenario = {
      productType: state.product,
      subtype: state.product === "mortgage" ? state.mortgageType : state.loanType,
      amount: state.loan,
      termMonths: state.term * 12,
      ltvOrAkontace: getCalculatedLtv(state),
      fixationYears: state.product === "mortgage" ? state.fix : undefined,
      mode: state.type,
    } as const;
    const ranked = rankOffersByScenario(liveRates, scenario);
    const normalized = normalizedOffersToBankEntries(ranked, state.product);
    return normalized.length > 0 ? normalized : defaultAllowedBanks;
  }, [liveRates, state, defaultAllowedBanks]);

  const result = useMemo(() => calculateResult(state, rankedBanks), [state, rankedBanks]);
  const offers = useMemo(() => getOffersWithBanks(state, rankedBanks), [state, rankedBanks]);
  const ratesMeta = rankedBanks?.[0];

  return (
    <div className="pt-0 pb-56 lg:pb-0">
      <CalculatorPageShell>
        <div className="mb-3">
          <CalculatorPageHeader
            eyebrow="Kalkulačka hypoték a úvěrů · 2026"
            title="Spočítejte si splátku"
            subtitle="Zjistěte přesnou měsíční splátku a srovnejte aktuální nabídky bank."
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">
          <MortgageInputPanel
            state={state}
            onStateChange={setState}
            onProductChange={(product) =>
              setState((s) => ({
                ...s,
                product,
                ...(product === "mortgage"
                  ? { loan: LIMITS.mortgage.default, own: 600_000, term: 30, fix: 5, type: "new" as const, ltvLock: 90 as number | null }
                  : { loan: LIMITS.loan.default, own: 0, term: 12, type: "new" as const, ltvLock: null }),
              }))
            }
            onTypeChange={(type) => setState((s) => ({ ...s, type }))}
          />
          <div className="hidden lg:block sticky top-6">
            <MortgageResultsPanel result={result} />
          </div>
        </div>

        {/* Amortization analysis */}
        {state.product === "mortgage" && (
          <MortgageAmortSection
            borrowingAmount={result.borrowingAmount}
            annualRate={result.finalRate}
            termYears={state.term}
          />
        )}

        <div className="mt-4 rounded-[20px] border-[1.5px] border-[#e2e8f0] bg-white p-5 shadow-sm sm:p-6 md:p-7">
          <MortgageBankOffers
            offers={offers}
            fetchedAt={ratesMeta?.fetchedAt}
            source={ratesMeta?.source}
            sourceUrl={ratesMeta?.sourceUrl}
          />
        </div>
      </CalculatorPageShell>

      <CalculatorMobileResultDock>
        <MortgageResultsPanel result={result} />
      </CalculatorMobileResultDock>
    </div>
  );
}
