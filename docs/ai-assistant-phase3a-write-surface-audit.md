# Fáze 3A – audit CRM write surfaces a canonical matice

**Datum auditu:** 2026-04-03  
**Zdroj:** master plán Fáze 3 (Cursor `.cursor/plans/master_plan_faze3_*.plan.md`), produktový plán Phase 3 CRM write coverage.  
**Účel:** inventář všech cest, kterými asistent (nebo související AI) zapisuje do CRM/portálu/dokumentů, a rozhodovací matice pro další fáze 3B+.

---

## 1. Tři paralelní write dráhy (legacy / special)

| Dráha | Vstup | Idempotence / ledger | Poznámka |
|--------|--------|----------------------|----------|
| **Canonical assistant** | `assistant-tool-router` → `buildExecutionPlan` → `assistant-execution-engine` + `registerWriteAdapter` | DB `execution_actions` + in-memory fingerprint (`assistant-action-fingerprint.ts`) | Preferovaná cesta pro Phase 3 rozšíření. |
| **Hypo / mortgage bundle** | `assistant-crm-writes.ts` | Hash + `opportunities.customFields.aiAssistant` | Oddělená od adapter registry; sladit s 3B při sjednocování hypo flow. |
| **AI návrhy na kontaktu (portal)** | `executeAiAction` / `executeTeamAiAction` v `actions/action-executors.ts` | 45s in-process cache + `duplicate-check` | Neprojde `execution_actions`; jiný produktový surface než drawer canonical plán. |

**Doporučení pro Phase 3:** nové CRM write featury přidávat přes canonical adapter + plán; legacy cesty jen dokumentovat a postupně zúžit nebo napojit na stejné contracty.

---

## 2. Paralelní datový tok: klientský požadavek

| Mechanismus | Soubor / modul | Chování |
|-------------|----------------|---------|
| Assistant `createClientRequest` | `assistant-write-adapters.ts` | Vytvoří **opportunity** v prvním stage + `customFields` (`client_portal_request`, …). |
| Portál – advisor flow | `app/actions/client-portal-requests.ts` | Samostatná server logika (notifikace, stavy, e-mail). **Assistant tuto vrstvu přímo nevolá.** |

**Mezera 3F:** rozhodnout, zda assistant má delegovat na sdílené akce z `client-portal-requests.ts`, nebo zůstat u opportunity + customFields s explicitním mapováním na UI portálu.

---

## 3. Matice `WriteActionType` → plán → adapter → implementace

Legenda sloupců:

- **Intent:** mapování `CanonicalIntentType` → akce v `assistant-execution-plan.ts` (`INTENT_TO_WRITE_ACTION`).
- **Required (plan):** `computeWriteActionMissingFields()` v `assistant-execution-plan.ts`.
- **Fingerprint:** `assistant-action-fingerprint.ts` (prázdné = fallback `Object.keys(params).sort()`).
- **Impl.:** `server action` = delegace na `@/app/actions/*`; `Drizzle` = přímý `db.update` v adapteru.

| Write action | Intent map | Required fields (plan) | Fingerprint | Impl. typ | Klasifikace Phase 3 |
|--------------|------------|--------------------------|-------------|-----------|---------------------|
| createOpportunity | create_opportunity | contactId | ano | server action | **safe-to-expose** (s kontextem) |
| updateOpportunity | update_opportunity | opportunityId | ne | server action | **safe-to-expose** |
| createTask | create_task | contactId | ano | server action | **safe-to-expose** |
| updateTask | — | — (žádný záznam v `required`) | ne | server action | **needs-contract-fix** (adapter bez canonical intentu / required) |
| createFollowUp | create_followup | contactId | ano | server action | **safe-to-expose** (sémantika = úkol) |
| scheduleCalendarEvent | schedule_meeting | contactId | ano | server action | **safe-to-expose** |
| createMeetingNote | create_note | contactId | ano | server action | **safe-to-expose** |
| appendMeetingNote | append_note | — chybí `meetingNoteId` v plan required | ne | server action | **needs-contract-fix** (runtime err bez slotu) |
| createInternalNote | — | — | ne | server action | **needs-contract-fix** (žádný canonical intent) |
| attachDocumentToClient | attach_document | contactId, documentId | ne | Drizzle | **needs-contract-fix** (audit/permissions vs `app/actions/documents`) |
| attachDocumentToOpportunity | attach_document_to_opportunity | opportunityId, documentId | ne | Drizzle | **needs-contract-fix** |
| classifyDocument | classify_document | documentId | ano | Drizzle | **needs-contract-fix** |
| triggerDocumentReview | — | documentId v `required`, ale **žádný intent** | ne | Drizzle | **needs-contract-fix** |
| approveAiContractReview | approve_ai_contract_review | reviewId | ano | server action | **safe-to-expose** (HIGH_RISK confirm) |
| applyAiContractReviewToCrm | apply_ai_review_to_crm | reviewId | ano | server action | **safe-to-expose** (HIGH_RISK) |
| linkAiContractReviewToDocuments | link_ai_review_to_document_vault | reviewId | ano | server action | **safe-to-expose** (HIGH_RISK) |
| setDocumentVisibleToClient | show_document_to_client | documentId | ano | server action | **safe-to-expose** (HIGH_RISK) |
| linkDocumentToMaterialRequest | link_document_to_material_request | materialRequestId, documentId | ne | server action | **safe-to-expose** (HIGH_RISK) |
| createClientPortalNotification | notify_client_portal | contactId, portalNotificationTitle | ano | server action | **safe-to-expose** (HIGH_RISK) |
| createClientRequest | create_client_request, create_service_case | contactId | ano | server action | **needs-contract-fix** (dual model vs portál actions) |
| updateClientRequest | update_client_request | opportunityId | ne | server action | **needs-contract-fix** |
| createMaterialRequest | request_client_documents, create_material_request | contactId | ano | server action | **safe-to-expose** |
| publishPortfolioItem | publish_portfolio_item | contractId | ano | server action | **safe-to-expose** (HIGH_RISK) |
| updatePortfolioItem | update_portfolio | contractId | ne | server action | **safe-to-expose** |
| createReminder | create_reminder | contactId | ano | server action | **safe-to-expose** |
| draftEmail | prepare_email | contactId | ne | server action | **safe-to-expose** (typicky bez DB write hotového emailu – ověřit produktově) |
| draftClientPortalMessage | draft_portal_message | contactId | ne | server action | **safe-to-expose** |
| sendPortalMessage | send_portal_message | contactId | ne | server action | **safe-to-expose** (HIGH_RISK) |

