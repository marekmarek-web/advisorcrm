# Fáze 4: AI příležitosti a next best action – technický souhrn

## Co bylo změněno

- **Nové soubory**
  - `apps/web/src/lib/ai-opportunities/types.ts` – typy `AiOpportunity`, `SourceSignal`, `OpportunitySignals`, enums a konstanty
  - `apps/web/src/lib/ai-opportunities/action-cta-mapping.ts` – mapování CTA na route (analýza, kalendář, obchody, smlouvy, …)
  - `apps/web/src/lib/ai-opportunities/opportunity-rules.ts` – pravidla (condition + build) pro každý typ příležitosti
  - `apps/web/src/lib/ai-opportunities/compute-opportunities.ts` – engine: běh pravidel, deduplikace, prioritizace
  - `apps/web/src/app/actions/client-ai-opportunities.ts` – agregace vstupů a `getClientAiOpportunities(contactId)`
  - `apps/web/src/app/portal/contacts/[id]/ClientAiOpportunitiesSection.tsx` – UI sekce (next best action + seznam příležitostí)
- **Úpravy**
  - `apps/web/src/app/actions/pipeline.ts` – přidána `getOpenOpportunitiesByContactWithMeta(contactId)` (vrací `updatedAt` pro „obchod bez pohybu“)
  - `apps/web/src/app/portal/contacts/[id]/page.tsx` – volání `getClientAiOpportunities(id)`, místo `ContactAiAnalysisCard` použit `ClientAiOpportunitiesSection` s daty

## Jaké vstupy příležitosti používají

- **ClientFinancialSummaryView** (status analýzy, primaryAnalysisId, updatedAt, scope, gaps)
- **FinancialSummary.contractTimeline** (výročí smluv – startDate, anniversaryDate)
- **ResolvedCoverageItem[]** z coverage (status none/done/in_progress, linkedContractId, linkedOpportunityId, isRelevant)
- **Otevřené obchody** pro kontakt včetně `updatedAt` (getOpenOpportunitiesByContactWithMeta)
- **Úkoly** – počet otevřených (getTasksByContactId)
- **Události** – min/max startAt pro kontakt (listEvents past/future) → lastMeetingAt, nextMeetingAt
- **Domácnost** – getHouseholdForContact (householdId, householdName pro scope a badge)

Vše přes existující server actions; tenant a oprávnění jsou zachované.

## Jaké typy příležitostí podporuje první verze

| Typ | Popis |
|-----|--------|
| no_analysis | Klient nemá finanční analýzu |
| stale_analysis | Analýza starší než 12 měsíců |
| draft_analysis | Analýza rozpracovaná |
| no_recent_contact | Dlouho bez schůzky (> 6 měsíců) |
| contract_review_due | Blíží se výročí smlouvy (30–60 dní) |
| coverage_gap | Nepokrytá oblast (bez otevřeného obchodu pro segment) |
| products_no_follow_up | Má produkty, dlouho bez schůzky |
| stale_opportunity | Obchod bez aktualizace > 30 dní |
| schedule_meeting | Není naplánovaná další schůzka |
| analysis_gaps | Z analýzy vyplývají mezery (rezerva, cíle, zajištění) |

## Jak funguje prioritizace a next best action

- Každá příležitost má **priority** 1–5 (1 = nejvyšší) a **confidence** (high/medium/low).
- **Skóre** (0–100): kombinace priority, urgency (no_analysis, no_recent_contact, stale_opportunity, contract_review_due, …) a confidence.
- **Deduplikace**: stejný typ + stejný entitní klíč (analysisId, opportunityId, contractId, segmentCode) → zůstane jedna příležitost s vyšším skóre.
- **Řazení**: podle skóre sestupně, pak podle priority.
- **Next best action** = první položka v seřazeném seznamu (ne samostatný výběr).

## Doporučené follow-upy

- **Last meeting / events**: případně sdílená helper „poslední schůzka pro kontakt“ v `events.ts` pro jiné části aplikace.
- **Dismiss/acted**: až bude potřeba trvalé skrytí, přidat tabulku (např. `client_ai_opportunity_dismissals`) a API.
- **Výkon**: agregace volá několik actions v `Promise.all`; při růstu zatížení zvážit jednu „fat“ action nebo cache.
- **Servisní engine / briefingy**: `getClientAiOpportunities(contactId)` je připraven jako vstup pro briefing před schůzkou a servisní přehledy.

---

## Checklist (Fáze 4)

| Úkol | Stav |
|------|------|
| Audit vstupních dat | Hotovo |
| Návrh modelu AI příležitostí | Hotovo |
| Definice typů příležitostí | Hotovo |
| Návrh a logika next best action | Hotovo |
| Prioritizace | Hotovo |
| Vysvětlitelnost doporučení (sourceSignals) | Hotovo |
| CTA a workflow návaznost | Hotovo |
| UX implementace sekce | Hotovo |
| Empty a fallback stavy | Hotovo |
| Klient vs domácnost (scope, badge) | Hotovo |
| Datová čistota a deduplikace | Hotovo |
| Auditovatelnost, permissions a tenant izolace | Hotovo (pouze stávající actions) |
