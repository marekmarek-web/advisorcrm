import { pgTable, text, timestamp, integer } from "drizzle-orm/pg-core";

/**
 * Idempotence Stripe webhooků (event.id).
 *
 * Stavový automat:
 *  - `processing` — handler běží
 *  - `completed`  — handler úspěšně doběhl (duplicate retry z Stripu je no-op)
 *  - `failed`     — handler shodil, Stripe ho bude retryovat; řádek zůstává
 *                   a další retry ho vezme zpět do `processing`.
 */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  status: text("status").notNull().default("completed"),
  attempts: integer("attempts").notNull().default(1),
  lastError: text("last_error"),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
  processedAt: timestamp("processed_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
