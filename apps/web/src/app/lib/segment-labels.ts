/** Client-safe segment code → display name map. Keep in sync with packages/db/src/schema/contracts.ts */
export const SEGMENT_LABELS: Record<string, string> = {
  ZP: "Životní pojištění",
  MAJ: "Majetek",
  ODP: "Odpovědnost",
  AUTO_PR: "Auto – povinné ručení",
  AUTO_HAV: "Auto – havarijní pojištění",
  CEST: "Cestovní pojištění",
  INV: "Investice",
  DIP: "Dlouhodobý investiční produkt (DIP)",
  DPS: "Doplňkové penzijní spoření (DPS)",
  HYPO: "Hypotéky",
  UVER: "Úvěry",
  FIRMA_POJ: "Pojištění firem",
  ZDRAV: "Zdraví / úraz / nemoc",
  NEM: "Majetek",
};

export function segmentLabel(code: string): string {
  return SEGMENT_LABELS[code] ?? code;
}
