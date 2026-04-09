import { getCareerPositionDef, isKnownCareerProgramId, isKnownCareerTrackId } from "./registry";
import {
  CAREER_PROGRAM_LABELS,
  CAREER_TRACK_LABELS,
  type CareerEvaluationContext,
  type CareerEvaluationResult,
  type CareerProgramId,
  type CareerTrackId,
  type CareerRequirement,
  type CompletenessLevel,
  type ConfidenceLevel,
  type MissingRequirement,
  type ProgressStatus,
} from "./types";

function parseProgram(raw: string | null): { id: CareerProgramId; unknown: boolean } {
  if (raw == null || raw.trim() === "" || raw === "not_set") return { id: "not_set", unknown: false };
  if (isKnownCareerProgramId(raw)) return { id: raw, unknown: false };
  return { id: "not_set", unknown: true };
}

function parseTrack(raw: string | null): { id: CareerTrackId; unknown: boolean } {
  if (raw == null || raw.trim() === "" || raw === "not_set") return { id: "not_set", unknown: false };
  if (isKnownCareerTrackId(raw)) return { id: raw as CareerTrackId, unknown: false };
  return { id: "not_set", unknown: true };
}

function reasonForEvaluability(r: CareerRequirement): MissingRequirement["reason"] | null {
  switch (r.evaluability) {
    case "manual":
      return "manual";
    case "unspecified":
      return "unspecified";
    case "crm_proxy":
      return null;
    case "not_applicable":
    case "auto_subordinates_have_position":
      return null;
    default:
      return "unspecified";
  }
}

function appliesRequirement(r: CareerRequirement, trackId: CareerTrackId): boolean {
  if (r.managementOnly && trackId !== "management_structure") return false;
  return true;
}

function isBlockingMissing(m: MissingRequirement): boolean {
  return (
    m.reason === "program_not_set" ||
    m.reason === "config_incomplete" ||
    m.reason === "invalid_config" ||
    m.reason === "subordinates_missing_career_data"
  );
}

function deriveProgress(
  missing: MissingRequirement[],
  hasPosition: boolean,
  programId: CareerProgramId,
  trackId: CareerTrackId
): { status: ProgressStatus; completeness: CompletenessLevel; confidence: ConfidenceLevel } {
  if (programId === "not_set") {
    return { status: "not_set", completeness: "none", confidence: "high" };
  }
  if (!hasPosition || trackId === "not_set") {
    return { status: "data_missing", completeness: "partial", confidence: "high" };
  }

  const blocking = missing.filter(isBlockingMissing);
  if (blocking.some((m) => m.reason === "invalid_config" || m.reason === "program_not_set")) {
    return { status: "data_missing", completeness: "partial", confidence: "medium" };
  }
  if (blocking.length > 0) {
    return { status: "data_missing", completeness: "partial", confidence: "medium" };
  }

  const manualLike = missing.some((m) => m.reason === "manual" || m.reason === "unspecified");
  if (manualLike) {
    return { status: "on_track", completeness: "partial", confidence: "low" };
  }

  return { status: "on_track", completeness: "high", confidence: "medium" };
}

/**
 * Jednotný vstup pro vyhodnocení kariéry — bez falešných BJ/BJS z CRM.
 */
