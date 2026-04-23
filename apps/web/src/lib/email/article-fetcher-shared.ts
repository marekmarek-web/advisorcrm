/**
 * Sdílené typy a whitelist pro article fetcher. Bez `server-only`, aby je mohly
 * importovat klientské komponenty (nápověda UI); samotné fetchování zůstává v
 * `article-fetcher.ts`.
 */
export type ArticleMetadata = {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
  sourceName: string | null;
  canonicalUrl: string | null;
};

/**
 * Whitelist důvěryhodných domén pro ruční kurátování článků.
 *
 * Přidání další domény si žádá explicitní review — nesnažíme se podporovat
 * libovolnou URL, protože server-side fetch nedůvěryhodných URL je SSRF vector.
 * Match: `host === domain` nebo `host.endsWith('.' + domain)`.
 */
export const ARTICLE_FETCHER_ALLOWED_DOMAINS: readonly string[] = [
  "kurzy.cz",
  "penize.cz",
  "hypoindex.cz",
  "idnes.cz",
  "aktualne.cz",
  "e15.cz",
  "seznamzpravy.cz",
  "novinky.cz",
  "roklen24.cz",
  "cnb.cz",
  "mfcr.cz",
  "ceskenoviny.cz",
  "mesec.cz",
  "finance.cz",
  "investujeme.cz",
];

export function isDomainAllowed(host: string): boolean {
  const h = host.toLowerCase().replace(/^www\./, "");
  return ARTICLE_FETCHER_ALLOWED_DOMAINS.some(
    (d) => h === d || h.endsWith(`.${d}`),
  );
}

/** Odmítne privátní, loopback a link-local adresy (IPv4 + IPv6) pro SSRF guard. */
export function isPrivateOrInvalidHost(host: string): boolean {
  const h = host.toLowerCase();
  if (!h) return true;
  if (h === "localhost") return true;
  // IPv6 loopback / link-local / ULA
  if (h === "::1" || h.startsWith("fe80:") || h.startsWith("fc") || h.startsWith("fd")) {
    return true;
  }
  // IPv4 dotted quad
  const m = h.match(/^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/);
  if (m) {
    const [a, b] = [Number(m[1]), Number(m[2])];
    if (a === 10) return true;
    if (a === 127) return true;
    if (a === 0) return true;
    if (a === 169 && b === 254) return true;
    if (a === 172 && b >= 16 && b <= 31) return true;
    if (a === 192 && b === 168) return true;
    if (a >= 224) return true; // multicast + reserved
  }
  return false;
}
