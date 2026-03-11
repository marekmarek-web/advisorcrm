# Fáze 7 – CRM integrace finanční analýzy

Dokumentace napojení finanční analýzy na CRM: datový model analýz, vazba na klienta a domácnost, drafty a verze, export reportu do dokumentů, entry pointy a připravenost na úkoly a doporučení.

---

## 1. Datový model analýzy v CRM

**Tabulka:** `financial_analyses` (schema v [packages/db/src/schema/financial-analyses.ts](packages/db/src/schema/financial-analyses.ts))

| Sloupec | Typ | Popis |
|---------|-----|--------|
| id | uuid PK | |
| tenantId | uuid NOT NULL | |
| contactId | uuid FK contacts, nullable | Primární klient (klientská analýza) |
| householdId | uuid FK households, nullable | Domácnost (domácnostní analýza) |
| type | text, default 'financial' | Pro budoucí typy analýz |
| status | text | draft \| completed \| exported \| archived |
| payload | jsonb NOT NULL | Celý stav: `{ data: FinancialAnalysisData, currentStep: number }` |
| createdBy | text | userId |
| updatedBy | text | userId |
| createdAt | timestamp | |
| updatedAt | timestamp | |
| lastExportedAt | timestamp nullable | Poslední export reportu do dokumentů |

**Pravidlo:** Při ukládání do CRM platí alespoň jedno z: `contactId` nebo `householdId`. Oba mohou být vyplněné.

**Úkoly:** V tabulce `tasks` byl přidán volitelný sloupec `analysisId` (FK na financial_analyses), aby šlo vytvářet úkoly navázané na analýzu ([createTask](apps/web/src/app/actions/tasks.ts) přijímá `analysisId`).

---

## 2. Vazba na klienta a domácnost

- **Klientská analýza:** `contactId` vyplněno; analýzu lze otevřít z profilu klienta (`?clientId=X`). Při „Uložit do CRM“ se ukládá s `contactId` z `data.clientId`.
- **Domácnostní analýza:** `householdId` vyplněno; analýzu lze otevřít z detailu domácnosti (`?householdId=Y`). Při ukládání se použije `data.householdId`.
- **Otevření podle id:** URL `?id=analysisId` načte analýzu ze serveru (`getFinancialAnalysis(id)`), payload se sloučí do store a nastaví se `analysisId` a `setLinkIds(row.contactId, row.householdId)`.
- **Předvyplnění z klienta:** Volitelně lze v budoucnu při otevření s `clientId` načíst kontakt a předvyplnit `data.client` (jméno, email, telefon, datum narození).

---

## 3. Drafty a verze

- **Ukládání draftu:** Server action `saveFinancialAnalysisDraft({ id?, contactId?, householdId?, payload })` v [apps/web/src/app/actions/financial-analyses.ts](apps/web/src/app/actions/financial-analyses.ts). Pokud `id` chybí, vytvoří se nový záznam; jinak se aktualizuje existující (payload, updatedBy, updatedAt). Při vytváření musí být alespoň jeden z contactId/householdId.
- **Načtení draftu:** Stránka s `?id=...` v useEffect zavolá `getFinancialAnalysis(id)` a poté `loadFromServerPayload(row.payload)`, `setAnalysisId(row.id)`, `setLinkIds(row.contactId, row.householdId)`. Hydratace z localStorage se používá jen když v URL není `id`.
- **Stavový model:** `status`: draft (rozpracováno), completed, exported, archived. Toolbar nabízí „Uložit do CRM“; po exportu reportu do dokumentů se volá `setFinancialAnalysisLastExportedAt(id)`.
- **Versioning:** Jedna řádka = jeden draft (payload se při každém uložení přepisuje).

---

## 4. Export reportu do dokumentů

