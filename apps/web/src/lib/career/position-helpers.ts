import type { CareerPositionDef, CareerProgramId, CareerRequirement } from "./types";

/** Zdroj: Kariera_Beplan.pdf — prahy BJ nejsou bezpečně strojově extrahovány; požadavky zůstávají manuální / unspecified. */
const INDIVIDUAL_CORE: CareerRequirement[] = [
  {
    id: "bj_or_equivalent",
    labelCs:
      "Splnění BJ / měsíčních kritérií dle platného kariérního řádu (v CRM není oficiální BJ — nelze automaticky ověřit).",
    kind: "personal_performance",
    evaluability: "manual",
    sourceNote: "Beplan PDF — BJ",
  },
  {
    id: "historical_bj",
    labelCs: "Historické BJ a časové podmínky z PDF — pouze manuální evidence.",
    kind: "historical_performance",
    evaluability: "unspecified",
  },
  {
    id: "licence_ft",
    labelCs: "Licence, FT a interní předpoklady — manuální checklist.",
    kind: "compliance",
    evaluability: "manual",
  },
];

const CRM_PROXY_NOTE: CareerRequirement = {
  id: "crm_production_proxy",
  labelCs:
    "Produkce a jednotky v CRM jsou jen orientační proxy — nejsou to BJ/BJS z kariérního řádu.",
  kind: "personal_performance",
  evaluability: "crm_proxy",
};

const MANAGEMENT_STRUCTURE: CareerRequirement[] = [
  {
    id: "structural_rules",
    labelCs:
      "Strukturální podmínky (počet přímých, kvalifikace týmu) dle PDF — prahy v aplikaci zatím nespecifikovány.",
    kind: "team_structure",
    evaluability: "unspecified",
    managementOnly: true,
  },
  {
    id: "directs_have_career_code",
    labelCs: "U přímých podřízených je vyplněn kód kariérní pozice (pro vyhodnocení týmových pravidel).",
    kind: "subordinate_career_data",
    evaluability: "auto_subordinates_have_position",
    managementOnly: true,
  },
];

export function defaultRequirementsForPosition(): CareerRequirement[] {
  return [...INDIVIDUAL_CORE, CRM_PROXY_NOTE, ...MANAGEMENT_STRUCTURE];
}

export function linearLadder(
  programId: CareerProgramId,
  steps: readonly { code: string; label: string }[],
  requirementCustomizer?: (order: number) => CareerRequirement[]
): CareerPositionDef[] {
  return steps.map((step, order) => ({
    programId,
    code: step.code,
    label: step.label,
    progressionOrder: order,
    nextCareerPositionCode: order < steps.length - 1 ? steps[order + 1]!.code : null,
    requirements: requirementCustomizer ? requirementCustomizer(order) : defaultRequirementsForPosition(),
  }));
}
