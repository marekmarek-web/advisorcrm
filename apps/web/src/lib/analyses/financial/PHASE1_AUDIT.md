# Fáze 1 – Audit souboru financni-analyza.html

Dokument mapuje obsah `financni-analyza.html` na odpovědnosti a na vytažené moduly. Cíl: jasně oddělit business logiku (už v TS modulech) od DOM/UI vrstvy (zatím v HTML).

---

## 1. Přehled struktury HTML souboru

| Řádky (přibližně) | Blok | Odpovědnost |
|-------------------|------|-------------|
| 1–1757 | HTML, styly, Tailwind, report-root | Markup, CSS, skrytý kontejner pro report |
| 1764–1893 | Konstanty (FUND_DETAILS, LIABILITY_PROVIDERS) + helper getLiabilityProviderOptionsHTML | **→ constants.ts** (+ formatters pro názvy) |
| 1895–2543 | **AppState** (datový model, init, loadState, saveState, resetPlan, saveToFile, loadFromFile, updateField, addChild, cashflow/asset/liability/goal/credit/strategy/investment metody, goToStep, buildReportHTML) | **→ types, defaultState, saveLoad, calculations, report** |
| 2546–4065 | **ReportGenerator** (generate, buildReportHTML, renderPdfCharts, getProductName, CREDIT_WISH_BANKS lokálně, sekce reportu) | **→ report.ts, charts.ts, constants.ts** |
| 4067–konec | **UI** (constructor, renderStepper, updateView, initListeners, bindInput, render* seznamy, recalcSums, goals chart, atd.) | **Zůstává v HTML** (DOM / UI vrstva) |

---

## 2. Detailní mapa odpovědností

### 2.1 Datový model a stav

| Kde v HTML | Co | Modul |
|------------|-----|--------|
| 1902–1950 | Inicializace `this.data` (client, partner, children, cashflow, assets, liabilities, goals, newCreditWishList, strategy, investments, insurance) | **defaultState.ts** – `getDefaultState()`, `getDefaultInvestments()` |
| 1956–1975 | init(): loadState nebo pre‑fill investments (8 položek) | **saveLoad.ts** – `loadFromStorage()`, **defaultState** – `getDefaultInvestments()` |
| 1897–1898 | STORAGE_KEY, currentStep, totalSteps | **constants.ts** – STORAGE_KEY, TOTAL_STEPS |

Struktura objektů (názvy polí, vnořené objekty) je zrcadlena v **types.ts** (ClientInfo, PartnerInfo, ChildEntry, CashflowState, AssetsState, LiabilitiesState, GoalEntry, CreditWishEntry, StrategyState, InvestmentEntry, InsuranceState, FinancialAnalysisData).

### 2.2 Načtení a uložení stavu (load / save)

| Kde v HTML | Co | Modul |
|------------|-----|--------|
| 1982–2096 | loadState() – JSON.parse, deep merge po sekcích (client, partner, children, cashflow, assets, liabilities, goals s přepočtem computed, strategy, newCreditWishList/migrace newCreditWish, investments, insurance) | **saveLoad.ts** – `mergeLoadedState()`, `loadFromStorage()` |
| 2098–2105 | saveState() – localStorage.setItem(STORAGE_KEY, JSON.stringify({ data, currentStep, timestamp })) | **saveLoad.ts** – `saveToStorage()` |
| 2107–2112 | resetPlan() – confirm, removeItem, location.reload | **saveLoad.ts** – `clearStorage()` (reload zůstává v UI) |
| 2114–2145 | saveToFile() – export JSON, filename z client name + datum, blob/download | **saveLoad.ts** – `exportToFile()`, **formatters.ts** – `exportFilename()` |
| 2147–2187 | loadFromFile() – FileReader, JSON.parse, merge do this.data, saveState, reload | **saveLoad.ts** – `importFromFile()` (reload a notifikace zůstávají v UI) |

Merge logika v HTML (goals s RENTA_INFLATION 0.03, FV/PMT přepočet, newCreditWish → newCreditWishList) je 1 : 1 v **saveLoad.mergeLoadedState()**.

### 2.3 Čisté výpočty

