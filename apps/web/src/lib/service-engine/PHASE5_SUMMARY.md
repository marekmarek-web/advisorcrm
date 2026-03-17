# Fáze 5: Chytrý servisní engine – technický souhrn

## Co bylo změněno / přidáno

### Nové soubory

- **`apps/web/src/lib/service-engine/types.ts`** – Typy: `ServiceCategory`, `ServiceRecommendation`, `ServiceStatus`, `ServiceActionType`, konstanty labelů a řazení.
- **`apps/web/src/lib/service-engine/data.ts`** – Data vrstva: `getServiceInputData(tenantId, contactId)` načte kontakty, smlouvy, události, zápisky, analýzy, úkoly a obchody pro výpočet doporučení.
- **`apps/web/src/lib/service-engine/rules.ts`** – Pravidla: `computeServiceRecommendations()` a `computeServiceStatus()` z `ServiceInputData`.
- **`apps/web/src/lib/service-engine/cta.ts`** – Mapování CTA: `getServiceCtaHref(rec, contactId)` → href + label.
- **`apps/web/src/lib/service-engine/index.ts`** – Re-export modulu.
- **`apps/web/src/app/actions/service-engine.ts`** – Server actions: `getServiceRecommendationsForContact()`, `getServiceStatusForContact()`, `getServiceRecommendationsForDashboard()` (tenant + permissions).
- **`apps/web/src/app/portal/contacts/[id]/ClientServiceBlock.tsx`** – Komponenta na kartě klienta: status, seznam doporučení, CTA, empty/fallback stavy.

### Upravené soubory

- **`apps/web/src/app/portal/contacts/[id]/page.tsx`** – Přidán blok „Servis a doporučení“ (ClientServiceBlock) mezi Finanční souhrn a Pokrytí.
- **`apps/web/src/app/portal/today/page.tsx`** – Volá `getServiceRecommendationsForDashboard(10)` a předává výsledek do DashboardEditable.
- **`apps/web/src/app/portal/today/DashboardEditable.tsx`** – Nový prop `serviceRecommendations`; widget „Péče o klienty“ (clientCare) zobrazuje top servisní doporučení s CTA a odkazem na klienta, s fallbackem na stávající serviceDue + anniversaries.

---

## Vstupy servisního engine

| Zdroj | Použití |
|-------|--------|
| **contacts** | `lastServiceDate`, `nextServiceDue`, `serviceCycleMonths` – servis due, rytmus. |
| **contracts** | `anniversaryDate`, `segment` (včetně HYPO) – výročí smluv, revize hypoték. |
| **financialAnalyses** | `status`, `updatedAt` – zastaralá/chybí analýza. |
| **events** | MAX(startAt) pro contactId – poslední kontakt/schůzka. |
| **meetingNotes** | MAX(meetingAt) pro contactId – poslední schůzka. |
| **tasks** | Otevřené úkoly, dueDate – úkol po termínu. |
| **opportunities** | closedAt, closedAs = 'won' – follow-up po obchodu. |

Všechny dotazy jsou tenant-scoped (`tenantId` z auth).

---

## Servisní scénáře (V1)

1. **Servis due** – nextServiceDue v minulosti nebo v následujících 7 dnech.
2. **Výročí smlouvy** – anniversaryDate v [dnes, dnes+60].
3. **Konec fixace hypotéky** – segment HYPO + anniversary v okně (V1 bez `fixationEndDate`).
4. **Úkol po termínu** – úkol bez completedAt, dueDate starší než 7 dní.
5. **Zastaralá/chybí analýza** – žádná completed analýza nebo updatedAt starší než 12 měsíců.
6. **Follow-up po obchodu** – obchod uzavřen (won) v 90 dnech, žádná schůzka/aktivita po closedAt.
7. **Dlouho bez kontaktu** – poslední kontakt před 6+ měsíci, klient má smlouvy.
8. **Aktivní produkty bez servisu** – smlouvy a poslední servis/kontakt před 12+ měsíci.
9. **Reaktivace** – poslední kontakt před 12+ měsíci (bez duplicity s výše).

---

## Prioritizace a servisní status

- **Priorita:** high (overdue / &lt; 7 dní), medium (7–30 dní / důležité bez data), low (reaktivace).
- **Urgency:** overdue → due_soon → upcoming → no_deadline; řazení v UI podle toho.
- **Servisní status klienta:** `current` | `due_soon` | `overdue` | `missing` | `pending_followup` | `pending_review` | `no_data`; výpočet z doporučení a nextServiceDue/lastServiceDate.

---

## CTA a workflow

- Naplánovat schůzku → kalendář s `contactId` a `newEvent=1`.
- Otevřít klienta / smlouvy / úkoly / obchody → záložky na kartě klienta (#smlouvy, #ukoly, #obchody).
- Otevřít/aktualizovat analýzu → `/portal/analyses/financial?id=...` nebo `?clientId=...`.
- Upravit kontakt → `/portal/contacts/[id]/edit`.

Všechny CTA respektují tenant a permissions (server actions kontrolují `contacts:read` / `contacts:write`).

---

## Empty a fallback stavy

- **Žádná data:** „Nemáme dost údajů…“ + CTA Doplnit servisní cyklus, Naplánovat první schůzku.
- **Žádný aktivní signál:** „Servis v pořádku“ + příští servis (pokud je).
- **Chybí datum příštího servisu:** „Doporučujeme doplnit datum příštího servisu“ + Upravit kontakt.
- **Dashboard:** „Žádná péče k zobrazení“ když nejsou doporučení ani service due / výročí.

---

## Checklist úkolů (Fáze 5)

| Úkol | Stav |
|------|------|
| Audit servisních vstupů | Hotovo |
| Návrh modelu servisních signálů a servisních položek | Hotovo |
| Definice servisních scénářů | Hotovo |
| Návrh servisního plánu a servisního statusu klienta | Hotovo |
| Prioritizace a urgency | Hotovo |
| CTA a workflow návaznost | Hotovo |
| UX implementace servisní vrstvy (karta klienta + dashboard) | Hotovo |
| Empty a fallback stavy | Hotovo |
| Klient vs. domácnost (badge, householdId v doporučeních) | Hotovo (V1 na úrovni kontaktu + householdId v typech) |
| Datová čistota a deduplikace | Hotovo (jedna položka na category+entity v rules) |
| Auditovatelnost, permissions a tenant izolace | Hotovo (vše přes requireAuthInAction a tenantId) |

---

## Rizika a follow-upy

- **Fixace hypoték:** V DB chybí `fixationEndDate`; V1 používá `anniversaryDate` u HYPO. Doporučeno v další fázi přidat pole.
- **Výkon dashboardu:** Engine se volá pro max. 25 kontaktů (service due + anniversaries + overdue tasks); limit 10 doporučení. Pro velké tenanty zvážit cache nebo materialized view.
- **Snooze/dismiss:** V1 bez perzistence; později tabulka `service_recommendation_dismissals`.
- **AI briefing:** `getServiceStatusForContact()` a seznam doporučení lze předat do briefingu před schůzkou.
