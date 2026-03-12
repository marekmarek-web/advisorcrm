# Fáze 4 – První kroky firemní FA a sjednocení výstupů/PDF

Tento dokument popisuje implementaci Fáze 4: převod prvních kroků firemní FA do React komponent napojených na store a Supabase a zavedení sjednocené vrstvy pro výstupy (report composition layer) pro osobní, firemní a kombinovaný režim.

**Vstupní dokumenty:** [PHASE1_AUDIT.md](./PHASE1_AUDIT.md), [PHASE2_DATA_MODEL.md](./PHASE2_DATA_MODEL.md).

---

## 1. Převod kroků firemní FA do React komponent

### 1.1 Kroky a komponenty

| Krok | Komponenta | Obsah |
|------|------------|--------|
| 1 | **StepCompanyInfo** | Firma: název, IČO, obor, zaměstnanci, 3. kat., průměrná mzda, TOP klient. KPI: mzdový fond, rizikovost z oboru. |
| 2 | **StepCompanyPeople** | Jednatelé: seznam (přidat/odebrat), u každého jméno, věk, podíl, manžel/ka, děti, typ příjmu, čistý příjem, rezervy, cíl, benefity (DPS/DIP/IŽP), platí ze svého, staré penzijní. |
| 3 | **StepCompanyFinance** | Finance: tržby, zisk/EBITDA, rezerva, měsíční splátka úvěrů. KPI: runway, inflační varování (3,5 %). |
| 4 | **StepCompanyBenefitsRisks** | Benefity, rizika (6 položek), pojištění jednatele, strategie, investice. |
| 5 | **StepCompanyOutput** | Výstup: náhled/tisk reportu, tlačítko „Uložit report do dokumentů“. |

Umístění: `apps/web/src/app/portal/analyses/company/components/steps/`.

### 1.2 Store a výpočty

- **Store:** `apps/web/src/lib/analyses/company-fa/store.ts` – Zustand store s `payload`, `currentStep`, `totalSteps`, `analysisId`, `companyId`, `primaryContactId`, akcemi `loadFromServerPayload`, `setCompany`, `setDirector`, `setFinance`, `goToStep`, `nextStep`, `prevStep` atd.
- **Výpočty:** `apps/web/src/lib/analyses/company-fa/calculations.ts` – mzdový fond, rizikovost oboru, měsíční výdaje, runway, inflační ztráta, KPI pro krok 1 a 2.
- **Konstanty:** `TOTAL_STEPS = 5`, názvy kroků v `constants.ts`.

### 1.3 Práce s JSON importem

- Při importu JSON (upload → preview → „Otevřít a upravit“) se volá `loadFromServerPayload(normalizedPayload)` a zobrazí se stepper s kroky; data se neukládají zpět do JSON, ale do CRM přes „Uložit do CRM (vytvořit analýzu)“.
- Normalizace a validace importu: `apps/web/src/lib/analyses/company-fa/importValidate.ts` a akce v `company-fa-import.ts`.

### 1.4 Stránka a persistence

- **Stránka:** `apps/web/src/app/portal/analyses/company/page.tsx`
  - Při zobrazení podle `?id=` se načte analýza přes `getCompanyAnalysis(id)` a do store se nastaví `loadFromServerPayload(row.payload)`, `setAnalysisId(row.id)`, `setCompanyId(row.companyId)`, `setPrimaryContactId(row.primaryContactId)`.
  - Shell stav (`shellState`) obsahuje `payload`, `analysisId`, `companyId`, `primaryContactId`, `importOptions`.
  - „Uložit do CRM“ volá `saveCompanyAnalysisDraft(analysisId, payload)` u existující analýzy, nebo `executeCompanyFaImport(payload, importOptions)` u nové a poté přesměruje na `?id=...`.

### 1.5 Layout a stepper

- **CompanyAnalysisStepper** – zobrazuje kroky 1–5 a aktuální krok.
- **CompanyAnalysisLayout** – obaluje stepper, aktuální Step* komponentu a tlačítka Zpět/Další a „Uložit do CRM“. Čte stav ze store.

---

## 2. Normalizovaný výstupní model (output / report layer)

### 2.1 Účel

Jednotný typ „report payload“ nezávislý na tom, zda zdroj je osobní nebo firemní analýza. Umožňuje jeden pipeline pro HTML/PDF a ukládání do dokumentů pro režimy **personal_only**, **business_only** a **combined**.

### 2.2 Umístění a typy

**Složka:** `apps/web/src/lib/analyses/output/`

**Hlavní typy** (`types.ts`):

- **ReportMeta** – `type`, `exportMode`, `generatedAt`, `generatedBy`, `title`, `contactId`, `householdId`, `companyId`, `analysisId`, `personalAnalysisId`, `companyAnalysisId`.
- **SubjectContext** – `subjectLabel`, `subjectId`, `secondaryLabel`, `linksDescription` (pro combined).
- **PersonalSections** / **BusinessSections** / **SharedSections** – strukturované sekce nebo `rawBlocks: string[]` (HTML bloky).
- **NormalizedReportPayload** – `meta`, `subjectContext`, volitelně `personalSections`, `businessSections`, `sharedSections`, `recommendations`, `exportOptions`.

**Exportní režimy:** `personal_only` | `business_only` | `combined`.

### 2.3 Sestavovací funkce

