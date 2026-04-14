/** Záložky detailu kontaktu — sdílené mezi server page a klientskou navigací. */

export type ContactTabId =
  | "prehled"
  | "detail"
  | "timeline"
  | "smlouvy"
  | "dokumenty"
  | "zapisky"
  | "podklady"
  | "ukoly"
  | "obchody"
  | "briefing";

export const CONTACT_TAB_IDS: ContactTabId[] = [
  "prehled",
  "detail",
  "timeline",
  "smlouvy",
  "dokumenty",
  "zapisky",
  "podklady",
  "ukoly",
  "obchody",
  "briefing",
];

export const CONTACT_TAB_LABELS: Record<ContactTabId, string> = {
  prehled: "Přehled",
  detail: "Detail",
  timeline: "Časová osa",
  smlouvy: "Produkty",
  dokumenty: "Dokumenty",
  zapisky: "Zápisky",
  podklady: "Požadavky na podklady",
  ukoly: "Úkoly a schůzky",
  obchody: "Obchody",
  briefing: "Briefing",
};

/** Starý název záložky v odkazech — přesměruje se na `podklady`. */
const LEGACY_TAB_ALIASES: Record<string, ContactTabId> = {
  aktivita: "podklady",
};

function firstString(v: string | string[] | undefined): string | undefined {
  if (v == null) return undefined;
  return typeof v === "string" ? v : v[0];
}

/** Normalizace hodnoty `tab` (včetně legacy aliasů). */
export function normalizeContactTab(raw: string | undefined): ContactTabId {
  const t = raw?.trim();
  if (!t) return "prehled";
  if (LEGACY_TAB_ALIASES[t]) return LEGACY_TAB_ALIASES[t];
  if (CONTACT_TAB_IDS.includes(t as ContactTabId)) return t as ContactTabId;
  return "prehled";
}

/** Aktivní záložka z query `tab` (výchozí přehled). */
export function parseContactTabFromSearchParams(
  sp: Record<string, string | string[] | undefined>,
): ContactTabId {
  return normalizeContactTab(firstString(sp.tab));
}

/** Query řetězec bez `tab` (pro odkazy mezi záložkami; zachová eventId / meetingNoteId u Briefingu). */
export function contactDetailQueryWithoutTab(
  sp: Record<string, string | string[] | undefined>,
): string {
  const p = new URLSearchParams();
  for (const [key, raw] of Object.entries(sp)) {
    if (key === "tab") continue;
    const val = firstString(raw);
    if (val != null && val !== "") p.set(key, val);
  }
  return p.toString();
}
