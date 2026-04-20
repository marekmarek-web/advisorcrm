import {
  pgTable,
  uuid,
  text,
  timestamp,
  numeric,
  integer,
  jsonb,
  unique,
} from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/**
 * BJ kalkulační koeficienty pro jednotlivé produkty / kategorie.
 *
 * Per-tenant tabulka — každá kancelář může mít vlastní výchozí hodnoty. Není-li
 * konkrétní partner/produkt v tenantu uveden, použije se řádek s tenant_id =
 * NULL (globální default seedovaný z BP_kariera_01-2022, sloupce „BJ sazebník"
 * + produktová tabulka).
 *
 * Vzorec je vždy:
 *     BJ = amount_Kč × coefficient         (pokud není `divisor`)
 *     BJ = amount_Kč / divisor             (pokud je `divisor` nastaven)
 *
 * Pole `formula` jen říká, KTERÁ částka ze smlouvy se má použít:
 *   - "entry_fee"           — vstupní poplatek v Kč (Amundi, Edward, Codya, …)
 *   - "client_contribution" — příspěvek účastníka / klientova platba (Conseq DPS)
 *   - "annual_premium"      — roční pojistné v Kč (NN, Uniqa, Maxima, Pillow…)
 *   - "loan_principal"      — jistina úvěru v Kč (RB, UCB, RSTS, Presto, ČSOB Leasing)
 *   - "investment_amount"   — výše investice v Kč (ATRIS, EFEKTA realitní fondy)
 *
 * Příklady (ověřené proti tabulce „Body" v kariérním plánu):
 *   • Amundi, vstupní poplatek 1 000 Kč  → 1 000 / 238,10 = 4,20 BJ
 *   • Edward, vstupní poplatek 1 000 Kč  → 1 000 × 0,00360 = 3,60 BJ
 *   • Codya IS, vstupní poplatek 1 000 Kč → 1 000 × 0,00400 = 4,00 BJ
 *   • Conseq PS, příspěvek 1 000 Kč      → 1 000 × 0,01100 = 11,00 BJ (cap 1 700)
 *   • Pillow, roční pojistné 1 000 Kč    → 1 000 × 0,00060 = 0,60 BJ
 *   • NN Život, roční pojistné 12 000 Kč → 12 000 × 0,00780 = 93,60 BJ
 *   • Maxima, roční pojistné 12 000 Kč   → 12 000 × 0,00783 = 94,00 BJ
 *   • RB hypotéka, jistina 1 000 000 Kč  → 1 000 000 × 0,0000448 = 44,80 BJ
 *   • UCB hypotéka, jistina 1 000 000 Kč → 1 000 000 × 0,00007 = 70,00 BJ
 *   • RSTS úvěr bez PPI 1 000 000 Kč     → 1 000 000 × 0,000112 = 112 BJ
 *   • RSTS úvěr s PPI 1 000 000 Kč       → 1 000 000 × 0,000132 = 132 BJ
 *   • UCB PRESTO 1 000 000 Kč            → 1 000 000 × 0,00011 = 110 BJ
 *   • ČSOB Leasing 1 000 000 Kč          → 1 000 000 × 0,000072 = 72 BJ
 *   • ATRIS realitní fond 1 000 000 Kč   → 1 000 000 × 0,00016 = 160 BJ
 *   • EFEKTA realitní fond 1 000 000 Kč  → 1 000 000 × 0,00019605 = 196,05 BJ
 */
