/**
 * BJ kalkulátor — čistá funkce bez závislosti na DB ani I/O.
 *
 * Vstupem je:
 *   1. kategorie produktu (PRODUCT_CATEGORIES) + volitelné subtypy,
 *   2. identifikační řetězec pro partner-match (provider + product name),
 *   3. všechny částky, které pro smlouvu známe (annual premium, jistina, …),
 *   4. seznam koeficientů ze sazebníku (bj_coefficients) — volající
 *      (repository) je zodpovědný za spojení per-tenant + global fallback.
 *
 * Výstupem je buď:
 *   • { ok: true, result: ContractBjCalculation, bjUnits }  — lze spočítat,
 *   • { ok: false, reason: string, notes: string[] }        — nelze spočítat
 *     (chybí částka nebo pravidlo), volající zapíše `bj_units = NULL` a do
 *     `bj_calculation` uloží důvod.
 *
 * Záměr: kalkulátor je 100 % deterministický a pokrývá všechny formule
 * ze sazebníku (entry_fee / client_contribution / annual_premium /
 * loan_principal / investment_amount). Ověřeno unit testy proti tabulce
 * „Body" z kariérního plánu (viz __tests__/calculate-bj.test.ts).
 */

import type { ContractBjCalculation } from "db";
import type {
  ProductCategory,
  ProductSubtype,
} from "@/lib/ai/product-categories";

/** Tvar řádku bj_coefficients, jak ho dostává kalkulátor z repository. */
export type BjCoefficientRule = {
  /** Kategorie — MUSÍ odpovídat `category` vstupu (jinak se ignoruje). */
  productCategory: ProductCategory;
  /** Regex partnera/produktu jako string, nebo null pro category-default. */
  partnerPattern: string | null;
  /** Subtype, nebo null pokud pravidlo platí pro jakýkoli. */
  subtype: ProductSubtype | null;
  /** Který druh částky vzít ze smlouvy. */
  formula: BjFormula;
  /** Přímý multiplikátor (BJ = amount × coefficient). */
  coefficient: number | null;
  /** Alternativa (BJ = amount / divisor). */
  divisor: number | null;
  /** Horní / dolní limit pro amount před multiplikací. */
  cap: number | null;
  floor: number | null;
  /** global = tenant_id NULL; tenant = per-tenant řádek. */
  tenantScope: "global" | "tenant";
  /** Volitelná poznámka z DB (pro audit). */
  note?: string | null;
};

export type BjFormula =
  | "entry_fee"
  | "client_contribution"
  | "annual_premium"
  | "loan_principal"
  | "investment_amount";

export type BjCalculationInput = {
  /** Kategorie produktu po klasifikaci. */
  category: ProductCategory;
  /** Volitelné subtypy (with_ppi / without_ppi / single_payment / …). */
  subtypes?: ProductSubtype[];
  /** Provider/product name pro partner-match — sloučeno mezerou. */
  haystack: string;
  /**
   * Všechny známé částky v Kč. Undefined = nevíme (např. nebyla v dokumentu).
   * Kalkulátor si vezme tu, kterou pravidlo vyžaduje podle `formula`.
   */
  amounts: {
    entryFee?: number;
    /** DPS — klientův příspěvek, MĚSÍČNĚ. */
    clientContributionMonthly?: number;
    /** Roční pojistné v Kč. */
    annualPremium?: number;
    /** Jistina úvěru v Kč. */
    loanPrincipal?: number;
    /** Výše investice v Kč (realitní fondy, single-premium). */
    investmentAmount?: number;
  };
};

export type BjCalculationOk = {
  ok: true;
  bjUnits: number;
  snapshot: ContractBjCalculation;
};

export type BjCalculationFail = {
  ok: false;
  reason:
    | "no_matching_rule"
    | "missing_amount"
    | "zero_result"
    | "invalid_rule";
  notes: string[];
  /**
   * I u chyby uložíme částečný snapshot pro audit — pomáhá debugovat,
   * proč BJ zatím není.
   */
  partialSnapshot?: Partial<ContractBjCalculation>;
};

export type BjCalculationResult = BjCalculationOk | BjCalculationFail;

/**
 * Vybere z pole pravidel to nejvíce specifické, které se hodí na vstup.
 *
 * Pořadí specificity (od nejvíc specifické):
 *   1. per-tenant + partner match + subtype match
 *   2. per-tenant + partner match
 *   3. per-tenant + subtype match
 *   4. per-tenant + category default (partner = null, subtype = null)
 *   5. global + partner match + subtype match
 *   6. global + partner match
 *   7. global + subtype match
 *   8. global + category default
 */
export function pickBestBjRule(
  rules: BjCoefficientRule[],
  input: { category: ProductCategory; subtypes?: ProductSubtype[]; haystack: string },
): BjCoefficientRule | null {
  const candidates = rules.filter((r) => r.productCategory === input.category);
  if (candidates.length === 0) return null;

  const subtypes = new Set(input.subtypes ?? []);
  const haystack = input.haystack.toLowerCase();

  const scored = candidates.map((rule) => {
    let score = 0;
    if (rule.tenantScope === "tenant") score += 100;
    // Partner match
    if (rule.partnerPattern) {
      let re: RegExp | null = null;
      try {
        re = new RegExp(rule.partnerPattern, "i");
      } catch {
        re = null;
      }
      if (re && re.test(haystack)) {
        score += 30;
      } else {
        // partnerPattern je, ale neshoduje se → pravidlo nelze použít vůbec
        return { rule, score: -1 };
      }
    } else {
      // žádný partner pattern = category default (ale score zůstává nižší)
      score += 1;
    }
    // Subtype match
    if (rule.subtype) {
      if (subtypes.has(rule.subtype)) {
        score += 10;
      } else {
        // má subtype požadavek, ale neshoduje se → eliminace
        return { rule, score: -1 };
      }
    } else {
      score += 0;
    }
    return { rule, score };
  });

  const viable = scored.filter((x) => x.score >= 0);
  if (viable.length === 0) return null;
  viable.sort((a, b) => b.score - a.score);
  return viable[0].rule;
}

