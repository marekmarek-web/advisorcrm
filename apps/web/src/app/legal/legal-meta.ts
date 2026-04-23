export const LEGAL_COMPANY_NAME = "Aidvisora s.r.o.";

export const LEGAL_ADDRESS_LINE = "Vraňany 6, 277 07 Mlčechvosty, Česká republika";

/** Identifikační číslo organizace (veřejný údaj). */
export const LEGAL_ICO = "05474434";

/** DIČ doplníte po přidělení; do té doby zůstává tento text. */
export const LEGAL_DIC_PENDING_NOTE = "DIČ bude uvedeno po přidělení.";

/** Primární veřejný kontakt — sjednoceno s marketingem a patičkou webu. */
export const LEGAL_SUPPORT_EMAIL = "podpora@aidvisora.cz";
export const LEGAL_PODPORA_EMAIL = "podpora@aidvisora.cz";

/** Datum účinnosti veřejných právních textů (shodně ve všech dokumentech). */
export const LEGAL_EFFECTIVE_CS = "27. 3. 2026";

/**
 * Semver-like verze publikovaných právních textů. Inkrementuje se při každé
 * materiální změně (jiné formulace, nové klauzule). Uložena v
 * `user_terms_acceptance.version` jako důkaz, kterou verzi uživatel akceptoval.
 *
 * Cross-reference: `apps/web/src/lib/legal/terms-acceptance.ts`.
 */
export const LEGAL_DOCUMENT_VERSION = "2026-03-27";

/**
 * Kontexty, v nichž evidujeme souhlas (CHECK constraint na DB straně).
 */
export const LEGAL_ACCEPTANCE_CONTEXTS = [
  "register",
  "checkout",
  "staff-invite",
  "client-invite",
  "beta-terms",
] as const;
export type LegalAcceptanceContext = (typeof LEGAL_ACCEPTANCE_CONTEXTS)[number];

/** Odkaz na kotvu ceníku na landing page. */
export const LEGAL_PRICING_HREF = "/#cenik";

export type LegalDocumentSlug =
  | "terms"
  | "privacy"
  | "dpa"
  | "ai-disclaimer"
  | "cookies"
  | "subprocessors";

/** E-mail pro bezpečnostní incidenty (oddělený od běžné podpory). */
export const LEGAL_SECURITY_EMAIL = "bezpecnost@aidvisora.cz";

/**
 * Provozní stav — do spuštění externí status page (Instatus/Statuspage) cílíme
 * na interní `/status` routu, která renderuje živý health snapshot.
 * Po spuštění public statuspage nahradit za `https://status.aidvisora.cz`.
 */
export const LEGAL_STATUS_PAGE_URL = "/status";
