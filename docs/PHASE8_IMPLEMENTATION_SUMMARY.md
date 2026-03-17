# Fáze 8: Klientský portál – souhrn implementace

## Co bylo změněno

- **Client Zone** přejmenována na klientský portál („Vítejte v klientském portálu“) a rozšířena o moduly Platby, Investice, Moje požadavky, Oznámení.
- **Dashboard** přepracován: uvítací banner, bloky (smlouvy, platby, dokumenty, požadavky, zprávy), hlavní CTA „Mám nový požadavek“ a „Napsat zprávu poradci“, empty stavy s CTA.
- **Nový modul Požadavky:** formulář „Nový požadavek“ (typ + popis) vytváří opportunity v CRM s prvním stage a `customFields.client_portal_request`; stránka „Moje požadavky“ zobrazuje klientské stavy (Přijato, Řešíme, Čekáme na doplnění, Domlouváme schůzku, Dokončeno).
- **Platby:** samostatná stránka `/client/payments` s platebními instrukcemi a fallback texty.
- **Investice:** stránka `/client/investments` s finančním souhrnem (getClientFinancialSummaryForContact) pouze pro completed/exported analýzy; jinak empty state „Připravujeme váš přehled“.
- **Notifikace:** tabulka `portal_notifications`, zápis při nové zprávě od poradce; stránka `/client/notifications` a badge v sidebaru.
- **Onboarding:** uvítací banner na dashboardu, konzistentní empty stavy napříč moduly.
- **Audit:** `portal_request_create` v audit_log při vytvoření požadavku z portálu; dokumentace bezpečnosti a auditu v PHASE8_CLIENT_PORTAL_AUDIT.md.
- **Household:** pouze návrh a schéma v PHASE8_HOUSEHOLD_DESIGN.md (bez implementace).

## Moduly první verze portálu

| Modul | Popis |
|-------|--------|
| Dashboard | Přehled smluv, plateb, dokumentů, požadavků, zpráv; CTA; uvítací banner. |
| Smlouvy a produkty | Přehled smluv s klientskými labely (segmentLabel), empty state + CTA. |
| Platby a instrukce | Odvozené z contracts + payment_accounts; fallback „Platební údaje připravujeme“. |
| Investice | Finanční souhrn (aktiva, závazky, rezerva, cíle) jen u completed/exported analýz; jinak empty state. |
| Dokumenty | Pouze visibleToClient; stažení + audit; empty state + CTA. |
| Chat / Zprávy | Stávající konverzace po kontaktu; napojení na CRM. |
| Nový požadavek | Formulář typ + popis → opportunity (Lead stage, caseType, customFields.client_portal_request). |
| Stav požadavků | „Moje požadavky“ – seznam s klientskými stavy (přijato, řešíme, …). |
| Onboarding a přístup | Stávající pozvánka + acceptClientInvitation; banner a empty stavy. |
| Notifikace | In-app notifikace (nová zpráva od poradce); zápis při sendMessage (advisor); stránka Oznámení + badge. |

## Vstupy portálu

- **Používané:** contacts, client_contacts, client_invitations, contracts, documents (visibleToClient), payment_accounts (přes contracts), messages, financial_analyses (pouze completed/exported pro Client), opportunities, opportunity_stages, portal_notifications, audit_log.
- **Nové tabulky:** portal_notifications (schema + migrace 0008, supabase-schema).
- **Rozšíření:** getFinancialAnalysis a getFinancialAnalysesForContact umožňují Client přístup k vlastním (a domácím) analýzám; getClientFinancialSummaryForContact vrací data jen u completed/exported pro Client. getHouseholdForContact umožňuje Client vlastní kontakt pro household lookup.

## Jak se klientské požadavky propisují do CRM

- Klient odešle formulář „Nový požadavek“ (typ + volitelný popis).
- Server action `createClientPortalRequest` (pouze role Client, auth.contactId):
  - Načte první stage (sortOrder ASC) pro tenant.
  - Vytvoří `opportunities` záznam: contactId = auth.contactId, title = „Požadavek z portálu: [typ]“, caseType = z formuláře, stageId = první stage, customFields = { client_portal_request: true, client_description: popis }.
  - Zaloguje activity_log (create) a audit_log (portal_request_create).
