/**
 * Mapování textu / slangu poradců na stabilní `itemKey` gridu pokrytí (ProductCoverageGrid).
 */

import { getAllCoverageItemKeys, getItemInfo } from "@/app/lib/coverage/item-keys";

/** Shodné s `COVERAGE_STATUSES` v packages/db (bez importu db kvůli vitest / server-only). */
const COVERAGE_STATUS_WHITELIST = [
  "done",
  "in_progress",
  "none",
  "not_relevant",
  "opportunity",
  "waiting_signature",
] as const;

/** Zkratky a slang → přesný `itemKey` z COVERAGE_CATEGORIES. */
const SLANG_TO_ITEM_KEY: Record<string, string> = {
  odp: "Pojištění odpovědnosti",
  odpovědnost: "Pojištění odpovědnosti",
  odpovednost: "Pojištění odpovědnosti",
  pov: "Pojištění auta:POV",
  "povinné ručení": "Pojištění auta:POV",
  povinne_ruceni: "Pojištění auta:POV",
  hav: "Pojištění auta:HAV",
  havarijní: "Pojištění auta:HAV",
  havarijni: "Pojištění auta:HAV",
  kasko: "Pojištění auta:HAV",
  životko: "Životní pojištění",
  zivotko: "Životní pojištění",
  zp: "Životní pojištění",
  penzijko: "DPS",
  dpsko: "DPS",
  dipko: "Investice:DIP",
  hypo: "Úvěry:Hypotéky",
  hypoška: "Úvěry:Hypotéky",
  hypoteka: "Úvěry:Hypotéky",
  "životní pojištění": "Životní pojištění",
  zivotni_pojisteni: "Životní pojištění",
};

/**
 * Vyřeší `itemKey` z explicitního klíče, slangu nebo názvu položky v textu.
 */
export function resolveCoverageItemKeyFromText(
  explicitKey: string | null | undefined,
  extraText?: string | null,
): string | null {
  const k = explicitKey?.trim();
  if (k && getItemInfo(k)) return k;

  const text = `${explicitKey ?? ""} ${extraText ?? ""}`.toLowerCase().trim();
  if (!text) return null;

  for (const [needle, itemKey] of Object.entries(SLANG_TO_ITEM_KEY)) {
    if (text.includes(needle)) {
      if (getItemInfo(itemKey)) return itemKey;
    }
  }

  const all = getAllCoverageItemKeys().sort((a, b) => b.itemKey.length - a.itemKey.length);
  for (const row of all) {
    if (text.includes(row.itemKey.toLowerCase())) return row.itemKey;
  }

  const byLabel = [...getAllCoverageItemKeys()].sort((a, b) => b.label.length - a.label.length);
  for (const row of byLabel) {
    const l = row.label.toLowerCase();
    if (l.length >= 3 && text.includes(l)) return row.itemKey;
  }

  return null;
}

/** Normalizace uživatelského textu stavu na hodnotu z `COVERAGE_STATUSES`. */
export function normalizeCoverageStatus(raw: string): string {
  const t = raw.trim().toLowerCase();
  const map: Record<string, string> = {
    hotovo: "done",
    splněno: "done",
    splneno: "done",
    zaevidováno: "done",
    zaevidovano: "done",
    done: "done",
    žádný: "none",
    zadny: "none",
    none: "none",
    neřeší: "not_relevant",
    nereší: "not_relevant",
    neresime: "not_relevant",
    nepodstatné: "not_relevant",
    probíhá: "in_progress",
    probiha: "in_progress",
    řeší_se: "in_progress",
    resi_se: "in_progress",
    obchod: "opportunity",
    čeká_na_podpis: "waiting_signature",
    ceka_na_podpis: "waiting_signature",
  };
  const out = map[t] ?? raw.trim();
  if ((COVERAGE_STATUS_WHITELIST as readonly string[]).includes(out)) return out;
  return out;
}
