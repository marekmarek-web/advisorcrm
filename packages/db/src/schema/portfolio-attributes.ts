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
  [key: string]: unknown;
};