export const bjCoefficients = pgTable(
  "bj_coefficients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = globální default. Per-tenant override má přednost. */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    /** Klíč kategorie (PRODUCT_CATEGORIES) — např. INVESTMENT_ENTRY_FEE. */
    productCategory: text("product_category").notNull(),
    /**
     * Volitelné upřesnění — regex partnera (Amundi, Conseq, RB…) nebo produktu.
     * Matchuje se přes providerName + productName (case insensitive, unicode).
     * Per-partner řádek má přednost před category-only řádkem.
     */
    partnerPattern: text("partner_pattern"),
    /** Volitelný subtype (with_ppi, single_payment, …) pro jemnější pravidla. */
    subtype: text("subtype"),
    /** Která částka ze smlouvy se použije — viz docstring tabulky. */
    formula: text("formula").notNull(),
    /**
     * Přímý multiplikátor "BJ per 1 Kč". Když je nastaven `divisor`,
     * coefficient se ignoruje (použije se `amount / divisor`).
     * Příklady: 0,00400 pro Codya (4 BJ za 1 000 Kč VP), 0,00007 pro UCB
     * hypotéku (70 BJ za 1 000 000 Kč jistiny).
     */
    coefficient: numeric("coefficient", { precision: 14, scale: 8 }),
    /**
     * Alternativa ke coefficient — častý zápis kariérního plánu.
     * Amundi investice: divisor = 238,10 → BJ = VP / 238,10.
     */
    divisor: numeric("divisor", { precision: 14, scale: 4 }),
    /** Maximální započitatelná částka (např. Conseq DPS: 1 700 Kč měs.). */
    cap: numeric("cap", { precision: 14, scale: 2 }),
    /** Minimální započitatelná částka (pod ní se vůbec nepočítá). */
    floor: numeric("floor", { precision: 14, scale: 2 }),
    /** Volitelné poznámky / justifikace pravidla. */
    note: text("note"),
    /** Platnost od. NULL = vždy. */
    effectiveFrom: timestamp("effective_from", { withTimezone: true }),
    /** Platnost do. NULL = neomezeno. */
    effectiveTo: timestamp("effective_to", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqTenantCategoryPartner: unique("bj_coef_unique").on(
      t.tenantId,
      t.productCategory,
      t.partnerPattern,
      t.subtype,
    ),
  }),
);

/**
 * Kariérní pozice z BP_kariera_01-2022.
 *
 * Výnos poradce = BJ × bjValueCzk (pozice určuje Kč za 1 BJ).
 *   • T1 Trainee 1   = 62,50 Kč
 *   • T2 Trainee 2   = 75,00 Kč
 *   • R1 Reprezentant 1       = 87,50 Kč
 *   • VR2 Vedoucí reprez. 2   = 100,00 Kč
 *   • VR3 Vedoucí reprez. 3   = 112,50 Kč
 *   • VR4 Vedoucí reprez. 4   = 125,00 Kč
 *   • M1 Obchodní vedoucí     = 137,50 Kč
 *   • M1+ Obchodní ved. senior = 150,00 Kč
 *   • M2 Oblastní vedoucí     = 162,50 Kč
 *   • D1 Oblastní ředitel     = 175,00 Kč
 *   • D2 Regionální ředitel   = 187,50 Kč
 *   • D3 Zemský ředitel       = 200,00 Kč (strop)
 */
export const careerPositionCoefficients = pgTable(
  "career_position_coefficients",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    /** NULL = globální default. Per-tenant override má přednost. */
    tenantId: uuid("tenant_id").references(() => tenants.id, { onDelete: "cascade" }),
    /** Kód pozice (T1, T2, R1, VR2, …, D3). */
    positionKey: text("position_key").notNull(),
    /** Lidský název pozice pro UI. */
    positionLabel: text("position_label").notNull(),
    /** Úroveň v kariérním žebříčku (1 = T1, 12 = D3). */
    positionLevel: integer("position_level").notNull(),
    /**
     * Hodnota 1 BJ v Kč pro tuto pozici — rozsah 62,50 (T1) až 200,00 (D3).
     * Žádný default, každý řádek má svou hodnotu podle kariérního plánu.
     */
    bjValueCzk: numeric("bj_value_czk", { precision: 10, scale: 2 }).notNull(),
    /**
     * Kolik BJ (měs. netto) je třeba pro postup na tuto pozici.
     * U některých pozic je to tým nebo historický strop — viz meta.
     */
    bjThreshold: numeric("bj_threshold", { precision: 14, scale: 2 }),
    /** Požadavky na postup / historická měsíční produkce / poznámky. */
    meta: jsonb("meta").$type<Record<string, unknown>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    uniqTenantPosition: unique("career_pos_unique").on(t.tenantId, t.positionKey),
  }),
);

export type BjCoefficientRow = typeof bjCoefficients.$inferSelect;
export type CareerPositionCoefficientRow = typeof careerPositionCoefficients.$inferSelect;
