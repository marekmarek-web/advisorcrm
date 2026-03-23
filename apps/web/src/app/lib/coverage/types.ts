/** Stav položky pokrytí (v souladu s DB). */
export type CoverageStatus = "done" | "in_progress" | "none" | "not_relevant" | "opportunity";

/** Zdroj výsledného stavu položky. */
export type CoverageSource = "stored" | "contract" | "opportunity" | "default";

/** Jedna položka po resolvu – vstup pro UI. */
export type ResolvedCoverageItem = {
  itemKey: string;
  segmentCode: string;
  category: string;
  label: string;
  status: CoverageStatus;
  linkedContractId: string | null;
  linkedOpportunityId: string | null;
  source: CoverageSource;
  isRelevant: boolean;
  notes: string | null;
  faItemId?: string | null;
};

/** Souhrn počtů pro summary bar. */
export type CoverageSummary = {
  done: number;
  inProgress: number;
  none: number;
  notRelevant: number;
  opportunity: number;
  total: number;
};

/** Řádek z DB contact_coverage. */
export type ContactCoverageRow = {
  id: string;
  tenantId: string;
  contactId: string;
  itemKey: string;
  segmentCode: string;
  status: string;
  linkedContractId: string | null;
  linkedOpportunityId: string | null;
  notes: string | null;
  isRelevant: boolean | null;
  faItemId?: string | null;
  updatedAt: Date;
  updatedBy: string | null;
};

/** Zjednodušený kontrakt pro engine (segment). */
export type ContractForCoverage = { id: string; segment: string };

/** Otevřená příležitost pro engine (caseType → segmenty). */
export type OpportunityForCoverage = { id: string; caseType: string };
