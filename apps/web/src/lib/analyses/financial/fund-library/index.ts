/**
 * Centrální fondová knihovna — katalog base fondů, varianty, legacy mapa.
 * FA wizard a report berou metadata přes `fa-fund-bridge` (katalog + doplnění z `FUND_DETAILS` kde dává smysl).
 */

export * from "./types";
export * from "./legacy-fund-key-map";
export * from "./helpers";
export { BASE_FUNDS } from "./base-funds";
export { FUND_VARIANTS } from "./fund-variants";
