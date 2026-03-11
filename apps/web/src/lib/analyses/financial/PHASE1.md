# Fáze 1 – Rozkouskování financni-analyza.html

## Audit a mapa HTML

**Detailní audit** souboru `financni-analyza.html` (řádky, odpovědnosti, mapování na moduly) je v **[PHASE1_AUDIT.md](./PHASE1_AUDIT.md)**. Tam najdete:

- Přehled bloků (konstanty, AppState, ReportGenerator, UI) s přibližnými řádky
- Mapování: datový model, load/save, výpočty, report, grafy, formátování → které moduly
- Co zůstalo v HTML (DOM / UI vrstva)
- Ověření chování a připravenost na Fázi 2

## Co vzniklo

Logika z `financni-analyza.html` byla vytažena do typovaných modulů. Chování výpočtů, save/load a reportu je zachované 1:1.

### Moduly

| Soubor | Obsah |
|--------|--------|
| **types.ts** | Typy: ClientInfo, PartnerInfo, ChildEntry, CashflowState, AssetsState, LiabilitiesState, GoalEntry, CreditWishEntry, StrategyState, InvestmentEntry, InsuranceState, FinancialAnalysisData, PersistedState, konstanty (FundDetail, LiabilityProviderGroup, CreditWishBank). |
| **constants.ts** | FUND_DETAILS, LIABILITY_PROVIDERS, CREDIT_WISH_BANKS, STORAGE_KEY, RENTA_INFLATION, RENTA_WITHDRAWAL_RATE, STEP_TITLES, TOTAL_STEPS. |
| **defaultState.ts** | getDefaultState(), getDefaultInvestments(), DEFAULT_CURRENT_STEP. |
| **calculations.ts** | Čisté funkce: totalIncome, totalExpense, surplus, reserveTarget, reserveGap, isReserveMet, totalAssetsFromValues, totalLiabilitiesFromValues, netWorth, monthlyPayment, totalRepayment, futureRentMonthly, capitalForRenta, goalFvTarget, pmtToReachFv, computeGoalComputed, fvLump, fvRegular, investmentFv, strategyTotals, loansListBalanceSum, loansListPaymentsSum, ownResourcesFromLtv, ownResourcesFromAko. |
| **selectors.ts** | selectTotalIncome, selectTotalExpense, selectSurplus, selectReserveTarget, selectReserveGap, selectIsReserveMet, selectTotalAssets, selectTotalLiabilities, selectNetWorth, selectLoansTotal, selectLoansPaymentsTotal, selectTotalMonthlySavings, selectTotalTargetCapital, selectStrategyTotals, selectPortfolioFv. |
| **formatters.ts** | formatCurrency, formatCzk, formatPercent, formatDateCs, safeNameForFile, exportFilename, PRODUCT_NAMES, getProductName, getStrategyDesc, getStrategyProfileLabel. |
| **validation.ts** | parseNumber, parseIntSafe. |
| **saveLoad.ts** | mergeLoadedState, loadFromStorage, saveToStorage, exportToFile, importFromFile, clearStorage. |
| **report.ts** | computeInsurance (celý výpočet pojištění), buildReportHTML (celý report jako HTML string), vnitřní helpery: renderPasivaDetail, renderGoalsRows, renderInvestmentsRows, renderInvestmentsTotal, renderCreditWishesPDF, renderGoalCoverage, renderRentaFormula, pdfClientExtra, buildPages34, renderInsurancePage. |
| **charts.ts** | getGrowthChartData, getAllocationChartData, getGoalChartData, recomputeInvestmentsFv (pouze příprava dat, bez Chart.js). |
| **index.ts** | Re-export všeho. |

## Od Fáze 8: původní HTML již není runtime

Od **Fáze 8** se původní soubor `financni-analyza.html` již nepoužívá jako runtime. Byl archivován v `docs/archive/financni-analyza.html`. Aplikace běží výhradně na React/Next verzi (`/portal/analyses/financial`). IIFE build (`build:financial-lib` / `public/financial-analysis-lib.js`) byl odstraněn.

