import "server-only";

/**
 * Serverový precompute FV/logo pomocných dat pro klientské bundly (mobilní portál,
 * klientské portfolio). Klient tak může používat čistý math modul
 * `shared-future-value-pure.ts` bez importu `BASE_FUNDS` (stovky kB JS).
 *
 * Jediné místo, kde se v tomto toku dotýká fondové knihovny, je tento soubor
 * — díky `server-only` se nedostane do klientského JS.
 */

import type { ContractRow } from "@/app/actions/contracts";
import { mapContractToCanonicalProduct } from "@/lib/client-portfolio/read-model";
import {
  fundLibraryLogoPathForPortal,
  resolveSharedFvAnnualRatePercent,
} from "@/lib/fund-library/shared-future-value";
import { displayNameForResolvedFundId } from "@/lib/fund-library/fund-resolution";
import type {
  PortalFvContractAux,
  PortalFvContractAuxMap,
} from "@/lib/client-portfolio/portal-portfolio-fv-precompute.types";

export type { PortalFvContractAux, PortalFvContractAuxMap };

function auxForContract(contract: ContractRow): PortalFvContractAux {
  const canonical = mapContractToCanonicalProduct({
    id: contract.id,
    contactId: contract.contactId,
    segment: contract.segment,
    type: contract.type,
    partnerId: contract.partnerId,
    productId: contract.productId,
    partnerName: contract.partnerName,
    productName: contract.productName,
    premiumAmount: contract.premiumAmount,
    premiumAnnual: contract.premiumAnnual,
    contractNumber: contract.contractNumber,
    startDate: contract.startDate,
    anniversaryDate: contract.anniversaryDate,
    note: contract.note,
    visibleToClient: contract.visibleToClient,
    portfolioStatus: contract.portfolioStatus,
    sourceKind: contract.sourceKind,
    portfolioAttributes: contract.portfolioAttributes,
  });

  const rate = resolveSharedFvAnnualRatePercent(
    canonical.fvReadiness.fvSourceType ?? null,
    canonical.fvReadiness.resolvedFundId ?? null,
    canonical.fvReadiness.resolvedFundCategory ?? null,
    null,
  );

  const fundId =
    canonical.segmentDetail?.kind === "investment"
      ? canonical.segmentDetail.resolvedFundId || canonical.fvReadiness.resolvedFundId
      : null;

  return {
    resolvedAnnualRatePercent: rate,
    resolvedFundDisplayName: displayNameForResolvedFundId(
      canonical.fvReadiness.resolvedFundId ?? null,
    ),
    fundLogoPath: fundLibraryLogoPathForPortal(fundId),
  };
}

export function buildPortalFvContractAuxMap(contracts: ContractRow[]): PortalFvContractAuxMap {
  const out: PortalFvContractAuxMap = {};
  for (const c of contracts) {
    out[c.id] = auxForContract(c);
  }
  return out;
}
