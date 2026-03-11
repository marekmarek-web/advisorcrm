# Fáze 2 – React shell a state management

Dokumentace React/Next.js shellu pro finanční analýzu: route, layout, stepper, state management a toolbar. Logika zůstává v modulech z Fáze 1; UI je napojené na ně bez duplikace.

---

## 1. Route a dostupnost

- **Route:** `app/portal/analyses/financial/page.tsx`
- **URL:** `/portal/analyses/financial` (v rámci přihlášeného portálu CRM)
- **Stránka:** Client component – v `useEffect` volá `hydrate()` ze store (načtení z localStorage) a z `useSearchParams` čte `clientId` / `householdId` a předává je do store (`setLinkIds`) pro budoucí napojení na klienta nebo domácnost. Renderuje pouze `<FinancialAnalysisLayout />`.

**Jak se na feature dostanete:**

- **Portál – menu:** Položka „Finanční analýzy“ v sidebaru vede na `/portal/analyses` (rozcestník).
- **Rozcestník analýz:** Stránka `/portal/analyses` obsahuje odkaz „Finanční analýza“ → `/portal/analyses/financial`.
- **Domácnosti:** V detailu domácnosti (`/portal/households/[id]`) jsou odkazy na finanční analýzu s query parametrem → `/portal/analyses/financial?householdId=...`.

Feature není vázaná na žádný index.html; má vlastní route v App Routeru.

---

## 2. Layout

- **Komponenta:** `app/portal/analyses/financial/components/FinancialAnalysisLayout.tsx`

**Struktura:**

1. **Nadpis** – sekce s titulkem „Finanční analýza“ (hero).
2. **Stepper** – `FinancialAnalysisStepper` (viz níže).
3. **Hlavní karta** – bílá karta s obsahem:
   - **Toolbar** – `FinancialAnalysisToolbar` (Uložit, Načíst, Nový plán).
   - **Obsah kroku** – oblast s `min-h-[320px]`, kde se podle `currentStep` vykresluje jedna z krokových komponent (`STEP_COMPONENTS[currentStep - 1]`).
   - **Footer** – tlačítka Zpět a Další (na posledním kroku místo Další text o exportu reportu).

Kroky jsou v poli `STEP_COMPONENTS`: StepClientInfo, StepCashflow, StepAssetsLiabilities, StepCredits, StepGoals, StepStrategy, StepSummary. Layout nemá samostatnou komponentu „StepRenderer“ – přímo volá `<StepComponent />`.

---

## 3. Stepper

- **Komponenta:** `app/portal/analyses/financial/components/FinancialAnalysisStepper.tsx`
- **Zdroj názvů kroků:** `STEP_TITLES` z `lib/analyses/financial/constants.ts` (Klient, Cashflow, Majetek, Úvěry, Cíle, Strategie, Shrnutí).

**Chování:**

- Čte ze store: `currentStep`, `totalSteps`, `goToStep`.
- Pro každý krok zobrazuje tlačítko: klik volá `goToStep(stepNum)`.
- Vizuální stavy: aktivní krok (zvýrazněný kruh), dokončené kroky (ikona fajfky), neaktivní (šedé). Použity Tailwind třídy a `clsx`.
- Responzivní: na menších obrazovkách jsou textové popisky kroků skryté (`hidden md:block`), zůstávají jen kruhy. Tlačítka mají min. cca 44px pro dotykové ovládání.

---

## 4. State management

- **Store:** `lib/analyses/financial/store.ts` – Zustand, export `useFinancialAnalysisStore`.

**Stav:**

- `data` – celý draft analýzy (typ `FinancialAnalysisData` z Fáze 1, viz `types.ts`).
- `currentStep` – aktuální krok (1–7).
- `totalSteps` – konstantně 7 (`TOTAL_STEPS` z constants).

**Hydratace:**

- `hydrate()` – volá `loadFromStorage()` z `saveLoad.ts` a nastaví `data` a `currentStep`. Volá se jednou při načtení stránky (v `page.tsx` v `useEffect`).

**Navigace:**

- `goToStep(n)` – nastaví `currentStep` na platný krok (1–7) a zavolá `saveToStorage()`.
- `nextStep()` / `prevStep()` – posun o krok vpřed/vzad s uložením.
- `setCurrentStep(step)` – přímé nastavení kroku s uložením.

**Persistence:**

- `saveToStorage()` – zapíše `data` a `currentStep` do localStorage přes `saveToStorage(data, currentStep)` z Fáze 1.
- `reset()` – nastaví `data` na `getDefaultState()` a `currentStep` na 1, pak `saveToStorage()`.
- `loadFromFile(json)` – parsuje JSON, použije `mergeLoadedState(getDefaultState(), parsed)` z Fáze 1 a výsledek nastaví do store (včetně `currentStep`). Není zde reload stránky – stav se pouze aktualizuje.

