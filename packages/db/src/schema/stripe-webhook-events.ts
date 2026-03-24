import { pgTable, text, timestamp } from "drizzle-orm/pg-core";

/** Idempotence Stripe webhooků (event.id). */
export const stripeWebhookEvents = pgTable("stripe_webhook_events", {
  id: text("id").primaryKey(),
  receivedAt: timestamp("received_at", { withTimezone: true }).defaultNow().notNull(),
});