| Kde v HTML | Co | Modul |
|------------|-----|--------|
| loadState (goals map) 2032–2062 | FV pro rentu: 3 % inflace, kapitál = (futureRent×12)/0.06; PMT z netNeeded, r, n | **calculations.ts** – `futureRentMonthly`, `capitalForRenta`, `goalFvTarget`, `pmtToReachFv`, `computeGoalComputed` |
| buildReportHTML 2588–2610 | totalAssets, totalLiabilities, netWorth, totalInc/totalExp, surplus, reserveMonths | **calculations.ts** – totalIncome, totalExpense, totalAssetsFromValues, totalLiabilitiesFromValues, surplus, reserveTarget; **selectors.ts** |
| Report 2450–2456, 2937+ | Renta FV, CREDIT_WISH_BANKS, měsíční splátka | **calculations.ts** – `monthlyPayment`, `totalRepayment`; **constants.ts** – CREDIT_WISH_BANKS |
| renderPdfCharts 3937–3956 | Růstový graf: maxYears, labels, growthData (lump FV, měsíční anuita, conservative -2 %) | **charts.ts** – `getGrowthChartData()` |
| renderPdfCharts 4020–4027 | Alokační graf: byProduct, allocLabels, allocData | **charts.ts** – `getAllocationChartData()` |
| AppState recalc* metody | recalcLoansTotal, recalcAssetTotal, recalcOtherTotal, recalcStrategy (FV investic) | **calculations.ts** – loansListBalanceSum, loansListPaymentsSum, investmentFv, strategyTotals; **selectors.ts** |

Konstanty: RENTA_INFLATION 0.03, RENTA_WITHDRAWAL_RATE 0.06 jsou v **constants.ts**.

### 2.4 Report (HTML string a pojištění)

| Kde v HTML | Co | Modul |
|------------|-----|--------|
| 2576–3922 | buildReportHTML(data) – celý HTML report (header/footer, KPI, interpretace, tabulky, pasiva, cíle, strategie, grafy placeholdery, pojištění) | **report.ts** – `buildReportHTML()` |
| Report sekce pojištění | computeInsurance (příjem, rezerva, invalidita, PN, smrt, TN, doporučení) | **report.ts** – `computeInsurance()` |

Sekce, texty a vzorce v reportu jsou zachované v **report.ts** (včetně helperů typu renderPasivaDetail, renderGoalsRows, renderInvestmentsRows, renderCreditWishesPDF, renderInsurancePage).

### 2.5 Příprava dat pro grafy

| Kde v HTML | Co | Modul |
|------------|-----|--------|
| 3923–4015 | renderPdfCharts – growth: labels, growthData (investice, conservative) | **charts.ts** – `getGrowthChartData(data)` |
| 4017–4062 | renderPdfCharts – allocation: byProduct, labels, values | **charts.ts** – `getAllocationChartData(data)` |
| UI – goals chart | Data pro „Vývoj hodnoty v čase“ (jeden cíl) | **charts.ts** – `getGoalChartData(goal)` |

V HTML zůstává **vykreslení** (new Chart(ctx, …)); v modulech je pouze **příprava dat a konfigurace**.

### 2.6 Konstanty a helpery

| Kde v HTML | Co | Modul |
|------------|-----|--------|
| 1766–1845 | FUND_DETAILS | **constants.ts** – FUND_DETAILS |
| 1847–1870 | LIABILITY_PROVIDERS | **constants.ts** – LIABILITY_PROVIDERS |
| 2263, 2937, 4428, 4598 | CREDIT_WISH_BANKS (několik kopií v kódu) | **constants.ts** – CREDIT_WISH_BANKS |
| 3915–3921 | getProductName(key) | **formatters.ts** – getProductName, PRODUCT_NAMES |
| 1873–1892 | getLiabilityProviderOptionsHTML(groups, selected) | V HTML (dropdown); lze nahradit voláním constants + malým helperem |

### 2.7 Formátování a validace

| Kde v HTML | Co | Modul |
|------------|-----|--------|
| saveToFile 2116–2117 | safeName z client name | **formatters.ts** – safeNameForFile, exportFilename |
| Report a UI | Formát Kč, procenta, datum | **formatters.ts** – formatCurrency, formatCzk, formatPercent, formatDateCs |
| Různé parseFloat/parseInt | parseNumber, parseIntSafe | **validation.ts** – parseNumber, parseIntSafe |

---

## 3. Co zůstalo v HTML (DOM / UI vrstva)

Následující **není** vytaženo do modulů; zůstává v `financni-analyza.html`:

- **AppState** – instance (`this.data`, `this.currentStep`), volání save/load/reset/export/import a všechny metody, které přímo mění `this.data` a volají `saveState()`. Logika merge a výpočtů je zrcadlena v saveLoad/calculations; v HTML zůstává „kdo kdy volá“ a vazba na DOM.
- **ReportGenerator** – `generate()` (root.innerHTML = buildReportHTML, renderPdfCharts, window.print). Obsah `buildReportHTML` a příprava dat pro grafy jsou v report.ts a charts.ts; v HTML zůstává orchestrace a vykreslení Chart.js.
- **UI třída** – celá:
  - renderStepper, updateView, initHeaderScroll;
  - initListeners, bindInput;
  - render* pro dynamické seznamy (children, income other, expense other, asset investment/pension, loans, credit wish, goals);
  - recalcSums, recalcStrategy (volání app.recalc* a aktualizace DOM);
  - renderGoalsChart (Chart.js pro jeden cíl);
  - handleNext, handlePrev, goToStep (přepínání kroků a viditelnosti).
