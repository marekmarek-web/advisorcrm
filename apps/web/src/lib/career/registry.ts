import type { CareerPositionDef, CareerProgramId } from "./types";
import { BEPLAN_FINANCE_POSITIONS } from "./beplan-finance";
import { BEPLAN_REALTY_POSITIONS } from "./beplan-realty";
import { PREMIUM_BROKERS_POSITIONS } from "./premium-brokers";
import { PREMIUM_BROKERS_CC_POSITIONS } from "./premium-brokers-call-center";

const ALL: CareerPositionDef[] = [
  ...BEPLAN_FINANCE_POSITIONS,
  ...BEPLAN_REALTY_POSITIONS,
  ...PREMIUM_BROKERS_POSITIONS,
  ...PREMIUM_BROKERS_CC_POSITIONS,
];

const byProgramAndCode = new Map<string, CareerPositionDef>();
for (const p of ALL) {
  byProgramAndCode.set(`${p.programId}::${p.code}`, p);
}

export function getCareerPositionDef(programId: CareerProgramId, code: string): CareerPositionDef | null {
  if (programId === "not_set") return null;
  return byProgramAndCode.get(`${programId}::${code}`) ?? null;
}

export function listCareerPositionsForProgram(programId: CareerProgramId): CareerPositionDef[] {
  if (programId === "not_set") return [];
  return ALL.filter((p) => p.programId === programId).sort((a, b) => a.progressionOrder - b.progressionOrder);
}

export function isKnownCareerProgramId(v: string): v is CareerProgramId {
  return (
    v === "not_set" ||
    v === "beplan_finance" ||
    v === "beplan_realty" ||
    v === "premium_brokers" ||
    v === "premium_brokers_call_center"
  );
}

export function isKnownCareerTrackId(v: string): boolean {
  return v === "not_set" || v === "individual_performance" || v === "management_structure";
}