- **buildPersonalReportPayload(data, options)** – vrací payload s `exportMode: 'personal_only'`, naplní `personalSections.rawBlocks` z `buildReportHTML(data)` (osobní FA report).
- **buildBusinessReportPayload(data, options)** – vrací payload s `exportMode: 'business_only'`, naplní `businessSections.rawBlocks` z `buildCompanyReportHTML(data)`.
- **buildCombinedReportPayload(personalData, companyData, options)** – vrací payload s `exportMode: 'combined'`, skládá osobní a firemní sekce a volitelně `sharedSections` (např. vazby klient–firma).
- **resolveOutputMode(context)** – na základě `hasPersonalData`, `hasCompanyData`, `requestCombined` vrací `personal_only` | `business_only` | `combined`.
- **composeAnalysisOutput(personalData, companyData, options)** – vstupní bod: podle zadaného nebo odvozeného režimu volá příslušnou build* funkci a vrací `NormalizedReportPayload`.

### 2.4 Generování HTML a PDF

- **renderReportToHTML(payload)** – z `NormalizedReportPayload` vygeneruje jeden HTML řetězec pro tisk/PDF:
  - `personal_only`: vrací první blok z `personalSections.rawBlocks` (už kompletní HTML).
  - `business_only`: obalí `businessSections.rawBlocks` do `<div class="pdf">`.
  - `combined`: titulní stránka + osobní bloky + shared (vazby) + firemní bloky v jednom `<div class="pdf">`.
- **normalizeReportMeta(...)** – sjednocuje metadata (generatedAt, generatedBy, title, odkazy na contact/company/analysis) pro všechny typy reportů.

### 2.5 Rozhodování mezi jedním a dvěma výstupy

- **personal_only** – vybraná jen osobní analýza (nebo kontext „jen osobní“).
- **business_only** – vybraná jen firemní analýza.
- **combined** – uživatel zvolí kombinovaný výstup a existuje vazba (klient + firemní analýza); `resolveOutputMode` vrací `combined` když `hasPersonalData && hasCompanyData && requestCombined !== false`.

---

## 3. Ukládání exportů do dokumentů

### 3.1 Osobní FA

- Beze změny: v StepSummary (osobní FA) se sestaví HTML přes `buildReportHTML(data)`, vytvoří se soubor, nahraje přes `uploadDocument(contactId, formData, { tags: ['financial-report'] })`. Po úspěchu `setFinancialAnalysisLastExportedAt(analysisId)`.

### 3.2 Firemní FA

- V **StepCompanyOutput** (krok 5) tlačítko „Uložit report do dokumentů“:
  - Sestaví report přes `buildBusinessReportPayload(payload, options)` → `renderReportToHTML(reportPayload)`.
  - Nahraje HTML soubor přes `uploadDocument(primaryContactId, formData, { tags: ['company-report'] })`.
  - Po úspěchu volá `setCompanyAnalysisLastExportedAt(analysisId)`.
- **primaryContactId** pochází z analýzy (getCompanyAnalysis vrací `primaryContactId`); při otevření analýzy podle `?id=` se nastaví do store. Pokud není nastaven, tlačítko je disabled a zobrazí se upozornění, že pro uložení musí být přiřazen hlavní kontakt.

### 3.3 Rozšíření schématu (budoucí fáze)

- V této fázi se firemní report ukládá ke kontaktu (`primaryContactId`) s tagem `company-report`. Pro Fázi 5 lze zvážit rozšíření tabulky `documents` o `companyId` a/nebo `analysisId`, aby bylo možné filtrovat „report k této firmě / k této analýze“ nezávisle na jediném kontaktu.

---

## 4. Připravenost PDF vrstvy

- **renderReportToHTML** je připraven na všechny tři režimy; výstupy používají sjednocená metadata a společnou obálku (`.pdf`, titulní stránka u combined).
- Osobní a firemní sekce zůstávají obsahově oddělené; společná je prezentace (fonty, třídy, stránkování) v rámci existujícího stylu osobního reportu.
- Osobní FA může být v budoucnu přepnuta na pipeline `buildPersonalReportPayload` → `renderReportToHTML` bez změny chování; aktuálně StepSummary stále používá přímo `buildReportHTML`.

---

## 5. Shrnutí implementace

| Oblast | Stav |
|--------|------|
| Kroky 1–5 jako React komponenty | Hotovo (StepCompanyInfo, StepCompanyPeople, StepCompanyFinance, StepCompanyBenefitsRisks, StepCompanyOutput) |
| Store + calculations | Hotovo (company-fa/store.ts, calculations.ts, defaultState.ts, constants.ts) |
| Stránka + persistence | Hotovo (page.tsx s shellState, load/save, primaryContactId) |
| JSON import → store → kroky | Hotovo |
| Normalizovaný output model | Hotovo (types, normalizeReportMeta, build*ReportPayload, resolveOutputMode, composeAnalysisOutput) |
| renderReportToHTML | Hotovo (personal_only, business_only, combined) |
| Export firemní FA do dokumentů | Hotovo (StepCompanyOutput, tag company-report, setCompanyAnalysisLastExportedAt) |
| Dokumentace | Tento dokument (PHASE4_STEPS_AND_OUTPUT.md) |

Architektura je připravena na doplnění dalších kroků firemní FA (např. rozšíření StepCompanyOutput o verdict, TOP 3, skóre) a na plné propojení combined výstupu v další fázi (výběr „kombinovaný výstup“ v UI a propojení klient–firma).