/**
 * Vybere správnou částku ze vstupu podle formule z pravidla.
 * Pro `client_contribution` se vrací měsíční hodnota (pravidlo už s tím počítá).
 */
function selectAmountCzk(input: BjCalculationInput, formula: BjFormula): number | undefined {
  switch (formula) {
    case "entry_fee":
      return input.amounts.entryFee;
    case "client_contribution":
      return input.amounts.clientContributionMonthly;
    case "annual_premium":
      return input.amounts.annualPremium;
    case "loan_principal":
      return input.amounts.loanPrincipal;
    case "investment_amount":
      return input.amounts.investmentAmount;
  }
}

/**
 * Aplikuje cap/floor na částku. Pokud amount < floor → amount = 0 (nepočítá se).
 * Pokud amount > cap → amount = cap.
 */
function applyCapFloor(
  amount: number,
  rule: BjCoefficientRule,
): { amount: number; appliedCap: boolean; appliedFloor: boolean; notes: string[] } {
  const notes: string[] = [];
  let appliedCap = false;
  let appliedFloor = false;
  let result = amount;
  if (rule.floor != null && result < rule.floor) {
    notes.push(`Částka ${amount.toLocaleString("cs-CZ")} Kč je pod dolní hranicí ${rule.floor} Kč — BJ = 0.`);
    result = 0;
    appliedFloor = true;
  }
  if (rule.cap != null && result > rule.cap) {
    notes.push(`Částka ${amount.toLocaleString("cs-CZ")} Kč je nad cap ${rule.cap} Kč — započítáno jen ${rule.cap} Kč.`);
    result = rule.cap;
    appliedCap = true;
  }
  return { amount: result, appliedCap, appliedFloor, notes };
}

/**
 * Hlavní kalkulace.
 *
 * Vrací `ok:true` pokud je vše OK (včetně nulového výsledku kvůli floor —
 * to je legitimní a uložíme snapshot s poznámkou). `ok:false` jen když
 * pravidlo chybí nebo chybí relevantní částka.
 */
export function calculateBj(
  input: BjCalculationInput,
  rules: BjCoefficientRule[],
): BjCalculationResult {
  const notes: string[] = [];

  const rule = pickBestBjRule(rules, input);
  if (!rule) {
    return {
      ok: false,
      reason: "no_matching_rule",
      notes: [`Pro kategorii ${input.category} nebylo nalezeno žádné BJ pravidlo.`],
    };
  }

  if (rule.coefficient == null && rule.divisor == null) {
    return {
      ok: false,
      reason: "invalid_rule",
      notes: [`Pravidlo (${input.category} / ${rule.partnerPattern ?? "default"}) nemá coefficient ani divisor.`],
    };
  }

  const rawAmount = selectAmountCzk(input, rule.formula);
  if (rawAmount == null || !Number.isFinite(rawAmount) || rawAmount <= 0) {
    return {
      ok: false,
      reason: "missing_amount",
      notes: [
        `Pro formuli ${rule.formula} chybí na smlouvě relevantní částka v Kč.`,
      ],
      partialSnapshot: {
        formula: rule.formula,
        coefficient: rule.coefficient,
        divisor: rule.divisor,
        matchedRule: {
          productCategory: rule.productCategory,
          partnerPattern: rule.partnerPattern,
          subtype: rule.subtype,
          tenantScope: rule.tenantScope,
        },
        notes: ["Chybí částka — doplňte ji ručně nebo re-run AI review."],
        computedAt: new Date().toISOString(),
      },
    };
  }

  const { amount: amountCzk, appliedCap, appliedFloor, notes: capNotes } = applyCapFloor(rawAmount, rule);
  notes.push(...capNotes);

  // Samotná kalkulace
  let bj: number;
  if (rule.divisor != null && rule.divisor !== 0) {
    bj = amountCzk / rule.divisor;
  } else if (rule.coefficient != null) {
    bj = amountCzk * rule.coefficient;
  } else {
    // Už ošetřeno výše, defensive:
    return { ok: false, reason: "invalid_rule", notes: ["Nelze spočítat — pravidlo bez coefficient/divisor."] };
  }

  // Zaokrouhlení na 4 desetinná místa (DB precision 14,4).
  bj = Math.round(bj * 10000) / 10000;

  if (!Number.isFinite(bj)) {
    return {
      ok: false,
      reason: "zero_result",
      notes: ["Výsledek výpočtu BJ není konečné číslo."],
    };
  }

  if (rule.note) notes.push(rule.note);

  const snapshot: ContractBjCalculation = {
    formula: rule.formula,
    amountCzk,
    amountRawCzk: appliedCap || appliedFloor ? rawAmount : undefined,
    coefficient: rule.coefficient,
    divisor: rule.divisor,
    cap: rule.cap,
    floor: rule.floor,
    appliedCap,
    appliedFloor,
    matchedRule: {
      productCategory: rule.productCategory,
      partnerPattern: rule.partnerPattern,
      subtype: rule.subtype,
      tenantScope: rule.tenantScope,
    },
    notes,
    computedAt: new Date().toISOString(),
  };

  return { ok: true, bjUnits: bj, snapshot };
}
