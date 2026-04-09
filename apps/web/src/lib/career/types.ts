/**
 * Client-safe career ladder types (no server-only imports).
 * Source of truth for ladder definitions: sibling modules + registry.
 */

export type CareerProgramId =
  | "not_set"
  | "beplan_finance"
  | "beplan_realty"
  | "premium_brokers"
  | "premium_brokers_call_center";

export type CareerTrackId = "not_set" | "individual_performance" | "management_structure";

export type RequirementKind =
  | "personal_performance"
  | "team_structure"
  | "compliance"
  | "historical_performance"
  | "subordinate_career_data";

export type RequirementEvaluability =
  | "crm_proxy"
  | "manual"
  | "not_applicable"
  | "unspecified"
  | "auto_subordinates_have_position";

export type CareerRequirement = {
  id: string;
  labelCs: string;
  kind: RequirementKind;
  evaluability: RequirementEvaluability;
  /** If true, requirement applies only when track is management_structure */
  managementOnly?: boolean;
  /** Note stored in config (e.g. PDF reference) */
  sourceNote?: string;
};

export type CareerPositionDef = {
  programId: CareerProgramId;
  code: string;
  label: string;
  /** Zero-based order within program ladder */
  progressionOrder: number;
  nextCareerPositionCode: string | null;
  requirements: CareerRequirement[];
};

export type ProgressStatus =
  | "not_set"
  | "data_missing"
  | "on_track"
  | "close_to_promotion"
  | "blocked";

export type CompletenessLevel = "none" | "partial" | "high";

export type ConfidenceLevel = "low" | "medium" | "high";

export type MissingRequirement = {
  id: string;
  labelCs: string;
  reason:
    | "manual"
    | "unspecified"
    | "crm_not_bj"
    | "subordinates_missing_career_data"
    | "invalid_config"
    | "program_not_set"
    | "config_incomplete";
};

export type CareerEvaluationResult = {
  progressStatus: ProgressStatus;
  completeness: CompletenessLevel;
  confidence: ConfidenceLevel;
  careerProgramId: CareerProgramId;
  careerTrackId: CareerTrackId;
  /** Raw DB strings (may be unknown) */
  rawCareerProgram: string | null;
  rawCareerTrack: string | null;
  rawCareerPositionCode: string | null;
  positionLabel: string | null;
  nextCareerPositionCode: string | null;
  nextPositionLabel: string | null;
  missingRequirements: MissingRequirement[];
  sourceNotes: string[];
};

export type CareerEvaluationMetricsSlice = {
  unitsThisPeriod: number;
  productionThisPeriod: number;
  meetingsThisPeriod: number;
} | null;

export type CareerEvaluationContext = {
  systemRoleName: string;
  careerProgram: string | null;
  careerTrack: string | null;
  careerPositionCode: string | null;
  metrics: CareerEvaluationMetricsSlice;
  directReportsCount: number;
  directReportCareerPositionCodes: (string | null)[];
};

export const CAREER_PROGRAM_LABELS: Record<CareerProgramId, string> = {
  not_set: "Nevyplněno",
  beplan_finance: "Beplan — finance",
  beplan_realty: "Beplan — realty",
  premium_brokers: "Premium Brokers",
  premium_brokers_call_center: "Premium Brokers — Call centrum",
};

export const CAREER_TRACK_LABELS: Record<CareerTrackId, string> = {
  not_set: "Track nevyplněn",
  individual_performance: "Individuální výkon",
  management_structure: "Manažerská / strukturální",
};
