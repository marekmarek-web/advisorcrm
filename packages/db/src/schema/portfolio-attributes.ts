/**
 * Kanonický typ JSONB `contracts.portfolio_attributes`.
 * Aplikační mapování z extraktu: `apps/web/src/lib/portfolio/build-portfolio-attributes-from-extract.ts`.
 */

export type CoverageLineUi = { label?: string; amount?: string; description?: string };

export type PortfolioPersonRole =
  | "policyholder"
  | "insured"
  | "child"
  | "beneficiary"
  | "other";

export type PortfolioPersonEntry = {
  role: PortfolioPersonRole;
  name?: string;
  birthDate?: string;
  personalId?: string;
};

export type PortfolioRiskEntry = {
  label: string;
  amount?: string;
  /** Konec pojištění u dílčího krytí, pokud je v dokumentu uveden */
  coverageEnd?: string;
  /** Měsíční rizikové pojistné u dílčího krytí */
  monthlyRiskPremium?: string;
  personRef?: string;
  description?: string;
};

export type PortfolioAttributes = {
  loanPrincipal?: string;
  sumInsured?: string;
  insuredPersons?: unknown;
  persons?: PortfolioPersonEntry[];
  risks?: PortfolioRiskEntry[];
  coverageLines?: CoverageLineUi[];
  vehicleRegistration?: string;
  propertyAddress?: string;
  subcategory?: string;
  loanFixationUntil?: string;
  loanMaturityDate?: string;

  /** DPS / DIP — příspěvek účastníka (měsíčně) */
  participantContribution?: string;
  /** DPS / DIP — příspěvek zaměstnavatele (měsíčně) */
  employerContribution?: string;
  /** DPS — odhadovaný státní příspěvek (derived: 20 % z participantContribution, max 340 CZK/měs.) */
  stateContributionEstimate?: string;
  /** Investiční strategie (profil / název strategie) */
  investmentStrategy?: string;
  /** Investiční fondy s případnou alokací */
  investmentFunds?: Array<{ name: string; allocation?: string }>;
  /** Investiční horizont (např. „20 let", „do roku 2045") */
  investmentHorizon?: string;
  /** Cílová částka investice */
  targetAmount?: string;
  /** Předpokládaná budoucí hodnota (z modelace / ilustrace) */
  expectedFutureValue?: string;

  // ─── Fund-library resolution (Fáze 1 backbone) ────────────────────────────
  /**
   * FK/slug do fond-library katalogu (nullable).
   * Vyplněno jen pokud fond existuje v knihovně.
   */
  resolvedFundId?: string | null;
  /**
   * Fallback kategorie fondu pro heuristický FV výpočet.
   * Vyplněno, když fond neexistuje v knihovně.
   */
  resolvedFundCategory?: ResolvedFundCategory | null;
  /**
   * Zdroj dat pro FV výpočet:
   * - 'fund-library' = fond nalezen v knihovně
   * - 'heuristic-fallback' = klasifikace do kategorie
   * - 'manual' = ruční zadání poradcem
   * - null = FV nelze vypočítat
   */
  fvSourceType?: FvSourceType | null;

  // ─── Identity fields (pro propsat do kontaktu) ─────────────────────────────
  /** Variabilní symbol pro běžné pojistné (read-only přehled) */
  paymentVariableSymbol?: string;
  /** Zobrazení účtu pro úhradu (bez přepisu) */
  paymentAccountDisplay?: string;
  /** Frekvence plateb — lidský text z dokumentu */
  paymentFrequencyLabel?: string;
  /** Druhý účet (např. mimořádné pojistné), pokud je v dokumentu */
  extraPaymentAccountDisplay?: string;
  /** Investiční pojistné / složka — text z dokumentu */
  investmentPremiumLabel?: string;

  /** Praktický lékař (u ŽP, pokud je v dokumentu) */
  generalPractitioner?: string;

  /** Číslo občanského průkazu / pasu / dokladu totožnosti (z extrakce) */
  idCardNumber?: string;
  /** Kdo doklad vydal (úřad, instituce) */
  idCardIssuedBy?: string;
  /** Platnost dokladu do (ISO nebo text z dokumentu) */
  idCardValidUntil?: string;
  /** Datum vydání dokladu */
  idCardIssuedAt?: string;

  // ─── Loans extended (Phase 3 / Slice 1) ─────────────────────────────────────
  /** Úroková sazba úvěru/hypotéky */
  loanInterestRate?: string;

  [key: string]: unknown;
};

export const RESOLVED_FUND_CATEGORIES = [
  "equity",
  "balanced",
  "conservative",
  "bond",
  "real_estate",
  "dps_dynamic",
  "dps_balanced",
  "dps_conservative",
  "unknown",
] as const;
export type ResolvedFundCategory = (typeof RESOLVED_FUND_CATEGORIES)[number];

export const FV_SOURCE_TYPES = [
  "fund-library",
  "heuristic-fallback",
  "manual",
] as const;
export type FvSourceType = (typeof FV_SOURCE_TYPES)[number];
