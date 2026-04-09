import type { CareerPositionDef } from "./types";
import { linearLadder, realityTrackRequirements } from "./position-helpers";

/**
 * Beplan — realitní větev (odděleně od TP / manažerské finance).
 * Bez 1:1 mapování na individuální finanční výkon — evaluator zůstává opatrný.
 */
export const BEPLAN_REALITY: CareerPositionDef[] = linearLadder(
  "beplan",
  "reality",
  [
    { code: "BP_RE_RT1", label: "RT1" },
    { code: "BP_RE_RT2", label: "RT2" },
    { code: "BP_RE_RR1", label: "RR1" },
    { code: "BP_RE_RV2", label: "RV2" },
    { code: "BP_RE_RV3", label: "RV3" },
    { code: "BP_RE_RV4", label: "RV4" },
    { code: "BP_RE_RM1", label: "RM1" },
    { code: "BP_RE_RM1P", label: "RM1+" },
    { code: "BP_RE_RM2", label: "RM2" },
    { code: "BP_RE_RD1", label: "RD1" },
    { code: "BP_RE_RD2", label: "RD2" },
    { code: "BP_RE_RD3", label: "RD3" },
  ],
  () => realityTrackRequirements()
);
