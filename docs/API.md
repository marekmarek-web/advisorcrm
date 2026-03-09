# API – REST a webhooky

## Zásady

- Autentizace: Supabase JWT v hlavičce `Authorization: Bearer <access_token>`.
- Multi-tenant: `tenant_id` z membership uživatele; všechny dotazy filtrovány podle tenant_id.
- Odpovědi: JSON. Chyby: HTTP 4xx/5xx + tělo `{ "error": "code", "message": "..." }`.

## Endpointy (návrh pro MVP)

- `GET/POST /api/contacts` – seznam, vytvoření.
- `GET/PATCH/DELETE /api/contacts/[id]` – detail, úprava, smazání.
- `GET/POST /api/households` – seznam, vytvoření.
- `GET/PATCH/DELETE /api/households/[id]` – detail, úprava, smazání.
- `GET/POST /api/opportunities` – pipeline list, vytvoření.
- `GET/PATCH/DELETE /api/opportunities/[id]` – detail, úprava, smazání.
- `GET/POST /api/tasks`, `GET/PATCH/DELETE /api/tasks/[id]`.
- `GET/POST /api/events`, `GET/PATCH/DELETE /api/events/[id]`.
- `GET/POST /api/meeting-notes`, `GET/PATCH/DELETE /api/meeting-notes/[id]`.
- `GET/POST /api/documents`, `GET/DELETE /api/documents/[id]`, `GET /api/documents/[id]/download`.
- `POST /api/import/contacts` – upload CSV, mapování polí, preview, commit.
- `POST /api/exports/gdpr` – žádost o export osobních dat (kontakt).
- `POST /api/exports/compliance-package` – žádost o compliance ZIP (kontakt).
- `GET /api/exports/[id]` – stav a odkaz na stažení artefaktu.

## Webhooky (Phase 2)

- Eventy: contact.created, opportunity.stage_changed, document.uploaded. Payload + podpis.
