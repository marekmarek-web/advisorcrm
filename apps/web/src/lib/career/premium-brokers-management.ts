import type { CareerPositionDef } from "./types";
import { linearLadder, premiumBrokersManagementRequirements } from "./position-helpers";

/** Premium Brokers — manažerská / strukturální větev */
export const PREMIUM_BROKERS_MANAGEMENT: CareerPositionDef[] = linearLadder(
  "premium_brokers",
  "management_structure",
  [
    { code: "PB_OB", label: "OB" },
    { code: "PB_OV", label: "OV" },
    { code: "PB_OR", label: "OR" },
    { code: "PB_ZR", label: "ZR" },
    { code: "PB_GA_1", label: "GA1" },
    { code: "PB_GA_2", label: "GA2" },
    { code: "PB_GA_3", label: "GA3" },
    { code: "PB_GA_4", label: "GA4" },
  ],
  () => premiumBrokersManagementRequirements()
);
