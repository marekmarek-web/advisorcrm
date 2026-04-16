/**
 * Maps institution/partner names to logo file paths served from /logos/.
 * Falls back to null — callers should render initials or a generic icon.
 */

type LogoEntry = { file: string; alt: string };

const LOGO_MAP: { keywords: string[]; logo: LogoEntry }[] = [
  { keywords: ["allianz"], logo: { file: "allianz.png", alt: "Allianz" } },
  { keywords: ["generali"], logo: { file: "generali.png", alt: "Generali" } },
  { keywords: ["kooperativa", "koop"], logo: { file: "kooperativa_logo.png", alt: "Kooperativa" } },
  { keywords: ["česká spořitelna", "ceska sporitelna", "cs"], logo: { file: "ceska-sporitelna.png", alt: "Česká spořitelna" } },
  { keywords: ["csob", "čsob"], logo: { file: "csob-logo.png", alt: "ČSOB" } },
  { keywords: ["kb", "komerční banka", "komercni banka"], logo: { file: "kb-logo.png", alt: "KB" } },
  { keywords: ["air bank", "airbank"], logo: { file: "mbank-logo.png", alt: "Air Bank" } },
  { keywords: ["mbank", "m bank"], logo: { file: "mbank-logo.png", alt: "mBank" } },
  { keywords: ["raiffeisenbank", "rb"], logo: { file: "raiffeisenbank-logo.png", alt: "Raiffeisenbank" } },
  { keywords: ["unicredit", "uni credit"], logo: { file: "unicredit-logo.png", alt: "UniCredit" } },
  { keywords: ["nn", "nationale nederlanden"], logo: { file: "nn.png", alt: "NN" } },
  { keywords: ["uniqa"], logo: { file: "uniqa.png", alt: "UNIQA" } },
  { keywords: ["axa"], logo: { file: "axa.png", alt: "AXA" } },
  { keywords: ["metlife", "met life"], logo: { file: "metlife.png", alt: "MetLife" } },
  { keywords: ["conseq"], logo: { file: "conseq-logo.png", alt: "Conseq" } },
  { keywords: ["portu"], logo: { file: "avant-logo.png", alt: "Portu" } },
  { keywords: ["avant"], logo: { file: "avant-logo.png", alt: "Avant" } },
  { keywords: ["investika"], logo: { file: "investika-logo.png", alt: "Investika" } },
  { keywords: ["amundi"], logo: { file: "amundi-logo.png", alt: "Amundi" } },
  { keywords: ["cyrrus"], logo: { file: "cyrrus-logo.png", alt: "Cyrrus" } },
  { keywords: ["edward"], logo: { file: "edward-logo.png", alt: "Edward" } },
  { keywords: ["j&t", "jt banka", "j&t banka"], logo: { file: "kb-logo.png", alt: "J&T Banka" } },
  { keywords: ["čpp", "cpp", "česká podnikatelská pojišťovna"], logo: { file: "cpp.png", alt: "ČPP" } },
  { keywords: ["slavia"], logo: { file: "slavia.jpg", alt: "Slavia" } },
  { keywords: ["modra pyramida", "modrá pyramida"], logo: { file: "modra-pyramida.png", alt: "Modrá pyramida" } },
  { keywords: ["maxima"], logo: { file: "maxima.png", alt: "Maxima" } },
  { keywords: ["atris"], logo: { file: "atris.png", alt: "Atris" } },
  { keywords: ["penta"], logo: { file: "Penta.png", alt: "Penta" } },
  { keywords: ["fidelity"], logo: { file: "fidelity.png", alt: "Fidelity" } },
  { keywords: ["ishares", "blackrock"], logo: { file: "ishares.png", alt: "iShares" } },
];

/**
 * Returns { src, alt } for a known institution or null for unknowns.
 * `src` is a root-relative path to the Next.js public/logos directory.
 */
export function resolveInstitutionLogo(
  institutionName: string | null | undefined
): { src: string; alt: string } | null {
  if (!institutionName) return null;
  const lower = institutionName.toLowerCase();
  for (const entry of LOGO_MAP) {
    if (entry.keywords.some((kw) => lower.includes(kw))) {
      return { src: `/logos/${entry.logo.file}`, alt: entry.logo.alt };
    }
  }
  return null;
}

/** Returns up-to-2-char initials from an institution name for avatar fallback. */
export function institutionInitials(name: string | null | undefined): string {
  if (!name) return "?";
  const words = name.trim().split(/\s+/);
  if (words.length === 1) return name.slice(0, 2).toUpperCase();
  return (words[0][0] + words[1][0]).toUpperCase();
}
