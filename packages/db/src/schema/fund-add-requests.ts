import { pgTable, text, timestamp, uuid } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

/** Jednoduchá fronta bez schvalovacího workflow — kurátor mění stav ručně. */
export const FUND_ADD_REQUEST_STATUSES = ["new", "in_progress", "added", "rejected"] as const;

export type FundAddRequestStatus = (typeof FUND_ADD_REQUEST_STATUSES)[number];

export function isFundAddRequestStatus(v: string): v is FundAddRequestStatus {
  return (FUND_ADD_REQUEST_STATUSES as readonly string[]).includes(v);
}

/** Interní požadavek poradce na doplnění fondu do katalogu (neschvaluje se automaticky). */
export const fundAddRequests = pgTable("fund_add_requests", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  fundName: text("fund_name").notNull(),
  provider: text("provider"),
  isinOrTicker: text("isin_or_ticker"),
  factsheetUrl: text("factsheet_url"),
  category: text("category"),
  note: text("note"),
  status: text("status").notNull().default("new"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
