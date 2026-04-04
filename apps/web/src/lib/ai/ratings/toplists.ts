import topListsSeed from "../../../../../../packages/db/src/data/top-lists-seed-v2.json";
import catalogSeed from "../../../../../../packages/db/src/catalog.json";
import { resolveContractSegmentFromUserText } from "../assistant-domain-model";

type TopListEntry = {
  partner: string;
  map: Record<string, string[]>;
  excluded?: boolean;
  reason?: string;
};

type TopListsFile = {
  note?: string;
  segments: { code: string; label: string; displayName: string }[];
  topLists: {
    pojistovny_top10: TopListEntry[];
    investicni_spolecnosti_top10: TopListEntry[];
    banky_top10: TopListEntry[];
    penzijni_spolecnosti_top5: TopListEntry[];
  };
};

const seed = topListsSeed as TopListsFile;

const excludePartnerNames = new Set(
  (catalogSeed as { rules?: { excludePartners?: string[] } }).rules?.excludePartners?.map((p) =>
    p.toLowerCase().trim(),
  ) ?? [],
);

function segmentDisplayName(segmentCode: string): string | null {
  const row = seed.segments.find((s) => s.code === segmentCode);
  return row?.displayName ?? row?.label ?? null;
}

function topListForSegment(segmentCode: string): TopListEntry[] | null {
  switch (segmentCode) {
    case "HYPO":
    case "UVER":
      return seed.topLists.banky_top10;
    case "DPS":
      return seed.topLists.penzijni_spolecnosti_top5;
    case "INV":
    case "DIP":
      return seed.topLists.investicni_spolecnosti_top10;
    case "ZP":
    case "MAJ":
    case "ODP":
    case "AUTO_PR":
    case "AUTO_HAV":
    case "CEST":
    case "FIRMA_POJ":
    case "ZDRAV":
      return seed.topLists.pojistovny_top10;
    default:
      return null;
  }
}

function partnerAllowed(name: string): boolean {
  const n = name.toLowerCase().trim();
  if (excludePartnerNames.has(n)) return false;
  return true;
}

export type TopPartnerRow = { rank: number; partner: string; productLines: string[] };

/**
 * Top partneři pro segment podle pořadí v seed souboru (read-only, deterministické).
 */
