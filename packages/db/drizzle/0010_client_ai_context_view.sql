-- AI-ready view: one row per contact with aggregated context (no raw payloads).
-- Always filter by contact_id and tenant_id in application.
CREATE OR REPLACE VIEW "client_ai_context" AS
SELECT
  c.id AS contact_id,
  c.tenant_id,
  trim(c.first_name || ' ' || coalesce(c.last_name, '')) AS display_name,
  c.email,
  c.phone,
  (SELECT h2.name FROM household_members hm2 JOIN households h2 ON h2.id = hm2.household_id WHERE hm2.contact_id = c.id LIMIT 1) AS household_name,
  fa.updated_at AS last_analysis_at,
  fa.status AS last_analysis_status,
  fa.id AS last_analysis_id,
  (SELECT count(*)::int FROM contracts ct WHERE ct.client_id = c.id AND ct.tenant_id = c.tenant_id) AS active_contracts_count,
  (SELECT min(ct.anniversary_date) FROM contracts ct WHERE ct.client_id = c.id AND ct.tenant_id = c.tenant_id AND ct.anniversary_date >= current_date) AS next_anniversary_date,
  (
    SELECT max(u.dt) FROM (
      SELECT e.start_at AS dt FROM events e WHERE e.contact_id = c.id AND e.tenant_id = c.tenant_id
      UNION ALL
      SELECT mn.meeting_at AS dt FROM meeting_notes mn WHERE mn.contact_id = c.id AND mn.tenant_id = c.tenant_id
      UNION ALL
      SELECT ti.created_at AS dt FROM timeline_items ti WHERE ti.contact_id = c.id AND ti.tenant_id = c.tenant_id
    ) u
  ) AS last_contact_at,
  (SELECT count(*)::int FROM opportunities o WHERE o.contact_id = c.id AND o.tenant_id = c.tenant_id AND o.closed_at IS NULL) AS open_opportunities_count,
  (SELECT count(*)::int FROM tasks t WHERE t.contact_id = c.id AND t.tenant_id = c.tenant_id AND t.completed_at IS NULL) AS open_tasks_count,
  c.next_service_due
FROM contacts c
LEFT JOIN LATERAL (
  SELECT fa2.id, fa2.status, fa2.updated_at FROM financial_analyses fa2
  WHERE fa2.contact_id = c.id AND fa2.tenant_id = c.tenant_id
  ORDER BY fa2.updated_at DESC NULLS LAST
  LIMIT 1
) fa ON true;
