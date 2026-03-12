import { segmentLabel } from "./segment-labels";

/** Jedna položka v gridu: segment kód + zobrazený label (může být subtyp úvěru/investic). */
export type SegmentItem = { code: string; label: string };

/** Kategorie s rozklikem: název kategorie + položky (POV/HAV, Nemovitost|domácnost|obojí, atd.). */
export type CoverageCategory =
  | { type: "expandable"; category: string; items: SegmentItem[] }
  | { type: "single"; category: string; item: SegmentItem };

/** Hierarchie dle požadavku: Pojištění auta (POV/HAV), Majetek (NEM|domácnost|obojí), Úvěry (4), Investice (3), atd. */
export const COVERAGE_CATEGORIES: CoverageCategory[] = [
  {
    type: "expandable",
    category: "Pojištění auta",
    items: [
      { code: "AUTO_PR", label: "POV" },
      { code: "AUTO_HAV", label: "HAV" },
    ],
  },
  {
    type: "expandable",
    category: "Majetek",
    items: [
      { code: "MAJ", label: "Nemovitost" },
      { code: "MAJ", label: "Domácnost" },
      { code: "MAJ", label: "Obojí" },
    ],
  },
  {
    type: "single",
    category: "Pojištění odpovědnosti",
    item: { code: "ODP", label: segmentLabel("ODP") },
  },
  {
    type: "single",
    category: "Pojištění zaměstnanecké odpovědnosti",
    item: { code: "ODP", label: "Zaměstnanecká odpovědnost" },
  },
  {
    type: "single",
    category: "Životní pojištění",
    item: { code: "ZP", label: segmentLabel("ZP") },
  },
  {
    type: "expandable",
    category: "Úvěry",
    items: [
      { code: "HYPO", label: "Hypotéky" },
      { code: "UVER", label: "Stavební spoření" },
      { code: "UVER", label: "Americké hypotéky" },
      { code: "UVER", label: "Spotřebitelské úvěry" },
    ],
  },
  {
    type: "expandable",
    category: "Investice",
    items: [
      { code: "DIP", label: "DIP" },
      { code: "INV", label: "Pravidelné" },
      { code: "INV", label: "Jednorázové" },
    ],
  },
  {
    type: "single",
    category: "DPS",
    item: { code: "DPS", label: segmentLabel("DPS") },
  },
];

/** Pro zpětnou kompatibilitu: flat hierarchie pro starý grid. */
export const SEGMENT_HIERARCHY: { category: string; segments: { code: string; label: string }[] }[] =
  COVERAGE_CATEGORIES.map((c) => {
    if (c.type === "expandable") return { category: c.category, segments: c.items };
    return { category: c.category, segments: [c.item] };
  });

/** Mapování caseType obchodu na segment(y) pro zobrazení „řeší se“. */
export const CASE_TYPE_TO_SEGMENTS: Record<string, string[]> = {
  hypotéka: ["HYPO"],
  hypo: ["HYPO"],
  investice: ["INV"],
  pojištění: ["ZP"],
  životní: ["ZP"],
  dps: ["DPS"],
  úvěr: ["UVER"],
  uver: ["UVER"],
  majetek: ["MAJ", "NEM"],
  auto: ["AUTO_PR", "AUTO_HAV"],
  jiné: [],
};

export function caseTypeToSegments(caseType: string): string[] {
  const normalized = caseType?.toLowerCase().trim() ?? "";
  return CASE_TYPE_TO_SEGMENTS[normalized] ?? [];
}

/** Mapování segmentu na caseType obchodu pro „založit obchod“ z coverage položky. */
export const SEGMENT_TO_CASE_TYPE: Record<string, string> = {
  HYPO: "hypotéka",
  UVER: "úvěr",
  ZP: "pojištění",
  DPS: "dps",
  INV: "investice",
  DIP: "investice",
  MAJ: "majetek",
  NEM: "majetek",
  AUTO_PR: "auto",
  AUTO_HAV: "auto",
  ODP: "pojištění",
  CEST: "pojištění",
  FIRMA_POJ: "pojištění",
  ZDRAV: "pojištění",
};

export function segmentToCaseType(segmentCode: string): string {
  return SEGMENT_TO_CASE_TYPE[segmentCode] ?? "jiné";
}
