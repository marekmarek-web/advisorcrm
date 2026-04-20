/**
 * Kanonické záložky `/portal/setup`. Žádné legacy `tab` hodnoty z bývalého `/portal/profile`
 * (např. `rezervace`) se nepřemapovávají — neplatné `tab` se při přesměrování zahodí.
 */
export const SETUP_TABS = [
  {
    id: "osobni",
    label: "Osobní údaje",
    keywords: ["osobní", "údaje", "fakturace", "heslo", "zabezpečení", "2fa", "rychlé", "demo", "kariérní", "bj", "pozice", "nadřízen"],
  },
  { id: "profil", label: "Profil poradce", keywords: ["profil", "poradce", "vizitka"] },
  { id: "fakturace", label: "Fakturace a Tarif", keywords: ["fakturace", "tarif", "platba", "faktura"] },
  {
    id: "notifikace",
    label: "Notifikace",
    keywords: ["notifikace", "email", "push", "rezervace", "rezervační", "odkaz", "veřejn", "požadavky", "klient"],
  },
  { id: "fondy", label: "Knihovna fondů", keywords: ["fond", "fondy", "knihovna", "knihovna fondů", "etf", "investice", "portfolio"] },
  { id: "integrace", label: "Integrace", keywords: ["integrace", "google", "api", "kalendář"] },
] as const;

export type SetupTabId = (typeof SETUP_TABS)[number]["id"];

const TAB_ID_SET = new Set<string>(SETUP_TABS.map((t) => t.id));

export function isValidSetupTabId(tab: string | undefined | null): tab is SetupTabId {
  return tab != null && tab !== "" && TAB_ID_SET.has(tab);
}
