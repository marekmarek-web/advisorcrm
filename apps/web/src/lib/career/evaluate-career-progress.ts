import {
  getCareerPositionDef,
  inferBeplanTrackFromPositionCode,
  inferTrackFromLegacyProgram,
  isKnownCareerTrackId,
  normalizeCareerProgramFromDb,
} from "./registry";
import {
  CAREER_PROGRAM_LABELS,
  CAREER_TRACK_LABELS,
  type CareerEvaluationContext,
  type CareerEvaluationResult,
  type CareerProgramId,
  type CareerTrackId,
  type CareerRequirement,
  type EvaluationCompleteness,
  type MissingRequirement,
  type ProgressEvaluation,
} from "./types";

function parseTrackRaw(raw: string | null): { id: CareerTrackId; unknownString: boolean } {
  if (raw == null || raw.trim() === "" || raw === "not_set") return { id: "not_set", unknownString: false };
  if (isKnownCareerTrackId(raw)) return { id: raw as CareerTrackId, unknownString: false };
  return { id: "unknown", unknownString: true };
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

function isBlockingMissing(m: MissingRequirement): boolean {
  return (
    m.reason === "program_not_set" ||
    m.reason === "config_incomplete" ||
    m.reason === "invalid_config" ||
    m.reason === "subordinates_missing_career_data" ||
    m.reason === "missing_specification"
  );
}

function deriveEvaluationOutcome(
  missing: MissingRequirement[],
  hasValidPosition: boolean,
  programId: CareerProgramId,
  trackId: CareerTrackId,
  programUnknown: boolean,
  trackUnknownFromDb: boolean
): { progressEvaluation: ProgressEvaluation; evaluationCompleteness: EvaluationCompleteness } {
  if (programUnknown) {
    return { progressEvaluation: "unknown", evaluationCompleteness: "low_confidence" };
  }
  if (programId === "not_set") {
    return { progressEvaluation: "not_configured", evaluationCompleteness: "partial" };
  }
  if (trackUnknownFromDb || trackId === "unknown") {
    return { progressEvaluation: "unknown", evaluationCompleteness: "low_confidence" };
  }
  if (!hasValidPosition || trackId === "not_set") {
    return { progressEvaluation: "data_missing", evaluationCompleteness: "partial" };
  }

  const blocking = missing.filter(isBlockingMissing);
  if (blocking.some((m) => m.reason === "invalid_config")) {
    return { progressEvaluation: "blocked", evaluationCompleteness: "partial" };
  }
  if (blocking.some((m) => m.reason === "program_not_set")) {
    return { progressEvaluation: "data_missing", evaluationCompleteness: "partial" };
  }
  if (blocking.length > 0) {
    return { progressEvaluation: "data_missing", evaluationCompleteness: "partial" };
  }

  const needsManual = missing.some(
    (m) => m.reason === "manual" || m.reason === "unspecified" || m.reason === "legacy_value"
  );
  if (needsManual) {
    return { progressEvaluation: "on_track", evaluationCompleteness: "manual_required" };
  }

  return { progressEvaluation: "on_track", evaluationCompleteness: "full" };
}

/**
 * Jednotný vstup pro vyhodnocení kariéry — track oddělen od programu a pozice; bez falešných BJ/BJS z CRM.
 */
export function evaluateCareerProgress(ctx: CareerEvaluationContext): CareerEvaluationResult {
  const sourceNotes: string[] = [
    "Čtyři vrstvy: aplikační role (permissions), kariérní program, kariérní větev (track), kód pozice — vzájemně se neslučují.",
    "Metriky týmového přehledu nejsou oficiální BJ/BJS z kariérních PDF.",
  ];

  const { programId: normalizedProgram, legacyRaw } = normalizeCareerProgramFromDb(ctx.careerProgram);
  let programId = normalizedProgram;
  const programUnknown = programId === "unknown";

  if (legacyRaw) {
    sourceNotes.push(
      `Legacy career_program „${legacyRaw}“ — použijte kanonické hodnoty beplan / premium_brokers a správný career_track.`
    );
  }

  let { id: trackId } = parseTrackRaw(ctx.careerTrack);
  const trackParse = parseTrackRaw(ctx.careerTrack);
  const trackUnknownFromDb = trackParse.unknownString;

  const missing: MissingRequirement[] = [];

  const inferredFromLegacyProgram = inferTrackFromLegacyProgram(legacyRaw, trackId);
  if (inferredFromLegacyProgram.inferred) {
    trackId = inferredFromLegacyProgram.trackId;
    sourceNotes.push(`Větev odvozena z legacy programu (${legacyRaw}): ${trackId}.`);
  }

  if (programId === "beplan" && trackId === "not_set") {
    const fromCode = inferBeplanTrackFromPositionCode(ctx.careerPositionCode);
    if (fromCode !== "not_set") {
      trackId = fromCode;
      sourceNotes.push(
        "Kariérní větev u Beplanu odhadnuta z kódu pozice (doplňte explicitně career_track v DB pro jistotu)."
      );
      missing.push({
        id: "track_inferred",
        labelCs: "Větev byla dočasně odvozena z kódu pozice — uložte explicitní career_track.",
        reason: "legacy_value",
      });
    }
  }

  const rawCode = ctx.careerPositionCode?.trim() || null;

  if (programId === "not_set") {
    missing.push({
      id: "program_not_set",
      labelCs: "Není vyplněn kariérní program (beplan / premium_brokers).",
      reason: "program_not_set",
    });
  }

  if (trackUnknownFromDb && ctx.careerTrack?.trim()) {
    sourceNotes.push(`Neznámá hodnota career_track v DB: „${ctx.careerTrack}“.`);
  }

  if (programId !== "not_set" && programId !== "unknown" && trackId === "not_set") {
    missing.push({
      id: "track_not_set",
      labelCs:
        "Není vyplněna kariérní větev (Top poradce / manažerská / realita / call centrum — podle programu).",
      reason: "config_incomplete",
    });
  }

  if (programId !== "not_set" && programId !== "unknown" && !rawCode) {
    missing.push({
      id: "position_not_set",
      labelCs: "Není vyplněn kód kariérní pozice.",
      reason: "config_incomplete",
    });
  }

  const positionDef =
    programId !== "not_set" && programId !== "unknown" && trackId !== "not_set" && trackId !== "unknown" && rawCode
      ? getCareerPositionDef(programId, trackId, rawCode)
      : null;

  if (programId !== "not_set" && programId !== "unknown" && rawCode && trackId !== "not_set" && trackId !== "unknown" && !positionDef) {
    missing.push({
      id: "unknown_position_code",
      labelCs: `Kód „${rawCode}“ neodpovídá kombinaci program + větev v konfiguraci aplikace.`,
      reason: "invalid_config",
    });
  }

  if (positionDef) {
    for (const req of positionDef.requirements) {
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

  const hasValidPosition = Boolean(rawCode && positionDef);
  const { progressEvaluation, evaluationCompleteness } = deriveEvaluationOutcome(
    missing,
    hasValidPosition,
    programId,
    trackId,
    programUnknown,
    trackUnknownFromDb
  );

  const nextCode = positionDef?.nextCareerPositionCode ?? null;
  const nextLabel =
    programId !== "not_set" &&
    programId !== "unknown" &&
    trackId !== "not_set" &&
    trackId !== "unknown" &&
    nextCode
      ? getCareerPositionDef(programId, trackId, nextCode)?.label ?? null
      : null;

  return {
    progressEvaluation,
    evaluationCompleteness,
    careerProgramId: programId,
    careerTrackId: trackId,
    rawCareerProgram: ctx.careerProgram,
    rawCareerTrack: ctx.careerTrack,
    rawCareerPositionCode: rawCode,
    careerPositionLabel: positionDef?.label ?? null,
    progressionOrder: positionDef?.progressionOrder ?? null,
    nextCareerPositionCode: nextCode,
    nextCareerPositionLabel: nextLabel,
    missingRequirements: missing,
    sourceNotes,
    systemRoleName: ctx.systemRoleName,
  };
}

export function formatCareerProgramLabel(programId: CareerProgramId): string {
  return CAREER_PROGRAM_LABELS[programId] ?? programId;
}

export function formatCareerTrackLabel(trackId: CareerTrackId): string {
  return CAREER_TRACK_LABELS[trackId] ?? trackId;
}

/** Kompaktní řádek pro tabulku */
export function formatCareerSummaryLine(
  program: string | null,
  track: string | null,
  positionCode: string | null
): string | null {
  const { programId, legacyRaw } = normalizeCareerProgramFromDb(program);
  let { id: trackId } = parseTrackRaw(track);
  const inf = inferTrackFromLegacyProgram(legacyRaw, trackId);
  if (inf.inferred) trackId = inf.trackId;
  if (programId === "beplan" && trackId === "not_set") {
    const t2 = inferBeplanTrackFromPositionCode(positionCode);
    if (t2 !== "not_set") trackId = t2;
  }

  const progLabel =
    programId !== "not_set" && programId !== "unknown"
      ? formatCareerProgramLabel(programId)
      : program?.trim() || null;
  const trackLabel =
    trackId !== "not_set" && trackId !== "unknown" ? formatCareerTrackLabel(trackId) : null;

  let posLabel: string | null = null;
  if (positionCode && programId !== "not_set" && programId !== "unknown" && trackId !== "not_set" && trackId !== "unknown") {
    posLabel = getCareerPositionDef(programId, trackId, positionCode)?.label ?? positionCode;
  } else if (positionCode) {
    posLabel = positionCode;
  }

  const parts = [progLabel, trackLabel, posLabel].filter(Boolean);
  return parts.length ? parts.join(" · ") : null;
}
