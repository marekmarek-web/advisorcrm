-- Ruční doplnění metrik business plánu + cílový mix donut (když chybí produkce v období).
ALTER TABLE advisor_business_plans
  ADD COLUMN IF NOT EXISTS manual_metric_adjustments jsonb,
  ADD COLUMN IF NOT EXISTS target_mix_pct jsonb;
