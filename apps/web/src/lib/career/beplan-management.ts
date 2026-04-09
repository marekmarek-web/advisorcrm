import type { CareerPositionDef } from "./types";
import { linearLadder, managementStructureRequirements } from "./position-helpers";

/**
 * Beplan — manažerská / strukturální větev (R → VR → M → D).
 * Legacy kódy BP_FIN_* odpovídající starému finančnímu žebříčku jsou aliasy v registry.
 */
export const BEPLAN_MANAGEMENT: CareerPositionDef[] = linearLadder(
  "beplan",
  "management_structure",
  [
    { code: "BP_MS_R1", label: "Reprezentant 1 (R1)" },
    { code: "BP_MS_VR2", label: "VR2" },
    { code: "BP_MS_VR3", label: "VR3" },
    { code: "BP_MS_VR4", label: "VR4" },
    { code: "BP_MS_M1", label: "M1" },
    { code: "BP_MS_M1P", label: "M1+" },
    { code: "BP_MS_M2", label: "M2" },
    { code: "BP_MS_D1", label: "D1" },
    { code: "BP_MS_D2", label: "D2" },
    { code: "BP_MS_D3", label: "D3" },
  ],
  () => managementStructureRequirements()
);
