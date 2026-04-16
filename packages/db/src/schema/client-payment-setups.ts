import { pgTable, uuid, text, timestamp, numeric, boolean, integer } from "drizzle-orm/pg-core";
import { contacts } from "./contacts";
import { contractUploadReviews } from "./contract-upload-reviews";

/** Plan 3 §9.2 — payment instructions for client portal / advisor. */
export type ClientPaymentSetupStatus = "draft" | "review_required" | "active" | "archived";
export type ClientPaymentSetupPaymentType = "insurance" | "investment" | "pension" | "contribution" | "loan" | "other";

export const clientPaymentSetups = pgTable("client_payment_setups", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id").notNull(),
  contactId: uuid("contact_id")
    .notNull()
    .references(() => contacts.id, { onDelete: "cascade" }),
  sourceContractReviewId: uuid("source_contract_review_id").references(() => contractUploadReviews.id, {
    onDelete: "set null",
  }),
  status: text("status").$type<ClientPaymentSetupStatus>().notNull().default("draft"),
  paymentType: text("payment_type").$type<ClientPaymentSetupPaymentType>().notNull().default("other"),
  providerName: text("provider_name"),
  productName: text("product_name"),
  contractNumber: text("contract_number"),
  beneficiaryName: text("beneficiary_name"),
  accountNumber: text("account_number"),
  bankCode: text("bank_code"),
  iban: text("iban"),
  bic: text("bic"),
  variableSymbol: text("variable_symbol"),
  specificSymbol: text("specific_symbol"),
  constantSymbol: text("constant_symbol"),
  amount: numeric("amount", { precision: 14, scale: 2 }),
  currency: text("currency"),
  frequency: text("frequency"),
  firstPaymentDate: text("first_payment_date"),
  dueDayOfMonth: integer("due_day_of_month"),
  paymentInstructionsText: text("payment_instructions_text"),
  confidence: numeric("confidence", { precision: 4, scale: 3 }),
  needsHumanReview: boolean("needs_human_review").default(true),
  /** Whether this payment setup is visible in the client portal. Advisor controls this. */
  visibleToClient: boolean("visible_to_client").notNull().default(false),
  /** Canonical segment code (ZP, MAJ, INV, DPS, HYPO, UVER, …) — used for portal card grouping/icon. */
  segment: text("segment"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
