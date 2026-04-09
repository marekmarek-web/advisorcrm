/**
 * Client-safe career ladder types (no server-only imports).
 * Čtyři nezávislé vrstvy: systemRole (v memberships.role) | careerProgram | careerTrack | careerPositionCode.
 */

/** Uložené v memberships.career_program — zjednocený produktový model */
export type CareerProgramId = "not_set" | "beplan" | "premium_brokers" | "unknown";

/**
 * Uložené v memberships.career_track — větev uvnitř programu (nelze slučovat s pozicí).
 * reality / call_center jsou samostatné osy, ne „podprogramy“ v DB.
 */
export type CareerTrackId =
  | "not_set"
  | "individual_performance"
  | "management_structure"
  | "reality"
  | "call_center"
  | "unknown";

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
  /** Poznámka ke zdroji (PDF, interní pravidla) */
  sourceNote?: string;
};

/**
 * Jedna pozice v konkrétním programu + tracku.
 * Kód je stabilní v rámci celé aplikace (globálně jednoznačný doporučeně).
 */
export type CareerPositionDef = {
  programId: CareerProgramId;
  trackId: CareerTrackId;
  code: string;
  label: string;
  progressionOrder: number;
  nextCareerPositionCode: string | null;
  /** Strukturované požadavky na další postup (zdroj pravdy pro evaluator) */
  requirements: CareerRequirement[];
};

/** Výstup evaluatoru — stav postupu (bez předstírání přesnosti) */
export type ProgressEvaluation =
  | "on_track"
  | "close_to_promotion"
  | "blocked"
  | "promoted_ready"
  | "data_missing"
  | "unknown"
  | "not_configured";

/** Jak moc je evaluace kompletní / spolehlivá */
export type EvaluationCompleteness = "full" | "partial" | "low_confidence" | "manual_required";

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
    | "config_incomplete"
    | "missing_specification"
    | "legacy_value";
};

export type CareerEvaluationResult = {
  /** Stav postupu (UI) */
  progressEvaluation: ProgressEvaluation;
  evaluationCompleteness: EvaluationCompleteness;
  careerProgramId: CareerProgramId;
  careerTrackId: CareerTrackId;
  rawCareerProgram: string | null;
  rawCareerTrack: string | null;
  rawCareerPositionCode: string | null;
  careerPositionLabel: string | null;
  progressionOrder: number | null;
  nextCareerPositionCode: string | null;
  nextCareerPositionLabel: string | null;
  missingRequirements: MissingRequirement[];
  sourceNotes: string[];
  /** Odvozené z aplikační role — jen pro zobrazení, neslučovat s kariérou */
  systemRoleName: string;
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
  beplan: "Beplan",
  premium_brokers: "Premium Brokers",
  unknown: "Neznámý program",
};

export const CAREER_TRACK_LABELS: Record<CareerTrackId, string> = {
  not_set: "Větev nevyplněna",
  individual_performance: "Top poradce / individuální výkon",
  management_structure: "Manažerská / strukturální",
  reality: "Realitní větev",
  call_center: "Call centrum",
  unknown: "Neznámá větev",
};