**Datový model:** Jediný zdroj pravdy je Fáze 1 – `getDefaultState()`, `types.ts`. Store neobsahuje vlastní kopii struktury.

**Odvozené hodnoty:** Krokové komponenty nepoužívají lokální výpočty; volají selektory z `selectors.ts` (např. `selectTotalIncome`, `selectSurplus`, `selectNetWorth`, `selectStrategyTotals`). Výpočty zůstávají v `calculations.ts`.

---

## 5. Toolbar akce

- **Komponenta:** `app/portal/analyses/financial/components/FinancialAnalysisToolbar.tsx`

**Uložit:**

- Volá `saveToStorage()` ze store (zápis do localStorage).
- Poté `exportToFile(data, currentStep)` z `saveLoad` – vrací JSON a název souboru (název z `exportFilename(clientName)` z formatters).
- Vytvoří blob, stáhne soubor (např. `financni-plan-{jméno}-{datum}.json`).

**Načíst:**

- Skrytý `<input type="file" accept=".json">`. Při výběru souboru se přečte text a předá do `loadFromFile(text)` ze store.
- Store uvnitř parsuje JSON a použije `mergeLoadedState(getDefaultState(), parsed)` z Fáze 1; výsledek nastaví do store. Stránka se nereloaduje.

**Nový plán:**

- `window.confirm("Opravdu chcete smazat...")` a při potvrzení volání `reset()` ze store.

Všechna tlačítka mají min. výšku 44px (touch-friendly). Žádné mock callbacky – akce jsou napojené na store a moduly z Fáze 1.

---

## 6. Kroky – připravené komponenty

Všechny kroky jsou implementované jako plnohodnotné React komponenty (ne placeholder):

| Krok | Komponenta | Soubor |
|------|------------|--------|
| 1 | StepClientInfo | `components/steps/StepClientInfo.tsx` |
| 2 | StepCashflow | `components/steps/StepCashflow.tsx` |
| 3 | StepAssetsLiabilities | `components/steps/StepAssetsLiabilities.tsx` |
| 4 | StepCredits | `components/steps/StepCredits.tsx` |
| 5 | StepGoals | `components/steps/StepGoals.tsx` |
| 6 | StepStrategy | `components/steps/StepStrategy.tsx` |
| 7 | StepSummary | `components/steps/StepSummary.tsx` |

**Wiring:** Každá komponenta čte a zapisuje výhradně přes `useFinancialAnalysisStore` a moduly z Fáze 1 (selectors, calculations, formatters, constants). Business logika není duplikovaná v UI.

**StepSummary:** Obsahuje tlačítko „Export / tisk reportu“ – vygeneruje HTML přes `buildReportHTML(data)` z `report.ts`, zobrazí ho v overlay, vykreslí reportové grafy (data z `charts.ts`, vykreslení Chart.js), pak zavolá `window.print()`.

---

## 7. Připravenost na Fázi 3 a další rozšíření

- **Úpravy kroků po jednom:** Architektura to umožňuje – každý krok je samostatná komponenta, store a Fáze 1 moduly jsou sdílené.
- **Rozšíření reportu / PDF:** Report je generován v `report.ts`; StepSummary pouze volá `buildReportHTML` a tisk. Přidání exportu do PDF souboru (např. pdf-lib) lze řešit v report vrstvě nebo v StepSummary bez změny ostatních kroků.
- **Napojení clientId / householdId:** Store má `setLinkIds(clientId?, householdId?)` a v `FinancialAnalysisData` jsou volitelná pole `clientId`, `householdId`. Stránka již čte `?clientId=` a `?householdId=` z URL a předává je do store. Pro plné napojení na CRM stačí na straně portálu předvyplnit nebo propojit analýzu s klientem/domácností podle těchto ID.

---

## Shrnutí

- **Route:** `/portal/analyses/financial`, dostupná z menu portálu, rozcestníku analýz a z detailu domácnosti.
- **Layout:** Titul, stepper, toolbar, obsah kroku, footer Zpět/Další.
- **Stepper:** Řízený ze store, přímý skok na krok, aktivní/dokončený stav.
- **State:** Zustand store s `data` a `currentStep`, hydrate/saveToStorage/reset/loadFromFile napojené na saveLoad a defaultState z Fáze 1.
- **Toolbar:** Uložit (export JSON), Načíst (soubor → merge do store), Nový plán (reset).
- **Kroky:** Všech 7 jako plnohodnotné komponenty; připravené na dílčí vylepšení (validace, UX, sdílené field komponenty) a na rozšíření reportu a CRM napojení.
