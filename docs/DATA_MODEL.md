# Datový model (ER)

## Tenant a oprávnění

- **tenants** – id, name, slug (unique).
- **roles** – id, tenant_id, name (Admin/Manager/Advisor/Viewer), permissions (volitelně).
- **memberships** – id, tenant_id, user_id (Supabase auth.uid()), role_id, invited_by, joined_at, mfa_enabled. Unique (tenant_id, user_id).

## Kontakty a domácnosti

- **contacts** – id, tenant_id, first_name, last_name, email, phone, title, notes, referral_source, referral_contact_id, created_at, updated_at.
- **households** – id, tenant_id, name, created_at, updated_at.
- **household_members** – id, household_id, contact_id, role (primary/member/child), joined_at.
- **organizations** – id, tenant_id, name, ico, dic, address, created_at, updated_at.
- **relationships** – id, tenant_id, from_type, from_id, to_type, to_id, kind, created_at (graf vztahů).

## Pipeline

- **opportunity_stages** – id, tenant_id, name, sort_order, probability.
- **opportunities** – id, tenant_id, contact_id, household_id, case_type (hypo/invest/pojist), title, stage_id, probability, expected_value, expected_close_date, assigned_to, created_at, updated_at, closed_at.

## Úkoly a kalendář

- **tasks** – id, tenant_id, contact_id, opportunity_id, title, description, due_date, completed_at, assigned_to, created_by, created_at, updated_at.
- **events** – id, tenant_id, contact_id, opportunity_id, title, start_at, end_at, all_day, location, assigned_to, created_at, updated_at.

## Meeting notes

- **note_templates** – id, tenant_id, name, domain, schema (JSON), created_at, updated_at.
- **meeting_notes** – id, tenant_id, contact_id, opportunity_id, template_id, meeting_at, participants[], domain, content (JSON), version, created_by, created_at, updated_at.

## Dokumenty

- **documents** – id, tenant_id, contact_id, opportunity_id, name, storage_path, mime_type, size_bytes, tags[], uploaded_by, created_at, updated_at.
- **document_versions** – id, document_id, storage_path, version, uploaded_by, created_at.

## Timeline (interakce)

- **timeline_items** – id, tenant_id, contact_id, opportunity_id, type (call/email/meeting/note), subject, body, created_by, created_at.

## Compliance a audit

- **audit_log** – id, tenant_id, user_id, action, entity_type, entity_id, meta, ip_address, user_agent, created_at.
- **consents** – id, tenant_id, contact_id, purpose_id, granted_at, revoked_at, legal_basis, created_at.
- **processing_purposes** – id, tenant_id, name, legal_basis, retention_months, created_at.
- **aml_checklists** – id, tenant_id, contact_id, performed_by, performed_at, checklist_type, result (JSON), created_at.
- **incident_logs** – id, tenant_id, title, description, severity, status, reported_by, reported_at, resolved_at, meta, created_at, updated_at.
- **exports** – id, tenant_id, contact_id, type (gdpr/compliance_package), requested_by, status, created_at, completed_at.
- **export_artifacts** – id, export_id, kind (zip/json/pdf), storage_path, created_at.

## Placeholder

- **subscriptions** – id, tenant_id, plan, status, current_period_end, created_at, updated_at.
- **invoices** – id, tenant_id, amount, status, created_at.
