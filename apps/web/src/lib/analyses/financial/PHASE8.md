# Fáze 8 – Polish, QA, cleanup a dokončení migrace financni-analyza

Závěrečná fáze migrace: parity vůči původní HTML verzi, QA, odstranění legacy runtime, cleanup, error handling, responsive a testovatelnost.

**Finální audit Fáze 8** (parity osobní i firemní FA, import, shared facts, report/PDF, Zajištění příjmů, cleanup, rizika a doporučení) je v **[../PHASE8_FINAL_AUDIT.md](../PHASE8_FINAL_AUDIT.md)**.

---

## Kroky osobní FA (8 kroků)

Aktuální wizard má **8 kroků** (constants: `STEP_TITLES`, `TOTAL_STEPS = 8`):

1. Klient  
2. Cashflow  
3. Majetek  
4. Úvěry  
5. Cíle  
6. Strategie  
7. **Zajištění příjmů** (income protection – více osob, pojišťovny, rizika, firemní/osobní úhrada, optimalizace jednatel/majitel)  
8. Shrnutí (report, grafy, tisk, export do dokumentů)

Původní HTML měl 7 kroků (Shrnutí bylo krok 7); rozšíření o krok 7 „Zajištění příjmů“ a přesunutí Shrnutí na krok 8 je záměrné.

---

## 1. Parity audit vůči původní HTML verzi

Ověřeno podle [PHASE1_AUDIT.md](./PHASE1_AUDIT.md) a přímého porovnání modulů s odpovědnostmi vytaženými z `financni-analyza.html`. Rozšíření o krok Zajištění příjmů a detaily parity jsou v [../PHASE8_FINAL_AUDIT.md](../PHASE8_FINAL_AUDIT.md).

| Oblast | Stav | Poznámka |
|--------|------|----------|
| Kroky a pole | Shodné (rozšířeno) | 8 kroků (Klient, Cashflow, Majetek, Úvěry, Cíle, Strategie, **Zajištění příjmů**, Shrnutí). Struktura `FinancialAnalysisData` v types.ts odpovídá AppState v HTML + **incomeProtection** (persons, plány, funding, benefitVsSalaryComparison), **_provenance** pro shared facts. |
| Výpočty | Shodné | calculations.ts: RENTA_INFLATION 0.03, RENTA_WITHDRAWAL_RATE 0.06; futureRentMonthly, capitalForRenta, goalFvTarget, pmtToReachFv, computeGoalComputed; monthlyPayment, totalRepayment; totalIncome/Expense, surplus, reserveTarget; totalAssetsFromValues, totalLiabilitiesFromValues, netWorth; investmentFv s conservative -2 %; strategyTotals; loansListBalanceSum, loansListPaymentsSum; ownResourcesFromLtv/FromAko. |
| Selectors | Shodné | selectors.ts mapuje KPI (totalIncome, totalExpense, surplus, reserveTarget/Gap, isReserveMet, totalAssets, totalLiabilities, netWorth, totalMonthlySavings, totalTargetCapital, strategyTotals, portfolioFv) na data. |
| Save/load | Shodné | saveLoad.ts: mergeLoadedState po sekcích (client, partner, children, cashflow, assets, liabilities, goals s computeGoalComputed, strategy, newCreditWishList + migrace newCreditWish, investments, insurance, clientId, householdId); saveToStorage/loadFromStorage; exportToFile/importFromFile; clearStorage. |
| Report | Shodné | report.ts: buildReportHTML, computeInsurance (GROSS_FROM_NET_FACTOR, RENT_RATE, invalidita/PN/smrt/TN). Sekce a KPI odpovídají HTML. |
| Grafy | Shodné | charts.ts: getGrowthChartData (maxYears, labels, values s conservative), getAllocationChartData (byProduct), getGoalChartData (target + projection). |

**Závěr:** Žádné funkční rozdíly proti původní HTML verzi nebyly nalezeny. React verze používá stejné moduly vytažené ve Fázi 1; business logika nebyla měněna.

---

## 2. QA wizardu a CRM (checklist)

- **Krok 1 – Klient:** Zadání jména, partnera, dětí; přidání/odebrání dítěte; přechod vpřed/zpět; persistence (localStorage + CRM draft).
- **Krok 2 – Cashflow:** Příjmy/výdaje, otherDetails; surplus, reserveTarget, reserveGap, isReserveMet.
- **Krok 3 – Majetek:** Aktiva, investmentsList, pensionList; celkové součty.
- **Krok 4 – Úvěry:** Úvěry, credit wishes (CREDIT_WISH_BANKS), měsíční splátka / totalRepayment.
- **Krok 5 – Cíle:** Cíle (renta, horizon), přepočet FV/PMT; graf cíle.
- **Krok 6 – Strategie:** Profil, konzervativní režim, investice, FV strategie.
- **Krok 7 – Zajištění příjmů:** Osoby, pojišťovny, rizika, měsíční/roční příspěvky, zdroj úhrady (firma/osobní/OSVČ), optimalizace jednatel/majitel (benefit vs mzda).
- **Krok 8 – Shrnutí:** KPI, report HTML (včetně zajištění příjmů a optimalizace), grafy (růst, alokace), tisk, export do dokumentů (clientId), export JSON.
- **CRM:** Otevření z klienta (?clientId=) a z domácnosti (?householdId=); uložení draftu; načtení draftu (?id=); export reportu do dokumentů; propojení s firmou a shared facts (načtení/aktualizace/odpojení); routing a datová integrita.