export function getTopPartnersForSegment(segmentCode: string, limit = 5): TopPartnerRow[] {
  const list = topListForSegment(segmentCode);
  const displayKey = segmentDisplayName(segmentCode);
  if (!list || !displayKey) return [];

  const rows: TopPartnerRow[] = [];
  let rank = 0;
  for (const entry of list) {
    if (entry.excluded) continue;
    if (!partnerAllowed(entry.partner)) continue;
    const productLines = entry.map[displayKey] ?? [];
    rank += 1;
    rows.push({
      rank,
      partner: entry.partner,
      productLines: productLines.filter((p) => p && !/^\(TBD/i.test(p)),
    });
    if (rows.length >= limit) break;
  }
  return rows;
}

/**
 * Segment z textu: slang + doména + názvy segmentů ze seedu (nejdelší shoda).
 */
export function resolveSegmentFromText(text: string): string | null {
  const fromSlang = resolveContractSegmentFromUserText(text);
  if (fromSlang) return fromSlang;

  const lower = text.toLowerCase();
  const sorted = [...seed.segments].sort(
    (a, b) => b.displayName.length - a.displayName.length || b.label.length - a.label.length,
  );
  for (const s of sorted) {
    if (lower.includes(s.displayName.toLowerCase())) return s.code;
    if (lower.includes(s.label.toLowerCase())) return s.code;
  }
  return null;
}

const RATING_QUERY_RE =
  /\b(rating|ratingy|žebříček|zebricek|top\s*\d{1,2}|top\s+10|nejlepší|nejlepsi|nejlépe\s+hodnocen|nejlépe|doporuč|doporuc|hodnocen|pořadí|poradi|která\s+pojišťovna|ktera\s+pojistovna|které\s+pojištění|ktere\s+pojisteni|kdo\s+má\s+nej|kdo\s+ma\s+nej|jak[áa]\s+(je|jsou)\s+nej|nejvyšší\s+rating|nejvysi\s+rating)\b/i;

const WRITE_INTENT_HINT_RE =
  /\b(založ|zaloz|vytvoř|vytvor|ulož|uloz|proveď|proved|schvál\s+a\s+zapiš|zapiš\s+do\s+crm|zápis|zapis|create\s+opport|execute\s+plan)\b/i;

function looksLikeRatingQuestion(message: string): boolean {
  if (!RATING_QUERY_RE.test(message)) return false;
  if (WRITE_INTENT_HINT_RE.test(message)) return false;
  return true;
}

function formatRatingReply(segmentCode: string, rows: TopPartnerRow[]): string {
  const label = segmentDisplayName(segmentCode) ?? segmentCode;
  const lines: string[] = [
    `**${label}** — pořadí podle interního seed seznamu (ne závazná nabídka):`,
    "",
  ];
  for (const r of rows) {
    const prod =
      r.productLines.length > 0
        ? r.productLines.join("; ")
        : "(produktové řady doplňte z nabídky / dropdownu)";
    lines.push(`${r.rank}. **${r.partner}** — ${prod}`);
  }
  if (seed.note) {
    lines.push("", `*${seed.note.replace(/\n/g, " ")}*`);
  }
  return lines.join("\n");
}

/**
 * Deterministická odpověď na dotaz typu „nejlepší rating“ bez LLM, nebo `null`.
 */
export function tryRatingLookupReply(message: string): string | null {
  if (!looksLikeRatingQuestion(message)) return null;
  const segment = resolveSegmentFromText(message);
  if (!segment) return null;
  const rows = getTopPartnersForSegment(segment, 5);
  if (rows.length === 0) return null;
  return formatRatingReply(segment, rows);
}

export function ratingQueryWouldNeedSegment(message: string): boolean {
  return looksLikeRatingQuestion(message) && resolveSegmentFromText(message) == null;
}

/** Pro testy / telemetrii */
export function __testOnlySeedSegmentCodes(): string[] {
  return seed.segments.map((s) => s.code);
}

type CatalogEntry = { partner: string; category: string; products: string[] };
const catalog = (catalogSeed as { catalog: CatalogEntry[] }).catalog ?? [];

/**
 * Validuje, zda partner (name) existuje v katalogu pro daný segment.
 * Vrací `null` pokud validní, jinak chybovou hlášku.
 */
export function validatePartnerInCatalog(
  partnerName: string,
  segmentCode: string,
): string | null {
  const lower = partnerName.toLowerCase().trim();
  const match = catalog.find(
    (e) =>
      e.category === segmentCode &&
      e.partner.toLowerCase().trim() === lower,
  );
  if (match) return null;
  const anySegment = catalog.find(
    (e) => e.partner.toLowerCase().trim() === lower,
  );
  if (anySegment) {
    return `Partner „${partnerName}" existuje v katalogu, ale ne pro segment ${segmentCode} (nalezen v ${anySegment.category}).`;
  }
  return `Partner „${partnerName}" nebyl nalezen v katalogu. Ověřte přesný název.`;
}

/**
 * Validuje, zda produkt existuje u daného partnera + segmentu.
 * Vrací `null` pokud validní, jinak chybovou hlášku.
 */
export function validateProductInCatalog(
  partnerName: string,
  productName: string,
  segmentCode: string,
): string | null {
  const pLower = partnerName.toLowerCase().trim();
  const prLower = productName.toLowerCase().trim();
  const entry = catalog.find(
    (e) =>
      e.category === segmentCode &&
      e.partner.toLowerCase().trim() === pLower,
  );
  if (!entry) return null;
  const found = entry.products.some(
    (p) => p.toLowerCase().trim() === prLower,
  );
  if (found) return null;
  return `Produkt „${productName}" není v katalogu partnera „${partnerName}" (${segmentCode}). Dostupné: ${entry.products.slice(0, 5).join(", ")}.`;
}
