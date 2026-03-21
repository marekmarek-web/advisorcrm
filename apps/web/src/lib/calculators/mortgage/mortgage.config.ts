/**
 * Mortgage calculator – banks data, product types, limits (1:1 with hypotecni.html).
 */

import type { BankEntry, ProductSubType } from "./mortgage.types";

/** Logos from public/logos; empty string = use initials fallback in UI */
export const BANKS_DATA: BankEntry[] = [
  { id: "fio", name: "Fio banka", baseRate: 4.18, loanRate: 5.9, logoUrl: "" },
  { id: "moneta", name: "Moneta Money Bank", baseRate: 4.19, loanRate: 6.0, logoUrl: "" },
  { id: "ucb", name: "UniCredit Bank", baseRate: 4.29, loanRate: 6.5, logoUrl: "/logos/unicredit-logo.png" },
  { id: "airbank", name: "Air Bank", baseRate: 4.39, loanRate: 6.2, logoUrl: "" },
  { id: "rb", name: "Raiffeisenbank", baseRate: 4.34, loanRate: 5.9, logoUrl: "/logos/raiffeisenbank-logo.png" },
  { id: "partners", name: "Partners Banka", baseRate: 4.59, loanRate: 6.4, logoUrl: "" },
  { id: "csob", name: "ČSOB", baseRate: 4.79, loanRate: 7.9, logoUrl: "/logos/csob-logo.png" },
  { id: "kb", name: "Komerční banka", baseRate: 4.59, loanRate: 6.9, logoUrl: "/logos/kb-logo.png" },
  { id: "cs", name: "Česká spořitelna", baseRate: 4.59, loanRate: 7.5, logoUrl: "/logos/ceska-sporitelna.png" },
  { id: "mbank", name: "mBank", baseRate: 4.79, loanRate: 6.2, logoUrl: "/logos/mbank-logo.png" },
  { id: "rsts", name: "Raiffeisen stavební spořitelna", baseRate: 4.49, loanRate: 6.1, logoUrl: "/logos/raiffeisenbank-logo.png" },
  { id: "mpyr", name: "Modrá pyramida", baseRate: 4.69, loanRate: 6.8, logoUrl: "/logos/modra-pyramida.png" },
];

export const PRODUCT_TYPES: Record<"mortgage" | "loan", ProductSubType[]> = {
  mortgage: [
    { id: "standard", label: "Klasická", info: "Nejčastější hypotéka na vlastní bydlení. Výhodná sazba a možnost LTV až 90 %." },
    { id: "investment", label: "Investiční", info: "Hypotéka na nemovitost k pronájmu. Pozor: LTV je bankami omezeno na maximálně 70 %." },
    { id: "american", label: "Americká", info: "Neúčelová hypotéka zajištěná nemovitostí. Peníze můžete použít na cokoliv, ale sazba bývá vyšší. Max LTV 70 %." },
  ],
  loan: [
    { id: "consumer", label: "Spotřebitelský", info: "Klasická půjčka na cokoliv bez zajištění nemovitostí. Rychlé vyřízení." },
    { id: "auto", label: "Auto / Leasing", info: "Účelová půjčka na nákup automobilu. Často s výhodnější sazbou než běžný úvěr." },
    { id: "consolidation", label: "Konsolidace", info: "Sloučení více půjček, kreditek a kontokorentů do jedné. Získáte nižší splátku a lepší přehled." },
  ],
};

export const LIMITS = {
  mortgage: { min: 500_000, max: 30_000_000, step: 100_000, default: 6_000_000 },
  loan: { min: 20_000, max: 2_500_000, step: 5_000, default: 200_000 },
} as const;

/** Term (years): mortgage 5–35; loan consumer/consolidation 1–12; loan auto 1–10. */
export const TERM_LIMITS = {
  mortgage: { min: 5, max: 35 },
  loanConsumer: { min: 1, max: 12 },
  loanAuto: { min: 1, max: 10 },
} as const;

/** Own resources / akontace: 0–15M, step 10k (1:1 HTML). */
export const OWN_LIMITS = { min: 0, max: 15_000_000, step: 10_000 } as const;

/** Extra money (consolidation only): 0–1M, step 10k. */
export const EXTRA_LIMITS = { min: 0, max: 1_000_000, step: 10_000 } as const;

export const DEFAULT_STATE = {
  product: "mortgage" as const,
  mortgageType: "standard" as const,
  loanType: "consumer" as const,
  loan: 6_000_000,
  own: 600_000,
  extra: 0,
  term: 30,
  fix: 5,
  type: "new" as const,
  ltvLock: 90 as number | null,
} as const;
