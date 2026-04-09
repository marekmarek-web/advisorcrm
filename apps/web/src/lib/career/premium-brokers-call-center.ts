import type { CareerPositionDef } from "./types";
import {
  callCenterManagementRequirements,
  callCenterUrRequirements,
  linearLadder,
} from "./position-helpers";

const CC_STEPS = [
  { code: "PB_CC_UR1", label: "UR1" },
  { code: "PB_CC_UR2", label: "UR2" },
  { code: "PB_CC_UR3", label: "UR3" },
  { code: "PB_CC_UR4", label: "UR4" },
  { code: "PB_CC_M1", label: "M1" },
  { code: "PB_CC_M1P", label: "M1+" },
  { code: "PB_CC_M2", label: "M2" },
] as const;

/** PB call centrum — UR bez týmových pravidel, M* se strukturálními požadavky */
export const PREMIUM_BROKERS_CALL_CENTER: CareerPositionDef[] = linearLadder(
  "premium_brokers",
  "call_center",
  CC_STEPS,
  (order) => (order < 4 ? callCenterUrRequirements() : callCenterManagementRequirements())
);
