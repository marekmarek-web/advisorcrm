import type { CareerPositionDef } from "./types";
import { individualPerformanceRequirements, linearLadder } from "./position-helpers";

/**
 * Beplan — větev Top poradce (individuální / výkonová).
 * Kódy TP1–TP7; legacy kódy BP_FIN_T1/T2 se registrují v registry jako aliasy.
 */
export const BEPLAN_TOP_PORADCE: CareerPositionDef[] = linearLadder(
  "beplan",
  "individual_performance",
  [
    { code: "BP_TP_1", label: "Top poradce 1 (TP1)" },
    { code: "BP_TP_2", label: "Top poradce 2 (TP2)" },
    { code: "BP_TP_3", label: "Top poradce 3 (TP3)" },
    { code: "BP_TP_4", label: "Top poradce 4 (TP4)" },
    { code: "BP_TP_5", label: "Top poradce 5 (TP5)" },
    { code: "BP_TP_6", label: "Top poradce 6 (TP6)" },
    { code: "BP_TP_7", label: "Top poradce 7 (TP7)" },
  ],
  () => individualPerformanceRequirements()
);
