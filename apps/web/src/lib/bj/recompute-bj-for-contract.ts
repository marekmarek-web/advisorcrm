/**
 * Single-contract BJ recompute helper.
 *
 * Vytáhne aktuální řádek z `contracts`, sestaví vstupy pro kalkulátor a zapíše
 * `bj_units` + `bj_calculation` zpět. Používá se po createContract /
 * updateContract / apply-contract-review, kdykoli se mohlo změnit něco, co
 * ovlivňuje BJ (kategorie, částky, paymentType).
 *
 * Nevyvolává výjimky — při jakékoli chybě jen logne a nechá smlouvu být
 * (BJ je derived, ne kritický sloupec). Explicit return hodnota je
 * `{ bjUnits, updated }` pro testy.
 */

import { db } from "db";
import { contracts } from "db";
import { eq, and } from "db";
import type { PortfolioAttributes } from "db";
import { computeContractBj } from "./compute-contract-bj";
import type { ProductCategory, ProductSubtype } from "@/lib/ai/product-categories";

export type RecomputeBjResult = {
  bjUnits: number | null;
  updated: boolean;
};

export async function recomputeBjForContract(params: {
  tenantId: string;
  contractId: string;
}): Promise<RecomputeBjResult> {
  try {
    const [row] = await db
      .select({
        tenantId: contracts.tenantId,
        partnerName: contracts.partnerName,
        productName: contracts.productName,
        premiumAmount: contracts.premiumAmount,
        premiumAnnual: contracts.premiumAnnual,
        portfolioAttributes: contracts.portfolioAttributes,
        productCategory: contracts.productCategory,
        productSubtype: contracts.productSubtype,
      })
      .from(contracts)
      .where(and(eq(contracts.tenantId, params.tenantId), eq(contracts.id, params.contractId)))
      .limit(1);

    if (!row) return { bjUnits: null, updated: false };

    const attrs = (row.portfolioAttributes as PortfolioAttributes | null) ?? {};
    const paymentType =
      attrs.paymentType === "one_time" || attrs.paymentType === "regular"
        ? (attrs.paymentType as "one_time" | "regular")
        : null;

    const category = row.productCategory as ProductCategory | null;

    const { bjUnits, snapshot } = await computeContractBj({
      tenantId: params.tenantId,
      category,
      subtypes: (row.productSubtype as ProductSubtype[] | null) ?? [],
      providerName: row.partnerName,
      productName: row.productName,
      amounts: {
        premiumAmount: row.premiumAmount,
        premiumAnnual: row.premiumAnnual,
        loanPrincipal: (attrs as Record<string, unknown>).loanPrincipal as string | undefined,
        participantContributionMonthly: (attrs as Record<string, unknown>).participantContribution as
          | string
          | undefined,
        targetAmount: (attrs as Record<string, unknown>).targetAmount as string | undefined,
        entryFee: (attrs as Record<string, unknown>).entryFee as string | undefined,
        paymentType,
      },
    });

    await db
      .update(contracts)
      .set({
        bjUnits: bjUnits == null ? null : String(bjUnits),
        bjCalculation: snapshot,
        updatedAt: new Date(),
      })
      .where(and(eq(contracts.tenantId, params.tenantId), eq(contracts.id, params.contractId)));

    return { bjUnits, updated: true };
  } catch (err) {
    console.error("[recomputeBjForContract]", { contractId: params.contractId, err });
    return { bjUnits: null, updated: false };
  }
}