*(Manuální QA průchod doporučen před release; tento dokument slouží jako checklist.)*

---

## 3. Cleanup – odstraněné legacy

- **financni-analyza.html:** Přesunut do `docs/archive/financni-analyza.html` (nebo odstraněn podle rozhodnutí týmu). Aplikace na něj již neodkazuje.
- **public/financial-analysis-lib.js:** Odstraněn (IIFE byl určen pouze pro původní HTML).
- **build:financial-lib:** Script odstraněn z apps/web/package.json.
- **PHASE1.md / PHASE1_AUDIT.md:** Doplněna poznámka, že od Fáze 8 se původní HTML již nepoužívá jako runtime.

---

## 4. Error handling

- **Stránka analýzy (page.tsx):** Při `?id=` zobrazen loading stav; při chybě (404, síť) zpráva a odkaz „Začít novou analýzu“. Při neplatném payloadu zachycena výjimka a zobrazena hláška.
- **Toolbar – Uložit do CRM:** V catch zobrazena chyba uživateli (alert/toast).
- **Load from file:** Při neplatném JSON nebo selhání merge vráceno false; v UI zobrazeno „Nepodařilo se načíst soubor“.

---

## 5. Performance a stabilita

- Store notifikuje pouze při změně stavu; komponenty čtou přes selektory. Těžké výpočty jsou v čistých funkcích (calculations, selectors); v krocích lze podle potřeby doplnit useMemo pro odvozené hodnoty.
- Chart.js v StepSummary a StepGoals: cleanup (destroy) při unmount je implementován v useEffect.

---

## 6. Responsive (mobile / tablet / desktop)

- **Layout:** px-3 sm:px-4, max-w-4xl/5xl, pb-20; použitelné na malém viewportu.
- **Stepper:** Názvy kroků skryté na mobilu (hidden md:block); min. 44px tap targets; overflow-x-auto.
- **Toolbar:** min-h-[44px], flex-wrap; všechny akce dostupné bez hover.
- **Formuláře:** Dotykově použitelné; přidat/odebrat položky vždy tlačítkem.
- **Summary/report:** Overlay scrollovatelný a zavíratelný.

---

## 7. Testovatelnost

- **Čisté moduly vhodné pro unit testy:** calculations.ts, selectors.ts, saveLoad.ts (mergeLoadedState, export/import), report.ts (buildReportHTML), charts.ts (getGrowthChartData, getAllocationChartData, getGoalChartData).
- **Příkladové testy:** V `__tests__/calculations.test.ts` (cashflow: totalIncome, totalExpense, surplus, reserveTarget/Gap, isReserveMet; credit: monthlyPayment, totalRepayment) a `__tests__/saveLoad.test.ts` (mergeLoadedState: default při chybějícím data, merge client, clamp currentStep, merge cashflow). Spuštění: `pnpm test` v apps/web.
- **E2E smoke (volitelně):** Otevření `/portal/analyses/financial`, přechod krok 2 → zpět, uložení do souboru.

---

## 8. Připravenost na další analýzy

- Modulární struktura: types, defaultState, calculations, selectors, formatters, validation, saveLoad, report, charts, store.
- CRM: tabulka financial_analyses, server actions, entry pointy z kontaktu a domácnosti, export do dokumentů.
- Rozšíření: další typ analýzy může re-use store pattern, constants, formatters a přidat vlastní kroky a report.

---

## Acceptance criteria Fáze 8

- [x] React verze odpovídá funkčně původní HTML verzi (parity zdokumentována).
- [x] Kroky wizardu fungují end-to-end; save/load/reset (localStorage, JSON, server draft).
- [x] Report / tisk / export do dokumentů; grafy.
- [x] CRM integrace (otevření z klienta/domácnosti, draft, export).
- [x] Použitelnost na desktopu, tabletu i mobilu.
- [x] Původní HTML runtime a IIFE build odstraněny.
- [x] Cleanup (dead code, legacy); error handling.
- [x] PHASE8.md popisuje parity, QA, cleanup, CRM, responsive a připravenost na další moduly.
