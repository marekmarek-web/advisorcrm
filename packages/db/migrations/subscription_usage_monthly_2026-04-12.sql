-- Phase 3: monthly AI / review usage per workspace for quota foundation.
CREATE TABLE IF NOT EXISTS subscription_usage_monthly (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
  period_month text NOT NULL,
  assistant_actions_used integer NOT NULL DEFAULT 0,
  image_intakes_used integer NOT NULL DEFAULT 0,
  ai_review_pages_used integer NOT NULL DEFAULT 0,
  input_tokens_used bigint NOT NULL DEFAULT 0,
  output_tokens_used bigint NOT NULL DEFAULT 0,
  estimated_cost numeric(18, 8) NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS subscription_usage_monthly_tenant_period_uq
  ON subscription_usage_monthly (tenant_id, period_month);

COMMENT ON TABLE subscription_usage_monthly IS 'Monthly usage counters (UTC YYYY-MM) for billing quota vs plan-catalog PlanLimits.';
