import { pgTable, uuid, text, timestamp } from "drizzle-orm/pg-core";
import { tenants } from "./tenants";

export const portalFeedbackCategories = ["bug", "idea"] as const;
export type PortalFeedbackCategory = (typeof portalFeedbackCategories)[number];

/** User-submitted bug reports and improvement ideas from the advisor portal. */
export const portalFeedback = pgTable("portal_feedback", {
  id: uuid("id").primaryKey().defaultRandom(),
  tenantId: uuid("tenant_id")
    .notNull()
    .references(() => tenants.id, { onDelete: "cascade" }),
  userId: text("user_id").notNull(),
  category: text("category").notNull(),
  title: text("title").notNull(),
  body: text("body").notNull(),
  pageUrl: text("page_url"),
  userAgent: text("user_agent"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});
