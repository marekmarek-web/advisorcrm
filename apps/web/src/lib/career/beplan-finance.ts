import type { CareerPositionDef } from "./types";
import { linearLadder } from "./position-helpers";

/** Beplan finance — kódy a pořadí odvozené z interního mapování k PDF Kariera_Beplan.pdf */
export const BEPLAN_FINANCE_POSITIONS: CareerPositionDef[] = linearLadder("beplan_finance", [
  { code: "BP_FIN_T1", label: "Trainee 1 (T1)" },
  { code: "BP_FIN_T2", label: "Trainee 2 (T2)" },
  { code: "BP_FIN_R1", label: "Reprezentant 1 (R1)" },
  { code: "BP_FIN_VR2", label: "VR2" },
  { code: "BP_FIN_VR3", label: "VR3" },
  { code: "BP_FIN_VR4", label: "VR4" },
  { code: "BP_FIN_M1", label: "M1" },
  { code: "BP_FIN_M1P", label: "M1+" },
  { code: "BP_FIN_M2", label: "M2" },
  { code: "BP_FIN_D1", label: "D1" },
  { code: "BP_FIN_D2", label: "D2" },
  { code: "BP_FIN_D3", label: "D3" },
]);