export function evaluateCareerProgress(ctx: CareerEvaluationContext): CareerEvaluationResult {
  const sourceNotes: string[] = [
    "Aplikační role (permissions) a kariérní program/track/pozice jsou oddělené dimenze.",
    "Metriky týmového přehledu nejsou oficiální BJ/BJS z kariérních PDF.",
  ];

  const { id: programId, unknown: unknownProgram } = parseProgram(ctx.careerProgram);
  const { id: trackId, unknown: unknownTrack } = parseTrack(ctx.careerTrack);
  const rawCode = ctx.careerPositionCode?.trim() || null;

  if (unknownProgram && ctx.careerProgram) {
    sourceNotes.push(`Neznámá hodnota career_program v DB: "${ctx.careerProgram}".`);
  }
  if (unknownTrack && ctx.careerTrack) {
    sourceNotes.push(`Neznámá hodnota career_track v DB: "${ctx.careerTrack}".`);
  }

  const missing: MissingRequirement[] = [];

  if (programId === "not_set") {
    missing.push({
      id: "program_not_set",
      labelCs: "Není vyplněn kariérní program.",
      reason: "program_not_set",
    });
  }
  if (programId !== "not_set" && trackId === "not_set") {
    missing.push({
      id: "track_not_set",
      labelCs: "Není vyplněn kariérní track (individuální vs manažerská dráha).",
      reason: "config_incomplete",
    });
  }
  if (programId !== "not_set" && !rawCode) {
    missing.push({
      id: "position_not_set",
      labelCs: "Není vyplněn kód kariérní pozice.",
      reason: "config_incomplete",
    });
  }

  const positionDef = programId !== "not_set" && rawCode ? getCareerPositionDef(programId, rawCode) : null;
  if (programId !== "not_set" && rawCode && !positionDef) {
    missing.push({
      id: "unknown_position_code",
      labelCs: `Kód pozice "${rawCode}" nepatří do zvoleného programu v konfiguraci aplikace.`,
      reason: "invalid_config",
    });
  }

  if (positionDef) {
    for (const req of positionDef.requirements) {
      if (!appliesRequirement(req, trackId)) continue;

      if (req.evaluability === "crm_proxy") {
        sourceNotes.push(req.labelCs);
        continue;
      }

      if (req.evaluability === "auto_subordinates_have_position") {
        if (ctx.directReportsCount === 0) continue;
        const anyMissing = ctx.directReportCareerPositionCodes.some((c) => c == null || c.trim() === "");
        if (anyMissing) {
          missing.push({
            id: req.id,
            labelCs: req.labelCs,
            reason: "subordinates_missing_career_data",
          });
        }
        continue;
      }

      const mapped = reasonForEvaluability(req);
      if (mapped) {
        missing.push({
          id: req.id,
          labelCs: req.labelCs,
          reason: mapped,
        });
      }
      if (req.sourceNote) {
        sourceNotes.push(`${req.id}: ${req.sourceNote}`);
      }
    }
  }

  const hasPosition = Boolean(rawCode && positionDef);
  const { status, completeness, confidence } = deriveProgress(missing, hasPosition, programId, trackId);

  const nextCode = positionDef?.nextCareerPositionCode ?? null;
  const safeNextLabel =
    programId !== "not_set" && nextCode ? getCareerPositionDef(programId, nextCode)?.label ?? null : null;

  return {
    progressStatus: status,
    completeness,
    confidence,
    careerProgramId: programId,
    careerTrackId: trackId,
    rawCareerProgram: ctx.careerProgram,
    rawCareerTrack: ctx.careerTrack,
    rawCareerPositionCode: rawCode,
    positionLabel: positionDef?.label ?? null,
    nextCareerPositionCode: programId !== "not_set" ? nextCode : null,
    nextPositionLabel: programId !== "not_set" ? safeNextLabel : null,
    missingRequirements: missing,
    sourceNotes,
  };
}

export function formatCareerProgramLabel(programId: CareerProgramId): string {
  return CAREER_PROGRAM_LABELS[programId] ?? programId;
}

export function formatCareerTrackLabel(trackId: CareerTrackId): string {
  return CAREER_TRACK_LABELS[trackId] ?? trackId;
}

/** Kompaktní řádek pro tabulku (např. „PB · Reprezentant 2“) */
export function formatCareerSummaryLine(
  program: string | null,
  positionCode: string | null,
  programLabelFallback?: string
): string | null {
  const parsed = parseProgram(program);
  const progLabel =
    parsed.id !== "not_set" ? formatCareerProgramLabel(parsed.id) : programLabelFallback ?? (program ? program : null);
  if (!progLabel && !positionCode) return null;
  if (!positionCode) return progLabel;
  const def = parsed.id !== "not_set" ? getCareerPositionDef(parsed.id, positionCode) : null;
  const pos = def?.label ?? positionCode;
  if (!progLabel) return pos;
  return `${progLabel} · ${pos}`;
}
