/**
 * Orchestrátor: ze smlouvy (typy portfolio + raw values) spočítá BJ a
 * vrátí objekt připravený k zápisu do contracts.bj_units / contracts.bj_calculation.
 *
 * Používá se jak při AI-review apply (po confirm all), tak při manual createContract /
 * updateContract (po změně premium / loanPrincipal / paymentType).
 *
 * Tato vrstva sedí *nad* kalkulátorem a repository — volá:
 *   1) loadBjCoefficientRules(tenantId)    → sazebník
 *   2) buildBjCalculationInput(...)        → normalizace částek
 *   3) calculateBj(input, rules)           → samotná kalkulace
 *
 * Vrací:
 *   { bjUnits: number | null, snapshot: ContractBjCalculation | null }
 *
 * `null` u snapshot se stane jen pokud chybí kategorie produktu (pak nemá
 * smysl volat sazebník). Jinak je snapshot vždy uložen (i pro fail) — to je
 * hodnotný audit, proč BJ nejsou.
 */

import type { ContractBjCalculation } from "db";
import type {
  ProductCategory,
  ProductSubtype,
} from "@/lib/ai/product-categories";
import { loadBjCoefficientRules } from "./coefficients-repository";
import { buildBjCalculationInput, type BjAmountSources } from "./extract-bj-amounts";
import { calculateBj } from "./calculate-bj";

export type ComputeContractBjParams = {
  tenantId: string;
  category: ProductCategory | null | undefined;
  subtypes?: ProductSubtype[] | null;
  providerName?: string | null;
  productName?: string | null;
  amounts: BjAmountSources;
};

export type ComputeContractBjResult = {
  bjUnits: number | null;
  snapshot: ContractBjCalculation | null;
};

/**
 * Vypočte BJ pro jednu smlouvu.
 *
 * Ignoruje všechny výjimky z DB — když se sazebník nepodaří načíst, vrací
 * `{ null, null }` a volající pokračuje bez BJ (smlouva se stále uloží).
 */
export async function computeContractBj(
  params: ComputeContractBjParams,
): Promise<ComputeContractBjResult> {
  if (!params.category || params.category === "UNKNOWN_REVIEW") {
    return {
      bjUnits: null,
      snapshot: {
        formula: "annual_premium",
        amountCzk: 0,
        coefficient: null,
        divisor: null,
        matchedRule: {
          productCategory: params.category ?? "UNKNOWN_REVIEW",
          partnerPattern: null,
          subtype: null,
          tenantScope: "global",
        },
        notes: [
          "BJ nelze spočítat — chybí klasifikace produktu (UNKNOWN_REVIEW).",
        ],
        computedAt: new Date().toISOString(),
      },
    };
  }

  let rules;
  try {
    rules = await loadBjCoefficientRules(params.tenantId);
  } catch (err) {
    console.error("[computeContractBj] loadBjCoefficientRules failed:", err);
    return { bjUnits: null, snapshot: null };
  }

  const input = buildBjCalculationInput({
    category: params.category,
    subtypes: params.subtypes ?? [],
    providerName: params.providerName,
    productName: params.productName,
    amounts: params.amounts,
  });

  const result = calculateBj(input, rules);
  if (result.ok) {
    return { bjUnits: result.bjUnits, snapshot: result.snapshot };
  }

  const auditSnapshot: ContractBjCalculation = {
    formula: result.partialSnapshot?.formula ?? "annual_premium",
    amountCzk: result.partialSnapshot?.amountCzk ?? 0,
    coefficient: result.partialSnapshot?.coefficient ?? null,
    divisor: result.partialSnapshot?.divisor ?? null,
    matchedRule:
      result.partialSnapshot?.matchedRule ?? {
        productCategory: params.category,
        partnerPattern: null,
        subtype: null,
        tenantScope: "global",
      },
    notes: [`BJ výpočet selhal: ${result.reason}.`, ...result.notes],
    computedAt: new Date().toISOString(),
  };

  return { bjUnits: null, snapshot: auditSnapshot };
}