**Poznámka:** `HIGH_RISK_ACTIONS` v plánu vynucuje `requiresConfirmation` policy `always` pro vybrané akce – viz `assistant-execution-plan.ts`.

---

## 4. Canonical intenty, které nevedou na write (read-only v plánu)

`READ_ONLY_INTENTS` v `assistant-execution-plan.ts` zahrnuje mimo jiné: `general_chat`, `dashboard_summary`, `search_contacts`, `summarize_client`, `prepare_meeting_brief`, `review_extraction`, `switch_client`.

---

## 5. Mezery shrnuté (vstup pro 3B)

1. **Intent gap:** `triggerDocumentReview` – adapter ano, žádný `INTENT_TO_WRITE_ACTION`.
2. **Intent gap:** `createInternalNote` – adapter ano, žádný canonical intent.
3. **Required fields:** `appendMeetingNote` – adapter vyžaduje `meetingNoteId` (v 3B sjednoceno v plánu přes `computeWriteActionMissingFields`).
4. **Fingerprint gap:** mnoho akcí spadá do defaultního fingerprintu → vyšší riziko falešně „jiného“ kroku; doplnit v 3B konzistentně s parametry.
5. **Dokumenty:** attach/classify/trigger review přes Drizzle – sjednotit s oprávněními a auditem UI cest (`app/actions/documents.ts` kde je relevantní).
6. **Duplicitní produktové cesty:** `assistant-crm-writes.ts` vs canonical; `executeAiAction` vs canonical.
7. **updateTask:** registrovaný adapter bez mapování z canonical intentů.

---

## 6. Rozhodnutí ponechaná na 3B / později (z tohoto auditu)

| Téma | Návrh |
|------|--------|
| Hypo verified bundle | Buď postupně sloučit do jedné idempotence s `execution_actions`, nebo explicitně označit jako **legacy-only** s dokumentovaným contractem. |
| Kontakt AI akce | Ponechat jako samostatný surface; v dokumentaci CRM „assistant“ rozlišit **drawer canonical** vs **contact AI suggestions**. |
| Client request | Vybrat jeden kanonický model (opportunity CF vs sdílené portal actions) před rozšířením 3F. |

---

## 7. Související soubory (rychlá navigace)

- `apps/web/src/lib/ai/assistant-domain-model.ts` – `WRITE_ACTION_TYPES`, intenty  
- `apps/web/src/lib/ai/assistant-execution-plan.ts` – mapa intent → write, `computeWriteActionMissingFields`, HIGH_RISK  
- `apps/web/src/lib/ai/assistant-write-adapters.ts` – implementace adapterů  
- `apps/web/src/lib/ai/assistant-execution-engine.ts` – registry, idempotence  
- `apps/web/src/lib/ai/assistant-action-fingerprint.ts` – fingerprint klíče  
- `apps/web/src/lib/ai/assistant-crm-writes.ts` – hypo bundle  
- `apps/web/src/lib/ai/actions/action-executors.ts` – `executeAiAction`  
- `apps/web/src/app/actions/client-portal-requests.ts` – portál request flow  
- `packages/db/src/schema/execution-actions.ts` – ledger  

---

## 8. Acceptance pro uzavření 3A

- [x] Kanonická matice write akcí v dokumentu  
- [x] Paralelní cesty pojmenované a zařazené  
- [x] Tabulka klasifikace `safe-to-expose` / `needs-contract-fix` / odkazy na legacy  
- [x] Explicitní seznam mezer intentů a required fields  

Další fáze **3B** navazuje úpravami contract vrstvy v kódu podle sekce 5–6.
