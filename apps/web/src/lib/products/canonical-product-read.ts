/**
 * Re-export layer bridging the canonical contract read model
 * to the broader products namespace.
 *
 * The canonical source of truth is `canonical-contract-read.ts`
 * in client-portfolio. This module re-exports it for consumers
 * that import from `@/lib/products/`.
 */

export {
  mapContractToCanonicalProduct,
  mapContractsToCanonicalProducts,
  filterFvEligibleProducts,
  type CanonicalProduct,
  type SegmentDetail,
  type InvestmentDetail,
  type LifeInsuranceDetail,
  type VehicleDetail,
  type PropertyDetail,
  type PensionDetail,
  type LoanDetail,
  type FvReadiness,
  type RawContractInput,
} from "@/lib/client-portfolio/canonical-contract-read";
