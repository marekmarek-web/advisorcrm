"use client";

import { useEffect, useMemo, useState } from "react";
import { CalculatorPageShell } from "../core/CalculatorPageShell";
import { CalculatorPageHeader } from "../core/CalculatorPageHeader";
import { CalculatorInputSection } from "../core/CalculatorInputSection";
import { CalculatorResultsSection } from "../core/CalculatorResultsSection";
import { MortgageProductSwitcher } from "./MortgageProductSwitcher";
import { MortgageTabSwitcher } from "./MortgageTabSwitcher";
import { MortgageInputPanel } from "./MortgageInputPanel";
import { MortgageResultsPanel } from "./MortgageResultsPanel";
import { MortgageBankOffers } from "./MortgageBankOffers";
import { MortgageContactModal } from "./MortgageContactModal";
import {
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
  const [modalBank, setModalBank] = useState<string | null | undefined>(undefined);
  const [liveRates, setLiveRates] = useState<NormalizedOffer[] | null>(null);

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
        // Keep static fallback from in-memory engine config.
      }
    })();

    return () => ctrl.abort();
  }, [state.product]);

  const rankedBanks = useMemo<BankEntry[] | undefined>(() => {
    if (!liveRates || liveRates.length === 0) return undefined;
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
    return normalizedOffersToBankEntries(ranked, state.product);
  }, [liveRates, state]);

  const result = useMemo(
    () => calculateResult(state, rankedBanks),
    [state, rankedBanks]
  );
  const offers = useMemo(
    () => getOffersWithBanks(state, rankedBanks),
    [state, rankedBanks]
  );
  const ratesMeta = rankedBanks?.[0];

  return (
    <div className="pt-0 pb-56 lg:pb-0">
      <CalculatorPageShell>
        <CalculatorPageHeader
          title="Kalkulačka hypoték a úvěrů"
          subtitle="Měsíční splátka hypotéky nebo úvěru podle zadaných parametrů. Srovnání nabídek bank."
        />

        <div className="flex flex-wrap items-center gap-3 sm:gap-4">
          <MortgageProductSwitcher
            product={state.product}
            onProductChange={(product) =>
              setState((s) => ({
                ...s,
                product,
                ...(product === "mortgage"
                  ? {
                      loan: LIMITS.mortgage.default,
                      own: 600_000,
                      term: 30,
                      fix: 5,
                      type: "new" as const,
                      ltvLock: 90 as number | null,
                    }
                  : {
                      loan: LIMITS.loan.default,
                      own: 0,
                      term: 12,
                      type: "new" as const,
                      ltvLock: null,
                    }),
              }))
            }
          />
          <MortgageTabSwitcher
            product={state.product}
            type={state.type}
            onTypeChange={(type) => setState((s) => ({ ...s, type }))}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
          <CalculatorInputSection>
            <MortgageInputPanel
              state={state}
              onStateChange={setState}
            />
          </CalculatorInputSection>
          <CalculatorResultsSection>
            <div className="hidden lg:block sticky top-24">
              <MortgageResultsPanel
                result={result}
                onCtaClick={() => setModalBank(null)}
              />
            </div>
          </CalculatorResultsSection>
        </div>

        <div className="w-full">
          <MortgageBankOffers
            offers={offers}
            fetchedAt={ratesMeta?.fetchedAt}
            source={ratesMeta?.source}
            sourceUrl={ratesMeta?.sourceUrl}
            onRequestOffer={(bankName) => setModalBank(bankName)}
          />
        </div>
      </CalculatorPageShell>

      {/* Mobile: floating result card at bottom (touch-friendly) */}
      <div className="lg:hidden fixed bottom-0 left-0 right-0 z-fixed-cta p-3 pb-[env(safe-area-inset-bottom)] pointer-events-none">
        <div className="max-w-[420px] mx-auto pointer-events-auto shadow-2xl rounded-2xl overflow-hidden border border-slate-200">
          <MortgageResultsPanel
            result={result}
            onCtaClick={() => setModalBank(null)}
          />
        </div>
      </div>
      <MortgageContactModal
        open={modalBank !== undefined}
        bankName={modalBank ?? null}
        state={state}
        onClose={() => setModalBank(undefined)}
      />
    </div>
  );
}