- **DOM** – přepínání `.step-content.active`, aktualizace inputů a výstupních elementů, vytváření Chart instancí (new Chart(...)).
- **Lokální kopie konstant** – FUND_DETAILS, LIABILITY_PROVIDERS a několik kopií CREDIT_WISH_BANKS jsou stále v HTML; mohou být nahrazeny načtením z `FinancialAnalysisLib` (IIFE build), pokud HTML přepne na použití knihovny.

Žádná z těchto věcí nemění business pravidla; jde o vykreslování a obsluhu událostí.

---

## 4. Mapování HTML → moduly (shrnutí)

| Odpovědnost | Zdroj v HTML | Cíl v modulech |
|-------------|--------------|-----------------|
| Datové typy a struktury | AppState this.data (1902–1950), použití v load/buildReport | **types.ts** |
| Výchozí stav a factory | init(), prázdný data, getDefaultInvestments | **defaultState.ts** |
| Výpočty (cashflow, bilance, cíle, FV, PMT, splátka, strategie) | loadState (goals), buildReportHTML, renderPdfCharts, recalc* | **calculations.ts** |
| Odvozené hodnoty a KPI | buildReportHTML, pills, summary | **selectors.ts** |
| Formátování a validace | saveToFile filename, report texty, parsování vstupů | **formatters.ts**, **validation.ts** |
| Konstanty | FUND_DETAILS, LIABILITY_PROVIDERS, CREDIT_WISH_BANKS, RENTA_*, STORAGE_KEY, STEP_TITLES | **constants.ts** |
| Persistence | loadState, saveState, resetPlan, saveToFile, loadFromFile | **saveLoad.ts** |
| Report HTML a pojištění | buildReportHTML, computeInsurance | **report.ts** |
| Příprava dat pro grafy | renderPdfCharts (growth, allocation), goals chart data | **charts.ts** |
| Stav wizardu, DOM, event listenery, vykreslování | AppState instance, ReportGenerator.generate, UI celá | **Zůstává v HTML** |

---

## 5. Ověření chování (acceptance criteria Fáze 1)

- **Výpočty** – Vzorce v calculations.ts odpovídají HTML (renta 3 % inflace, 6 % withdrawal, FV/PMT, měsíční splátka úvěru, strategie FV s conservative -2 %).
- **Save/load** – Struktura JSON a merge logika v saveLoad.ts odpovídá loadState/saveState (včetně migrace newCreditWish → newCreditWishList a přepočtu goals).
- **Report** – buildReportHTML v report.ts produkuje stejné sekce, KPI a interpretace; computeInsurance odpovídá výpočtu pojištění v HTML.
- **Grafy** – getGrowthChartData, getAllocationChartData, getGoalChartData v charts.ts vracejí stejná data jako logika v renderPdfCharts a v goals chartu.
- **financni-analyza.html** – Stále běží jako samostatná SPA; logika je navíc vyčleněná do modulů. Při přepnutí HTML na volání IIFE `FinancialAnalysisLib` (loadFromStorage, mergeLoadedState, buildReportHTML, getGrowthChartData, …) lze odstranit duplicitní kód z HTML a nechat v něm jen UI a volání knihovny.

---

## 6. Připravenost na Fázi 2 (React shell + stepper)

- **Datový model** – plně v types.ts a defaultState.ts.
- **Výpočty** – čisté funkce v calculations.ts; selectors.ts pro odvozené hodnoty.
- **Persistence** – saveLoad.loadFromStorage, saveToStorage, exportToFile, importFromFile, mergeLoadedState, clearStorage.
- **Report** – report.buildReportHTML(data), report.computeInsurance(data).
- **Grafy** – charts.getGrowthChartData, getAllocationChartData, getGoalChartData; vykreslení Chart.js může zůstat v UI (React komponenta + react-chartjs-2 a tato data).

Fáze 2 může postavit React stránku a komponenty na těchto modulech bez změny business logiky.

---

## Poznámka (Fáze 8)

Od Fáze 8 se původní `financni-analyza.html` již nepoužívá jako runtime. Byl přesunut do `docs/archive/financni-analyza.html`. Produkční verzí je React/Next aplikace na `/portal/analyses/financial`.
