-- Stripe: workspace subscription billing (tenant ↔ Stripe Customer + Subscription)
ALTER TABLE tenants ADD COLUMN IF NOT EXISTS stripe_customer_id text;
CREATE UNIQUE INDEX IF NOT EXISTS tenants_stripe_customer_id_unique
  ON tenants (stripe_customer_id)
  WHERE stripe_customer_id IS NOT NULL;

ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS stripe_subscription_id text;
CREATE UNIQUE INDEX IF NOT EXISTS subscriptions_stripe_subscription_id_unique
  ON subscriptions (stripe_subscription_id)
  WHERE stripe_subscription_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id text PRIMARY KEY,
  received_at timestamptz NOT NULL DEFAULT now()
);
