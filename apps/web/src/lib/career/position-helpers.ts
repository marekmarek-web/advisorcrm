import type { CareerPositionDef, CareerProgramId, CareerRequirement, CareerTrackId } from "./types";

const BJ_MANUAL: CareerRequirement = {
  id: "bj_or_equivalent",
  labelCs:
    "Splnění BJ / měsíčních kritérií dle platného kariérního řádu (v CRM není oficiální BJ — nelze automaticky ověřit).",
  kind: "personal_performance",
  evaluability: "manual",
  sourceNote: "PDF kariérního řádu",
};

const HISTORICAL: CareerRequirement = {
  id: "historical_bj",
  labelCs: "Historický výkon a časové podmínky z PDF — pouze manuální evidence.",
  kind: "historical_performance",
  evaluability: "unspecified",
};

const LICENCE_FT: CareerRequirement = {
  id: "licence_ft",
  labelCs: "Licence, zkoušky, full-time a interní předpoklady — manuální checklist.",
  kind: "compliance",
  evaluability: "manual",
};

const CRM_PROXY: CareerRequirement = {
  id: "crm_production_proxy",
  labelCs:
    "Produkce a jednotky v CRM jsou jen orientační proxy — nejsou to BJ/BJS z kariérního řádu.",
  kind: "personal_performance",
  evaluability: "crm_proxy",
};

/** Individuální / výkonová větev — žádné týmové podmínky */
export function individualPerformanceRequirements(extra: CareerRequirement[] = []): CareerRequirement[] {
  return [BJ_MANUAL, HISTORICAL, LICENCE_FT, CRM_PROXY, ...extra];
}

/** Realitní větev — bez automatického mapování na finance; opatrné unspecified */
export function realityTrackRequirements(): CareerRequirement[] {
  return [
    ...individualPerformanceRequirements([
      {
        id: "reality_split_rules",
        labelCs:
          "Realitní podíl výkonu a speciální omezení u manažerského postupu dle PDF — v aplikaci chybí detailní specifikace; nutné ruční ověření.",
        kind: "personal_performance",
        evaluability: "unspecified",
        sourceNote: "Kariera_Beplan.pdf — realitní větev",
      },
    ]),
  ];
}

const STRUCTURAL: CareerRequirement[] = [
  {
    id: "structural_rules",
    labelCs:
      "Strukturální podmínky (počet přímých, kvalifikace týmu) dle PDF — prahy v aplikaci zatím plně nespecifikovány.",
    kind: "team_structure",
    evaluability: "unspecified",
  },
  {
    id: "directs_have_career_code",
    labelCs: "U přímých podřízených je vyplněn kód kariérní pozice (pro vyhodnocení týmových pravidel).",
    kind: "subordinate_career_data",
    evaluability: "auto_subordinates_have_position",
  },
];

/** Manažerská / strukturální větev — osobní + týmové podmínky tam, kde máme data */
export function managementStructureRequirements(extra: CareerRequirement[] = []): CareerRequirement[] {
  return [BJ_MANUAL, HISTORICAL, LICENCE_FT, CRM_PROXY, ...STRUCTURAL, ...extra];
}

const BJS_PB: CareerRequirement = {
  id: "bjs_manual",
  labelCs: "BJS dle kariérního řádu PB — pouze manuální ověření (metriky CRM nejsou BJS).",
  kind: "personal_performance",
  evaluability: "manual",
  sourceNote: "karierniradPB.pdf",
};

export function premiumBrokersIndividualRequirements(): CareerRequirement[] {
  return individualPerformanceRequirements([BJS_PB]);
}

export function premiumBrokersManagementRequirements(): CareerRequirement[] {
  return managementStructureRequirements([BJS_PB]);
}

/** Call centrum — úroveň UR bez týmových pravidel v MVP */
export function callCenterUrRequirements(): CareerRequirement[] {
  return individualPerformanceRequirements([BJS_PB]);
}

/** Call centrum — manažerské stupně (M1+) — struktura týmu */
export function callCenterManagementRequirements(): CareerRequirement[] {
  return managementStructureRequirements([BJS_PB]);
}

export function linearLadder(
  programId: CareerProgramId,
  trackId: CareerTrackId,
  steps: readonly { code: string; label: string }[],
  requirementsForIndex: (order: number) => CareerRequirement[]
): CareerPositionDef[] {
  return steps.map((step, order) => ({
    programId,
    trackId,
    code: step.code,
    label: step.label,
    progressionOrder: order,
    nextCareerPositionCode: order < steps.length - 1 ? steps[order + 1]!.code : null,
    requirements: requirementsForIndex(order),
  }));
}
