import { pgTable, uuid, text, timestamp, date, boolean, numeric } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";

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
