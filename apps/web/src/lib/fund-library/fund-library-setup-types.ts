/** Sdílené typy a konstanty pro Nastavení fondové knihovny (bez server-only). */

export const TENANT_ALLOWLIST_KEY = "fund_library.allowlist";
export const TENANT_ALLOWLIST_DOMAIN = "tenant_profile";

export type TenantFundAllowlistValue = {
  /** null = povoleny všechny fondy z katalogu */
  allowedBaseFundKeys: string[] | null;
};

export type AdvisorFundLibraryValue = {
  enabled: Record<string, boolean>;
  order: string[];
};

export type FundCatalogListItemDTO = {
  baseFundKey: string;
  displayName: string;
  provider: string;
  category: string;
  subcategory?: string;
  logoPath?: string;
};

/** Stavy interní fronty „chci přidat fond“ (bez automatického schvalování). */
export type FundAddRequestQueueStatus = "new" | "in_progress" | "added" | "rejected";

export type FundAddRequestQueueRow = {
  id: string;
  userId: string;
  fundName: string;
  provider: string | null;
  isinOrTicker: string | null;
  factsheetUrl: string | null;
  category: string | null;
  note: string | null;
  status: FundAddRequestQueueStatus;
  createdAt: string;
  updatedAt: string;
};

export type FundLibrarySetupSnapshot = {
  canEditTenantAllowlist: boolean;
  tenantAllowlist: TenantFundAllowlistValue;
  advisorPrefs: AdvisorFundLibraryValue;
  effectiveAllowedKeys: string[];
  catalog: FundCatalogListItemDTO[];
  /**
   * Požadavky poradců na doplnění fondu — jen pro Director/Admin.
   * U ostatních rolí je `undefined` (menší payload).
   */
  fundAddRequestQueue?: FundAddRequestQueueRow[];
};
