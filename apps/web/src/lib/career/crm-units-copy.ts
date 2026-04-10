import type { CareerProgramId } from "./types";

/** Jednotná copy: CRM jednotky vs BJ (Beplan) / BJS (Premium Brokers) — bez míchání napříč pooly. */
export function crmUnitsFootnoteForProgram(programId: CareerProgramId): string {
  if (programId === "beplan") {
    return "Jednotky v CRM nejsou BJ z kariérního řádu Beplan — jen orientační výkon v systému.";
  }
  if (programId === "premium_brokers") {
    return "Jednotky v CRM nejsou BJS z řádu Premium Brokers — jen orientační výkon v systému.";
  }
  return "Jednotky v CRM jsou obecné metriky — neinterpretujte je jako BJ ani BJS bez ručního ověření řádu.";
}
