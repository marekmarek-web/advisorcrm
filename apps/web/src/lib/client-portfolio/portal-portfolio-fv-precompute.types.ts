/**
 * Čistě typová vrstva pro precompute FV/logo pomocných dat.
 * Oddělena od serverového modulu `portal-portfolio-fv-precompute.ts`
 * (který je `server-only` kvůli `BASE_FUNDS`), aby ji mohl importovat
 * i klientský bundle bez přitahování fondové knihovny.
 */

export type PortalFvContractAux = {
  resolvedAnnualRatePercent: number | null;
  resolvedFundDisplayName: string | null;
  fundLogoPath: string | null;
};

export type PortalFvContractAuxMap = Record<string, PortalFvContractAux>;
