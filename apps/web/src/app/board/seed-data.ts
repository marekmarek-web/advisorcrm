import type { Board, Column, Group, Item } from "@/app/components/monday/types";

/** Výchozí sloupce boardu – jeden zdroj pravdy; šířky dle doporučení (Monday/Notion vibe). */
export const DEFAULT_BOARD_COLUMNS: Column[] = [
  { id: "item", title: "Jméno klienta", type: "item", width: 260, minWidth: 220, maxWidth: 400, hidden: false, sticky: true, resizable: true },
  { id: "zp", title: "ŽP", type: "status", width: 112, minWidth: 96, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
  { id: "inv", title: "INV", type: "status", width: 112, minWidth: 96, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
  { id: "hypo", title: "HYPO", type: "status", width: 160, minWidth: 132, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
  { id: "uver", title: "Úvěr/Kons.", type: "status", width: 132, minWidth: 120, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
  { id: "dps", title: "DPS", type: "status", width: 94, minWidth: 84, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
  { id: "pov_hav", title: "POV/HAV", type: "status", width: 112, minWidth: 96, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
  { id: "nem_dom", title: "NEM-DOM", type: "status", width: 112, minWidth: 96, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
  { id: "odp", title: "ODP", type: "status", width: 112, minWidth: 96, maxWidth: 200, hidden: false, resizable: true, hasSummary: true, supportsNote: true },
];

const COLUMNS = DEFAULT_BOARD_COLUMNS;

export const PRODUCT_COLUMNS = COLUMNS.filter((c) => c.type === "status").map((c) => c.id);

const ITEMS: Record<string, Item> = {
  "1": {
    id: "1",
    name: "Saša Novák",
    cells: {
      zp: "rozděláno",
      inv: "hotovo",
      hypo: "",
      uver: "zatím-ne",
      dps: "domluvit",
      pov_hav: "x",
      nem_dom: "hotovo",
      odp: "",
    },
  },
  "2": {
    id: "2",
    name: "Jana Černá",
    cells: {
      zp: "hotovo",
      inv: "rozděláno",
      hypo: "",
      uver: "k-podpisu",
      dps: "hotovo",
      pov_hav: "domluvit",
      nem_dom: "x",
      odp: "",
    },
  },
  "3": {
    id: "3",
    name: "Petr Malý",
    cells: {
      zp: "k-podpisu",
      inv: "hotovo",
      hypo: "rozděláno",
      uver: "zatím-ne",
      dps: "k-podpisu",
      pov_hav: "hotovo",
      nem_dom: "domluvit",
      odp: "",
    },
  },
  "4": {
    id: "4",
    name: "Marie Králová",
    cells: {
      zp: "hotovo",
      inv: "hotovo",
      hypo: "",
      uver: "rozděláno",
      dps: "zatím-ne",
      pov_hav: "x",
      nem_dom: "hotovo",
      odp: "k-podpisu",
    },
  },
  "5": {
    id: "5",
    name: "Tomáš Veselý",
    cells: {
      zp: "zatím-ne",
      inv: "domluvit",
      hypo: "",
      uver: "hotovo",
      dps: "rozděláno",
      pov_hav: "k-podpisu",
      nem_dom: "zatím-ne",
      odp: "",
    },
  },
};

const GROUPS: Group[] = [
  { id: "g1", name: "Únor 2026", color: "#579bfc", collapsed: false, itemIds: ["1", "2", "3"] },
  { id: "g2", name: "Leden 2026", color: "#a25ddc", collapsed: false, itemIds: ["4", "5"] },
];

export function createSeedBoard(): Board {
  return {
    id: "b1",
    name: "Přehled klientů",
    views: [
      { id: "v1", name: "Hlavní tabulka", columns: COLUMNS.map((c) => ({ ...c })) },
    ],
    groups: GROUPS.map((g) => ({ ...g })),
    items: JSON.parse(JSON.stringify(ITEMS)),
  };
}

let nextItemId = 10;
let nextViewId = 2;

export function nextId() {
  return String(nextItemId++);
}

export function nextViewIdSeq() {
  return "v" + String(nextViewId++);
}

export const DEFAULT_CELLS: Record<string, string | number> = {
  zp: "",
  inv: "",
  hypo: "",
  uver: "",
  dps: "",
  pov_hav: "",
  nem_dom: "",
  odp: "",
};
