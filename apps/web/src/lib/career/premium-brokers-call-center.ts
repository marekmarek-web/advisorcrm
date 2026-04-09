import type { CareerPositionDef } from "./types";
import { linearLadder } from "./position-helpers";

/** Call centrum větev — karierniradPB.pdf */
export const PREMIUM_BROKERS_CC_POSITIONS: CareerPositionDef[] = linearLadder("premium_brokers_call_center", [
  { code: "PB_CC_UR1", label: "UR1" },
  { code: "PB_CC_UR2", label: "UR2" },
  { code: "PB_CC_UR3", label: "UR3" },
  { code: "PB_CC_UR4", label: "UR4" },
  { code: "PB_CC_M1", label: "M1" },
  { code: "PB_CC_M1P", label: "M1+" },
  { code: "PB_CC_M2", label: "M2" },
]);