- Poradce vidí obchod v pipeline; přesouvání stage mění klientský stav (mapování sortOrder → Přijato / Řešíme / … / Dokončeno).
- Klient vidí pouze klientské labely v „Moje požadavky“.

## Household logika

- Aktuálně: 1 uživatel = 1 kontakt (client_contacts). Household v portálu není implementován.
- Návrh pro další iteraci: PHASE8_HOUSEHOLD_DESIGN.md (household_id v client_contacts, pravidla visibility, audit).

## Doporučené follow-upy

- Spustit migraci `0008_portal_notifications.sql` na databázi (nebo aplikovat změny ze supabase-schema.sql).
- Volitelně: zápis portal_notification při změně stage opportunity (request_status_change) a při nastavení visibleToClient u dokumentu (new_document).
- Volitelně: portal_login do audit_log v auth callback při přihlášení s rolí Client.
- Rozšíření household dle PHASE8_HOUSEHOLD_DESIGN.md v další fázi.

---

## Checklist úkolů Fáze 8

| Úkol | Stav |
|------|------|
| Audit vstupních dat a klientsky viditelný scope | hotovo |
| Definice produktu klientského portálu | hotovo |
| Návrh modulů první verze | hotovo |
| Návrh datového modelu portálu | hotovo |
| Dashboard a informační architektura | hotovo |
| Zobrazení smluv a produktů | hotovo |
| Platby a platební instrukce | hotovo |
| Investiční přehled | hotovo |
| Dokumenty a bezpečné sdílení | hotovo |
| Chat / zabezpečená komunikace | hotovo |
| Nový požadavek klienta jako CRM trigger | hotovo |
| Stavy požadavků a klientská transparentnost | hotovo |
| Domácnost, více osob a přístupová práva | hotovo (návrh); nehotovo (implementace) |
| Onboarding klienta do portálu | hotovo |
| Notifikace a upozornění | hotovo |
| Source of truth a hranice mezi portálem a CRM | hotovo |
| UX a layout portálu | hotovo |
| Empty, partial a fallback stavy | hotovo |
| Auditovatelnost, bezpečnost a GDPR | hotovo |
| Architektura integrace do CRM workflow | hotovo |
| Příprava na budoucí rozvoj | hotovo |

---

## Nové / upravené soubory

**Nové:**

- `docs/PHASE8_CLIENT_PORTAL_AUDIT.md`
- `docs/PHASE8_HOUSEHOLD_DESIGN.md`
- `docs/PHASE8_IMPLEMENTATION_SUMMARY.md`
- `apps/web/src/app/lib/client-portal/request-status.ts`
- `apps/web/src/app/actions/client-portal-requests.ts`
- `apps/web/src/app/actions/portal-notifications.ts`
- `apps/web/src/app/client/requests/page.tsx`
- `apps/web/src/app/client/requests/new/page.tsx`
- `apps/web/src/app/client/requests/new/ClientRequestForm.tsx`
- `apps/web/src/app/client/payments/page.tsx`
- `apps/web/src/app/client/investments/page.tsx`
- `apps/web/src/app/client/notifications/page.tsx`
- `apps/web/src/app/client/notifications/ClientNotificationsList.tsx`
- `packages/db/src/schema/portal-notifications.ts`
- `packages/db/drizzle/0008_portal_notifications.sql`

**Upravené:**

- `apps/web/src/app/client/page.tsx` (dashboard)
- `apps/web/src/app/client/ClientSidebar.tsx` (navigace, badge)
- `apps/web/src/app/client/layout.tsx` (unread count)
- `apps/web/src/app/client/contracts/page.tsx` (empty state)
- `apps/web/src/app/client/documents/page.tsx` (empty state + CTA)
- `apps/web/src/app/actions/messages.ts` (portal notification při zprávě od poradce)
- `apps/web/src/app/actions/client-financial-summary.ts` (Client přístup, pouze completed)
- `apps/web/src/app/actions/financial-analyses.ts` (Client přístup k vlastním analýzám)
- `apps/web/src/app/actions/households.ts` (getHouseholdForContact pro Client)
- `packages/db/src/schema/index.ts` (export portal-notifications)
- `packages/db/supabase-schema.sql` (tabulka portal_notifications)