## Co zůstalo v HTML (historicky, do Fáze 8)

V `financni-analyza.html` (nyní v archivu) zůstávalo:

- **AppState** – instance stavu, currentStep, totalSteps, volání save/load (lze napojit na saveLoad modul).
- **ReportGenerator** – volá buildReportHTML a renderPdfCharts; buildReportHTML lze nahradit voláním `buildReportHTML(data)` z modulu.
- **UI třída** – renderStepper, updateView, initListeners, bindInput, všechny render* seznamy (children, income other, expense other, loans, goals, credit wish, assets), recalcSums, recalcStrategy, renderGoalsChart, handleNext/Prev, atd.
- **DOM** – přepínání kroků (.step-content.active), aktualizace inputů a výstupních elementů, Chart.js vykreslování (new Chart(...)).
- **Konstanty a helpery** – FUND_DETAILS, LIABILITY_PROVIDERS, CREDIT_WISH_BANKS a getLiabilityProviderOptionsHTML jsou v HTML stále (pro dropdowny); lze je nahradit importem z constants + malým helperem pro HTML string.

Chování analýzy (výpočty, save/load, report, grafy) se neměnilo – logika je zrcadlena v modulech a připravena na Fázi 2 (React shell + stepper).

## Připravenost na Fázi 2

- **Datový model** – v typech, výchozí stav v defaultState.
- **Výpočty** – čisté funkce v calculations + selectors.
- **Persistence** – saveLoad.loadFromStorage, saveToStorage, exportToFile, importFromFile, mergeLoadedState.
- **Report** – report.buildReportHTML(data), report.computeInsurance(data).
- **Grafy** – charts.getGrowthChartData, getAllocationChartData, getGoalChartData; vykreslení Chart.js zůstane v UI (React komponenta může použít react-chartjs-2 a tato data).

## Ověření chování

- Výpočty: stejné vzorce jako v HTML (renta 3 % inflace, 6 % withdrawal, FV/PMT, měsíční splátka úvěru, strategie FV s conservative -2 %).
- Save/load: stejná struktura JSON a merge logika (včetně migrace newCreditWish → newCreditWishList a přepočtu goals).
- Report: stejné sekce, KPI, interpretace, pojištění (computeInsurance).
- Grafy: stejná příprava dat (růst, alokace, jeden cíl).

## Acceptance criteria Fáze 1 (kontrolní seznam)

Fáze 1 je splněná pouze tehdy, pokud platí vše:

- [x] **financni-analyza.html už není jedna nerozložená logická masa** – existuje audit (PHASE1_AUDIT.md) a logika je vytažená do modulů; HTML stále běží, duplicita je zdokumentovaná.
- [x] **Existují oddělené moduly** pro data (types, defaultState), výpočty (calculations), selectory, helpery (formatters, validation), persistence (saveLoad), report (report.ts) a chart prep (charts.ts).
- [x] **Business logika je oddělená** od co největší části DOM logiky – výpočty, merge, buildReportHTML, příprava dat pro grafy jsou v TS; v HTML zůstává AppState instance, ReportGenerator orchestrace a celá třída UI.
- [x] **Chování analýzy se nezměnilo** – vzorce, merge a výstupy odpovídají původnímu HTML.
- [x] **Save/load stále funguje** – struktura a merge v saveLoad.ts jsou kompatibilní s původním loadState/saveState.
- [x] **Report stále funguje** – buildReportHTML v report.ts dává stejný obsah; původní HTML může buď nadále používat vlastní buildReportHTML, nebo přepnout na volání modulu.
- [x] **Grafy stále fungují** – data pro růstový a alokační graf a pro goals chart jsou z charts.ts; vykreslení Chart.js zůstává v HTML.
- [x] **Kód je připravený na Fázi 2** – React shell a stepper mohou používat tyto moduly bez změny business logiky.
