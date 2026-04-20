import { sql } from "drizzle-orm";
import { pgTable, uuid, text, timestamp, date, boolean, numeric, jsonb } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import type { PortfolioAttributes } from "./portfolio-attributes";

/** Lifecycle for portfolio / client zone (advisor workflow + client visibility rules). */
export const portfolioStatuses = ["draft", "pending_review", "active", "ended"] as const;
export type PortfolioStatus = (typeof portfolioStatuses)[number];

/** How the contract row was created (audit / traceability). */
export const contractSourceKinds = ["manual", "document", "ai_review", "import"] as const;
export type ContractSourceKind = (typeof contractSourceKinds)[number];

/** Segment smlouvy – v souladu s katalogem a top-lists (catalog.json, top-lists-seed-v2.json). */
export const contractSegments = [
  "ZP",
  "MAJ",
  "ODP",
  "AUTO_PR",
  "AUTO_HAV",
  "CEST",
  "INV",
  "DIP",
  "DPS",
  "HYPO",
  "UVER",
  "FIRMA_POJ",
] as const;

/** Mapování kódu segmentu na plný název pro UI. */
export const SEGMENT_LABELS: Record<string, string> = {
  ZP: "Životní pojištění",
  MAJ: "Majetek",
  ODP: "Odpovědnost",
  AUTO_PR: "Auto – povinné ručení",
  AUTO_HAV: "Auto – havarijní pojištění",
  CEST: "Cestovní pojištění",
  INV: "Investice",
  DIP: "Dlouhodobý investiční produkt (DIP)",
  DPS: "Doplňkové penzijní spoření (DPS)",
  HYPO: "Hypotéky",
  UVER: "Úvěry",
  FIRMA_POJ: "Pojištění firem",
};

/** Katalog partnerů (globální nebo per-tenant). */
export const partners = pgTable("partners", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  name: text("name").notNull(),
  segment: text("segment").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Katalog produktů (vázaný na partnera). isTbd = zobrazit badge "doplnit" a tooltip. */
export const products = pgTable("products", {
  id: uuid("id").primaryKey().defaultRandom(),
  partnerId: uuid("partner_id").notNull().references(() => partners.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  category: text("category"),
  isTbd: boolean("is_tbd").default(false),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Evidence smluv – single source of truth pro poradce i klienta. */
export const contracts = pgTable("contracts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("client_id").notNull().references(() => contacts.id, { onDelete: "cascade" }),
  advisorId: text("advisor_id"),
  segment: text("segment").notNull(),
  /** Kanonický kód shodný se segmentem (legacy / reporting); vždy synchronní s `segment`. */
  type: text("type").notNull(),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "set null" }),
  productId: uuid("product_id").references(() => products.id, { onDelete: "set null" }),
  partnerName: text("partner_name"),
  productName: text("product_name"),
  premiumAmount: numeric("premium_amount", { precision: 12, scale: 2 }),
  premiumAnnual: numeric("premium_annual", { precision: 12, scale: 2 }),
  contractNumber: text("contract_number"),
  startDate: date("start_date", { mode: "string" }),
  anniversaryDate: date("anniversary_date", { mode: "string" }),
  note: text("note"),
  archivedAt: timestamp("archived_at", { withTimezone: true }),
  /** Client portal: show this contract in „Moje portfolio“ when true and status allows. */
  visibleToClient: boolean("visible_to_client").notNull().default(true),
  portfolioStatus: text("portfolio_status").notNull().default("active").$type<PortfolioStatus>(),
  sourceKind: text("source_kind").notNull().default("manual").$type<ContractSourceKind>(),
  /** Optional FK to documents.id (set in SQL migration; no TS ref to avoid circular imports). */
  sourceDocumentId: uuid("source_document_id"),
  sourceContractReviewId: uuid("source_contract_review_id"),
  advisorConfirmedAt: timestamp("advisor_confirmed_at", { withTimezone: true }),
  confirmedByUserId: text("confirmed_by_user_id"),
  /** Normalized extras: loan principal, sum insured, fixation, insured persons, subcategory, etc. */
  portfolioAttributes: jsonb("portfolio_attributes")
    .notNull()
    .default(sql`'{}'::jsonb`)
    .$type<PortfolioAttributes>(),
  /** Internal 0–1 confidence from extraction; not exposed to client UI. */
  extractionConfidence: numeric("extraction_confidence", { precision: 5, scale: 4 }),
  /**
   * Klasifikace produktu pro BJ kalkulaci a reportování (INVESTMENT_ENTRY_FEE,
   * LIFE_INSURANCE_REGULAR, MORTGAGE, …). Vyplněno buď z AI extrakce nebo z
   * manuální editace v detailu smlouvy.
   */
  productCategory: text("product_category"),
  /** Upřesňující subtypy (with_ppi, single_payment, biometric_signed, …). */
  productSubtype: jsonb("product_subtype").$type<string[]>(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Platební katalog: globální (tenant_id null) nebo tenant override. Partner + Segment → účet, banka, poznámka. */
export const paymentAccounts = pgTable("payment_accounts", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id"),
  partnerId: uuid("partner_id").references(() => partners.id, { onDelete: "cascade" }),
  partnerName: text("partner_name"),
  segment: text("segment").notNull(),
  accountNumber: text("account_number").notNull(),
  bank: text("bank"),
  note: text("note"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
