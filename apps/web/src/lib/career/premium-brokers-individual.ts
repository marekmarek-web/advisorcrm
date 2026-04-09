import type { CareerPositionDef } from "./types";
import { linearLadder, premiumBrokersIndividualRequirements } from "./position-helpers";

/** Premium Brokers — výkonová větev (reprezentanti) */
export const PREMIUM_BROKERS_INDIVIDUAL: CareerPositionDef[] = linearLadder(
  "premium_brokers",
  "individual_performance",
  [
    { code: "PB_REP_1", label: "Reprezentant 1" },
    { code: "PB_REP_2", label: "Reprezentant 2" },
    { code: "PB_REP_3", label: "Reprezentant 3" },
  ],
  () => premiumBrokersIndividualRequirements()
);
