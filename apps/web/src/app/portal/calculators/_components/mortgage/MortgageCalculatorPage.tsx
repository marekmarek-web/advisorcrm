"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CalculatorPageShell } from "../core/CalculatorPageShell";
import { CalculatorPageHeader } from "../core/CalculatorPageHeader";
import { CalculatorMobileResultDock } from "../core/CalculatorMobileResultDock";
import { MortgageInputPanel } from "./MortgageInputPanel";
import { MortgageResultsPanel } from "./MortgageResultsPanel";
import { MortgageBankOffers } from "./MortgageBankOffers";
import { MortgageAmortSection } from "./MortgageAmortSection";
import { BANKS_DATA } from "@/lib/calculators/mortgage/mortgage.config";
import {
  MORTGAGE_CALCULATOR_SESSION_KEY,
  defaultLoanFormState,
  defaultMortgageFormState,
  parseMortgageCalculatorSession,
} from "@/lib/calculators/mortgage/mortgageSessionStorage";
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
import { buildMortgagePdfSections } from "@/lib/calculators/pdf";
import { CalculatorPdfExportButton } from "@/components/calculators/CalculatorPdfExportButton";

export type MortgageCalculatorAudience = "advisor" | "client";

export function MortgageCalculatorPage({
  audience = "advisor",
}: {
  audience?: MortgageCalculatorAudience;
}) {
  const [state, setState] = useState<MortgageState>(defaultMortgageFormState);
  const productDraftsRef = useRef<Partial<Record<"mortgage" | "loan", MortgageState>>>({});
  const skipPersistOnceRef = useRef(true);
  const [liveRates, setLiveRates] = useState<NormalizedOffer[] | null>(null);
  const defaultAllowedBanks = useMemo(
    () => BANKS_DATA.filter((bank) => ALLOWED_BANK_IDS.includes(bank.id as (typeof ALLOWED_BANK_IDS)[number])),
    []
  );

  useEffect(() => {
    try {
      const raw = sessionStorage.getItem(MORTGAGE_CALCULATOR_SESSION_KEY);
      if (raw) {
        const parsed = parseMortgageCalculatorSession(raw);
        if (parsed) {
          productDraftsRef.current.mortgage = parsed.mortgage;
          productDraftsRef.current.loan = parsed.loan;
          setState(parsed.lastActive === "mortgage" ? parsed.mortgage : parsed.loan);
        }
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    if (skipPersistOnceRef.current) {
      skipPersistOnceRef.current = false;
      return;
    }
    productDraftsRef.current[state.product] = state;
    const mortgage = productDraftsRef.current.mortgage ?? defaultMortgageFormState();
    const loan = productDraftsRef.current.loan ?? defaultLoanFormState();
    try {
      sessionStorage.setItem(
        MORTGAGE_CALCULATOR_SESSION_KEY,
        JSON.stringify({
          mortgage,
          loan,
          lastActive: state.product,
        })
      );
    } catch {
      /* ignore */
    }
  }, [state]);

  useEffect(() => {
    if (audience === "client") {
      setLiveRates(null);
      return;
    }
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
  }, [state.product, audience]);

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

  const getPdfSections = useCallback(
    () => buildMortgagePdfSections(state, result, offers, ratesMeta),
    [state, result, offers, ratesMeta]
  );

  return (
    <div className="pt-0 pb-56 lg:pb-0">
      <CalculatorPageShell>
        <div className="mb-3">
          <CalculatorPageHeader
            eyebrow="Kalkulačka hypoték a úvěrů · 2026"
            title="Spočítejte si splátku"
            subtitle={
              audience === "client"
                ? "Orientační měsíční splátka — bez srovnání nabídek bank. Ilustrativní výpočet, ne závazná nabídka."
                : "Zjistěte přesnou měsíční splátku a srovnejte aktuální nabídky bank."
            }
            actions={
              <CalculatorPdfExportButton
                documentTitle="Hypotéka a úvěr – přehled výpočtu"
                filePrefix="hypoteka"
                getSections={getPdfSections}
              />
            }
          />
        </div>

        <div className="grid grid-cols-1 items-start gap-4 lg:grid-cols-[1fr_360px]">
          <MortgageInputPanel
            state={state}
            onStateChange={setState}
            onProductChange={(product) =>
              setState((s) => {
                const prev = s.product;
                if (prev === product) return s;
                productDraftsRef.current[prev] = { ...s };
                const restored = productDraftsRef.current[product];
                if (restored) {
                  return { ...restored, product };
                }
                return product === "mortgage"
                  ? {
                      ...s,
                      ...defaultMortgageFormState(),
                    }
                  : {
                      ...s,
                      ...defaultLoanFormState(),
                    };
              })
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

        {audience === "advisor" && (
          <div className="mt-4 rounded-[20px] border-[1.5px] border-[color:var(--wp-surface-card-border)] bg-[color:var(--wp-surface-card)] p-5 shadow-sm sm:p-6 md:p-7">
            <MortgageBankOffers
              offers={offers}
              fetchedAt={ratesMeta?.fetchedAt}
              source={ratesMeta?.source}
              sourceUrl={ratesMeta?.sourceUrl}
            />
          </div>
        )}
      </CalculatorPageShell>

      <CalculatorMobileResultDock>
        <MortgageResultsPanel result={result} />
      </CalculatorMobileResultDock>
    </div>
  );
}