- **Tlačítko:** V [StepSummary](apps/web/src/app/portal/analyses/financial/components/steps/StepSummary.tsx) je tlačítko „Uložit report do dokumentů“, viditelné když je v analýze nastavené `data.clientId`.
- **Průběh:** Sestaví se HTML report (`buildReportHTML(data)`), vytvoří se soubor (HTML), nahraje se přes `uploadDocument(contactId, formData, { tags: ['financial-report'] })`. Dokument se uloží ke kontaktu v existující sekci Dokumenty. Po úspěchu se zavolá `setFinancialAnalysisLastExportedAt(analysisId)`.
- **Poznámka:** Pro domácnostní analýzu bez `contactId` se tlačítko nezobrazí; pro uložení reportu ke klientovi je potřeba otevřít analýzu z profilu klienta (nebo mít v analýze vyplněné contactId).

---

## 5. Entry pointy v CRM

- **Profil klienta** ([apps/web/src/app/portal/contacts/[id]/page.tsx](apps/web/src/app/portal/contacts/[id]/page.tsx)): Sekce „Finanční analýzy“ ([ContactFinancialAnalysesSection](apps/web/src/app/dashboard/contacts/[id]/ContactFinancialAnalysesSection.tsx)) zobrazuje seznam analýz pro kontakt (`getFinancialAnalysesForContact(contactId)`), u každé odkaz „Otevřít“ → `/portal/analyses/financial?id=<id>`, tlačítko „Nová analýza“ → `/portal/analyses/financial?clientId=<contactId>`.
- **Detail domácnosti** ([HouseholdDetailView](apps/web/src/app/portal/households/[id]/HouseholdDetailView.tsx)): Blok „Finanční analýzy“ se seznamem analýz pro domácnost (`getFinancialAnalysesForHousehold(householdId)`), odkazy „Otevřít“ a „Nová analýza“ → `/portal/analyses/financial?householdId=<id>`.
- **Stránka analýzy:** Při `?id=` se načte draft ze serveru; při `?clientId=` / `?householdId=` (bez id) zůstává chování jako dříve (hydratace z localStorage, setLinkIds z URL).

---

## 6. Store a toolbar

- **Store** ([store.ts](apps/web/src/lib/analyses/financial/store.ts)): Přidán stav `analysisId: string | null`, akce `loadFromServerPayload(parsed)`, `setAnalysisId(id)`. Při resetu se zachovají `data.clientId` a `data.householdId`, aby nový draft mohl být uložen ke stejnému kontextu.
- **Toolbar:** Tlačítko „Uložit do CRM“ je viditelné když je `data.clientId` nebo `data.householdId`. Volá `saveFinancialAnalysisDraft` s aktuálním payloadem; po úspěchu se nastaví `analysisId` pro další updates.

---

## 7. Připravenost na úkoly a doporučení

- **Úkoly:** Tabulka `tasks` má volitelný sloupec `analysisId`. `createTask` přijímá `analysisId`; úkol vytvořený z analýzy může být takto navázaný. Ve StepSummary nebo jinde lze do budoucna přidat „Vytvořit úkol“ (např. „Doplnit rezervu“, „Revize úvěru“) s `contactId` a `analysisId`.
- **Doporučení / obchody:** Opportunities již mají `householdId` a `contactId`. Pro vazbu na analýzu lze do budoucna přidat např. `sourceAnalysisId` nebo ukládat odkaz v customFields; v této fázi není vyžadováno.

---

## 8. Shrnutí

- Finanční analýza je navázaná na klienta (contactId, entry point a seznam na profilu klienta) a na domácnost (householdId, entry point a seznam v detailu domácnosti).
- Existuje model pro draft/status (tabulka financial_analyses, status draft/completed/exported/archived).
- Uložená analýza jde znovu otevřít (načtení podle `?id=` a hydratace store).
- Export reportu jde uložit do dokumentů ke klientovi (tag financial-report, lastExportedAt).
- Analýzu jde spustit z CRM kontextu (odkazy z kontaktu a domácnosti, nová i existující).
- Výpočty, wizard a report zůstaly beze změny.
