import type { CareerPositionDef, CareerRequirement } from "./types";
import { defaultRequirementsForPosition, linearLadder } from "./position-helpers";

/** PB — BJS z karierniradPB.pdf nejsou v CRM; požadavky zůstávají manuální. */
const PB_EXTRA: CareerRequirement = {
  id: "bjs_manual",
  labelCs: "BJS dle kariérního řádu PB — pouze manuální ověření (metriky CRM nejsou BJS).",
  kind: "personal_performance",
  evaluability: "manual",
  sourceNote: "karierniradPB.pdf",
};

function pbRequirements(): CareerRequirement[] {
  return [...defaultRequirementsForPosition(), PB_EXTRA];
}

export const PREMIUM_BROKERS_POSITIONS: CareerPositionDef[] = linearLadder(
  "premium_brokers",
  [
    { code: "PB_REP_1", label: "Reprezentant 1" },
    { code: "PB_REP_2", label: "Reprezentant 2" },
    { code: "PB_REP_3", label: "Reprezentant 3" },
    { code: "PB_OB", label: "OB" },
    { code: "PB_OV", label: "OV" },
    { code: "PB_OR", label: "OR" },
    { code: "PB_ZR", label: "ZR" },
    { code: "PB_GA_1", label: "GA1" },
    { code: "PB_GA_2", label: "GA2" },
    { code: "PB_GA_3", label: "GA3" },
    { code: "PB_GA_4", label: "GA4" },
  ],
  () => pbRequirements()
);
