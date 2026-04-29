/**
 * Normalizace cest k reportovým vizuálům: dokud nejsou v `public/` commitnuté reálné soubory,
 * nahrazujeme je stabilními SVG placeholdery (žádné 404 v HTML/PDF).
 */

import type { FundAssetPack } from "./types";

export const FUND_PLACEHOLDER_LOGO_PATH = "/logos/funds/_placeholder.svg";
export const FUND_PLACEHOLDER_HERO_PATH = "/report-assets/_placeholders/fund-hero.svg";
export const FUND_PLACEHOLDER_GALLERY_PATH = "/report-assets/_placeholders/fund-gallery.svg";

/** Soubory skutečně přítomné v `apps/web/public` (rozšiřovat při přidávání log). */
const COMMITTED_LOGO_PATHS = new Set<string>([
  "/logos/funds/ishares_brand.png",
  "/logos/funds/vanguard_ftse_emerging_markets.png",
  "/logos/funds/fidelity_target_2040.png",
  "/logos/funds/investika_realitni_fond.png",
  "/logos/funds/monetika.png",
  "/logos/funds/efektika.png",
  "/logos/funds/conseq_globalni_akciovy_ucastnicky.png",
  "/logos/funds/nn_povinny_konzervativni.png",
  "/logos/funds/nn_vyvazeny.png",
  "/logos/funds/nn_rustovy.png",
  "/logos/funds/creif.png",
  "/logos/funds/atris.png",
  "/logos/funds/penta.png",
  FUND_PLACEHOLDER_LOGO_PATH,
]);

/** Cesty k souborům v `public/report-assets/` (včetně per-fund SVG zástupců). */
function isCommittedReportVisualPath(p: string): boolean {
  if (p.startsWith("/report-assets/_placeholders/")) return true;
  if (p.startsWith("/report-assets/funds/")) return true;
  if (p.startsWith("/report-assets/creif/")) return true;
  if (p.startsWith("/report-assets/atris/")) return true;
  if (p.startsWith("/report-assets/penta/")) return true;
  if (p.startsWith("/report-assets/msci/")) return true;
  return false;
}

function resolveLogoPath(raw: string | undefined): string {
  const s = raw?.trim();
  if (!s) return FUND_PLACEHOLDER_LOGO_PATH;
  if (COMMITTED_LOGO_PATHS.has(s)) return s;
  return FUND_PLACEHOLDER_LOGO_PATH;
}

function resolveHeroPath(raw: string | undefined): string {
  const s = raw?.trim();
  if (!s) return FUND_PLACEHOLDER_HERO_PATH;
  if (isCommittedReportVisualPath(s)) return s;
  return FUND_PLACEHOLDER_HERO_PATH;
}

function resolveGalleryPaths(raw: string[] | undefined): [string, string, string] {
  const items = (raw ?? []).map((x) => x?.trim()).filter((x): x is string => Boolean(x));
  const out: string[] = [];
  for (const p of items) {
    out.push(isCommittedReportVisualPath(p) ? p : FUND_PLACEHOLDER_GALLERY_PATH);
    if (out.length >= 3) break;
  }
  while (out.length < 3) out.push(FUND_PLACEHOLDER_GALLERY_PATH);
  return [out[0]!, out[1]!, out[2]!];
}

export function normalizeFundAssetsFromSeed(row: {
  logo?: string;
  heroImage?: string;
  galleryImages?: string[];
  galleryType?: "photo" | "logo";
}): FundAssetPack {
  return {
    logoPath: resolveLogoPath(row.logo),
    heroPath: resolveHeroPath(row.heroImage),
    galleryPaths: resolveGalleryPaths(row.galleryImages),
    galleryType: row.galleryType ?? "photo",
  };
}

export function isPlaceholderFundLogoPath(p: string | undefined): boolean {
  return !p?.trim() || p.trim() === FUND_PLACEHOLDER_LOGO_PATH;
}

export function isPlaceholderFundHeroPath(p: string | undefined): boolean {
  return !p?.trim() || p.trim() === FUND_PLACEHOLDER_HERO_PATH;
}

export function isPlaceholderFundGalleryPath(p: string | undefined): boolean {
  return !p?.trim() || p.trim() === FUND_PLACEHOLDER_GALLERY_PATH;
}

/** Logo je skutečný brand asset v repu (ne generický placeholder). */
export function fundUsesBrandLogoPath(logoPath: string | undefined): boolean {
  const s = logoPath?.trim();
  if (!s || s === FUND_PLACEHOLDER_LOGO_PATH) return false;
  return COMMITTED_LOGO_PATHS.has(s);
}

/** Hero / galerie jsou mimo generické SVG placeholdery (může jít o cílovou cestu k souboru k doplnění). */
export function fundUsesBrandHeroPath(heroPath: string | undefined): boolean {
  return !isPlaceholderFundHeroPath(heroPath);
}

export function fundUsesBrandGalleryPaths(galleryPaths: string[] | undefined): boolean {
  const g = galleryPaths ?? [];
  if (g.length < 3) return false;
  return g.slice(0, 3).every((p) => !isPlaceholderFundGalleryPath(p));
}

/**
 * Logo, hero i galerie nejsou generické placeholdery (odpovídá „hotovému“ obsahu po doplnění binárních assetů).
 */
export function fundHasFullyCommittedVisualPack(pack: FundAssetPack): boolean {
  return (
    fundUsesBrandLogoPath(pack.logoPath) &&
    fundUsesBrandHeroPath(pack.heroPath) &&
    fundUsesBrandGalleryPaths(pack.galleryPaths)
  );
}
