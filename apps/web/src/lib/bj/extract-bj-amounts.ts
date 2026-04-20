/**
 * Normalizace vstupních částek pro BJ kalkulátor.
 *
 * Kalkulátor očekává čísla v Kč (žádné formátování, žádné měnové symboly).
 * Tato vrstva bere:
 *   1. raw smlouvu (contracts + portfolio_attributes),
 *   2. AI review envelope (extractedPayload),
 *   3. manuální formulář,
 * a vrací pole `amounts` přesně tak, jak to calculateBj() potřebuje.
 *
 * Pravidla:
 *   • Prázdné / nerozpoznané hodnoty → undefined (kalkulátor je ignoruje).
 *   • Měsíční pojistné se convertuje na roční × 12, protože BJ sazebník
 *     pracuje výhradně s ročním pojistným (viz kariérní plán).
 *   • client_contribution se naopak udržuje MĚSÍČNĚ — Conseq DPS sazba
 *     (11 BJ za 1 000 Kč/měs) je definovaná per-month včetně capu 1 700.
 */

import type { BjCalculationInput } from "./calculate-bj";
import type {
  ProductCategory,
  ProductSubtype,
} from "@/lib/ai/product-categories";

export type BjAmountSources = {
  /** premium_amount (měsíční nebo jednorázové) z contracts. */
  premiumAmount?: string | number | null;
  /** premium_annual (roční ekvivalent) z contracts. */
  premiumAnnual?: string | number | null;
  /** portfolio_attributes.loanPrincipal (jistina úvěru). */
  loanPrincipal?: string | number | null;
  /** portfolio_attributes.participantContribution (měsíční příspěvek DPS). */
  participantContributionMonthly?: string | number | null;
  /** portfolio_attributes.targetAmount (alt. pro investmentAmount). */
  targetAmount?: string | number | null;
  /** Vstupní poplatek z extraktu (jednorázové investice). */
  entryFee?: string | number | null;
  /** paymentType z portfolio_attributes — ovlivní interpretaci premiumAmount. */
  paymentType?: "one_time" | "regular" | null;
};

export type BuildBjInputParams = {
  category: ProductCategory;
  subtypes: ProductSubtype[];
  providerName?: string | null;
  productName?: string | null;
  amounts: BjAmountSources;
};

/**
 * Bezpečné převedení čísla z různých vstupních formátů. Přijímá:
 *   • number → vrací se tak jak je,
 *   • string → normalizuje "1 234,56" / "1.234,56" / "1234.56" atd.,
 *   • null/undefined/prázdný string → undefined.
 */
export function toCzk(value: string | number | null | undefined): number | undefined {
  if (value == null) return undefined;
  if (typeof value === "number") {
    return Number.isFinite(value) && value >= 0 ? value : undefined;
  }
  const raw = value.trim();
  if (!raw) return undefined;
  // Odstraníme měnu, mezery (NBSP i obyčejné), apostrofy
  const cleaned = raw
    .replace(/[\u00A0\u202F]/g, "") // NBSP / NNBSP
    .replace(/\s+/g, "")
    .replace(/kč|czk/gi, "")
    .replace(/'/g, "");
  // Czech decimal: poslední "," nebo "." bereme jako desetinnou tečku,
  // zbylé mezery/tečky jako tisícový oddělovač.
  const lastComma = cleaned.lastIndexOf(",");
  const lastDot = cleaned.lastIndexOf(".");
  const decimalPos = Math.max(lastComma, lastDot);
  let normalized: string;
  if (decimalPos === -1) {
    normalized = cleaned;
  } else {
    normalized =
      cleaned
        .slice(0, decimalPos)
        .replace(/[.,]/g, "") +
      "." +
      cleaned.slice(decimalPos + 1);
  }
  const parsed = Number.parseFloat(normalized);
  if (!Number.isFinite(parsed) || parsed < 0) return undefined;
  return parsed;
}

/**
 * Sestaví vstupy pro calculateBj() z raw dat smlouvy.
 *
 * Logika:
 *   • entryFee → amounts.entryFee (pro investice s VP).
 *   • client_contribution → měsíční příspěvek DPS.
 *   • annual_premium:
 *       - když máme premiumAnnual, použijeme ho,
 *       - jinak pokud je premiumAmount a paymentType = "regular", vynásobíme × 12,
 *       - pokud paymentType = "one_time", premiumAmount bereme jako jednorázové
 *         (annualPremium pak neposkytujeme — kalkulátor spadne na loanPrincipal /
 *         investmentAmount).
 *   • loan_principal → z portfolio_attributes.loanPrincipal.
 *   • investment_amount → primárně targetAmount; jako fallback
 *     premiumAmount pro single-payment investice.
 */
export function buildBjCalculationInput(params: BuildBjInputParams): BjCalculationInput {
  const { amounts } = params;
  const haystack = [
    params.providerName ?? "",
    params.productName ?? "",
  ]
    .join(" ")
    .toLowerCase()
    .trim();

  const entryFee = toCzk(amounts.entryFee);
  const loanPrincipal = toCzk(amounts.loanPrincipal);
  const contribMonthly = toCzk(amounts.participantContributionMonthly);
  const targetAmount = toCzk(amounts.targetAmount);
  const premiumAmount = toCzk(amounts.premiumAmount);
  const premiumAnnualRaw = toCzk(amounts.premiumAnnual);

  let annualPremium: number | undefined = premiumAnnualRaw;
  let investmentAmount: number | undefined = targetAmount;
  const isOneTime = amounts.paymentType === "one_time";
  const isRegular = amounts.paymentType === "regular";

  if (annualPremium == null && premiumAmount != null) {
    if (isRegular) annualPremium = premiumAmount * 12;
    else if (!isOneTime) {
      // Bez paymentType — přiřadíme podle kategorie:
      const regularLike: ProductCategory[] = [
        "LIFE_INSURANCE_REGULAR",
        "MOTOR_INSURANCE",
        "PROPERTY_INSURANCE",
        "LIABILITY_INSURANCE",
      ];
      if (regularLike.includes(params.category)) {
        annualPremium = premiumAmount * 12;
      }
    }
  }

  if (investmentAmount == null && premiumAmount != null && isOneTime) {
    investmentAmount = premiumAmount;
  }
  if (investmentAmount == null && premiumAnnualRaw != null) {
    // fallback pro single-payment investice, kde premiumAnnual je kopie hodnoty
    investmentAmount = premiumAnnualRaw;
  }

  return {
    category: params.category,
    subtypes: params.subtypes,
    haystack,
    amounts: {
      entryFee,
      clientContributionMonthly: contribMonthly,
      annualPremium,
      loanPrincipal,
      investmentAmount,
    },
  };
}
