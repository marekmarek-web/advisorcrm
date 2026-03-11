# Fáze 5 – Převod pátého a šestého kroku

Dokumentace převodu kroku 5 (Finanční cíle) a kroku 6 (Investiční strategie) do React komponent: které části byly převedeny, cíle a strategická logika, napojení na store, výpočty, grafy a save/load kompatibilita.

---

## 1. Pátý krok – převedené části

**Komponenta:** `app/portal/analyses/financial/components/steps/StepGoals.tsx`

- **Typy cílů:** „Důchod / renta (měsíční příjem)“ vs „Jiný cíl (cílový kapitál)“ – konstanty `GOAL_TYPES`; pole `type` (renta | jina).
- **Formulář cíle:** Název, cílový měsíční příjem / cílový kapitál (Kč), horizont (roky), strategie zhodnocení (Konzervativní ~5 % / Vyvážený ~7 % / Dynamický ~9 % – `STRATEGY_OPTIONS`), počáteční vklad (Kč), jednorázově nyní (Kč). Lokální state pro vyplňování; po „Přidat“ nebo „Uložit“ se volá `addGoal(...)` resp. `updateGoal(id, ...)`.
- **Výpočty:** Store při add/update volá `computeGoalComputed(type, amount, horizon, annualRate, initial, lumpsum)` z `calculations.ts` a ukládá `computed: { fvTarget, pmt, netNeeded }` do každého cíle. Žádná duplikace výpočtů v komponentě.
- **Seznam cílů:** `data.goals` – zobrazení s názvem, typem (Renta / Kapitál), FV cílem, horizontem, měsíčním spořením (PMT); tlačítka Upravit (naplní formulář a `editingId`) a Odebrat (`removeGoal(id)`).
- **Odvozené hodnoty:** `selectTotalMonthlySavings(data)` a `selectTotalTargetCapital(data)` z `selectors.ts` – celkem cílový kapitál a měsíčně spoření; formátování přes `formatCzk` z `formatters.ts`.
- **Graf:** `getGoalChartData(chartGoal)` z `charts.ts` – vývoj hodnoty v čase (cíl FV vs projekce spoření); výběr cíle pro graf přes `chartGoalId`. Komponenta používá Chart.js (Line) přes react-chartjs-2.

**Napojení na store:** Čtení `data`; zápis `addGoal`, `updateGoal`, `removeGoal`. Store po každé změně volá `saveToStorage()`. Goals mají v store při add/update doplněné `computed` přes `computeGoalComputed`.

**Save/load:** V `saveLoad.ts` se při merge načtených dat přepočítávají goals (`computeGoalComputed` pro každý načtený cíl). Reset nastaví `getDefaultState()` včetně prázdného `goals`. Po načtení nebo resetu se hodnoty znovu vykreslí ze store.

---

## 2. Šestý krok – převedené části

**Komponenta:** `app/portal/analyses/financial/components/steps/StepStrategy.tsx`

- **Profil rizika:** Dynamický / Vyvážený / Konzervativní – `PROFILE_OPTIONS`; zápis `setStrategyProfile(profile)`. Mapování: `data.strategy.profile`.
- **Konzervativní režim:** Checkbox „Konzervativní režim (snížené výnosy v projekci)“ – `setConservativeMode(checked)`; mapování: `data.strategy.conservativeMode`.
- **Produkty a částky:** Mřížka položek z `data.investments` (z `getDefaultInvestments()`). Každá položka: produkt (název z `getProductName(inv.productKey)` z formatters), typ (jednorázově / měsíčně / penze), roční sazba, **Částka (Kč)** nebo **Měsíčně (Kč)**, **Roky**. Zápis: `updateInvestment(productKey, type, "amount", value)` a `updateInvestment(productKey, type, "years", value)`. Store po změně přepočítá `computed.fv` pro danou investici (investment FV z calculations).
- **Shrnutí portfolia:** `selectStrategyTotals(data)` – celková FV (projekce), jednorázově vloženo, měsíční vklady (součet), celkem investováno; zobrazení profilu přes `getStrategyProfileLabel(profile)` z formatters.

**Napojení na store a Fázi 1:** Čtení `data.strategy`, `data.investments`; zápis `setStrategyProfile`, `setConservativeMode`, `updateInvestment`. Selector `selectStrategyTotals` volá `strategyTotals(invs, conservative)` z calculations. Žádná výpočtová logika v komponentě.

**Save/load:** Merge v saveLoad zachovává `strategy` (profile, conservativeMode) a `investments`; při načtení se investice a strategie znovu vykreslí ze store. Reset nastaví výchozí strategii a výchozí investments.

---

## 3. Jak fungují cíle

- **Přidání:** Uživatel vyplní formulář (typ, název, amount, horizon, strategy, initial, lumpsum) a klikne „Přidat cíl“. Komponenta volá `addGoal({ type, name, amount, horizon, strategy, initial, lumpsum })`. Store vytvoří `GoalEntry` s id, doplní `annualRate` a `strategy` (label), zavolá `computeGoalComputed` a uloží `computed: { fvTarget, pmt, netNeeded }`, přidá cíl do `data.goals` a volá `saveToStorage()`.
- **Úprava:** Uživatel klikne Upravit u cíle; komponenta naplní formulář a `editingId`. Po „Uložit“ se volá `updateGoal(editingId, { type, name, amount, horizon, strategy, initial, lumpsum })`. Store přepočítá `computed` přes `computeGoalComputed` a aktualizuje položku v `data.goals`.
- **Odebrání:** Tlačítko Odebrat volá `removeGoal(id)`; store odstraní cíl z `data.goals` a volá `saveToStorage()`.
- **Odvozené součty:** `selectTotalMonthlySavings` sčítá `g.computed?.pmt` ze všech cílů; `selectTotalTargetCapital` sčítá `g.computed?.fvTarget`. Zobrazení v horní části kroku (Celkem cílový kapitál, Měsíčně spoření).

---

## 4. Jak funguje strategická / investiční logika

- **Profil a režim:** `setStrategyProfile(profile)` a `setConservativeMode(value)` mění `data.strategy`. Konzervativní režim ovlivňuje projekci FV v `strategyTotals` (snížené výnosy).
- **Investice:** `data.investments` je pole položek (productKey, type, amount, years, annualRate, computed.fv). `updateInvestment(productKey, type, field, value)` aktualizuje amount nebo years a v store se přepočítá `computed.fv` pro danou položku (investment FV z calculations).
- **Shrnutí portfolia:** `selectStrategyTotals(data)` volá `strategyTotals(invs, conservative)` z calculations a vrací `{ totalFV, totalLump, totalMonthly, totalInvested }`. Zobrazení v boční kartě (Šrnutí portfolia).

---

## 5. Jak jsou pole napojená na store

**Krok 5 – cíle:** Žádné přímé „pole → setter“ pro jednotlivá pole cíle; formulář je lokální state, odeslání volá `addGoal(raw)` nebo `updateGoal(id, raw)`. Seznam čte `data.goals`, odebrání přes `removeGoal(id)`.

**Krok 6 – strategie:** `setStrategyProfile(profile)` pro `data.strategy.profile`; `setConservativeMode(value)` pro `data.strategy.conservativeMode`; `updateInvestment(productKey, type, "amount" | "years", value)` pro položky v `data.investments`.

Všechny změny procházejí store; store po změně volá `saveToStorage()`.

---

## 6. Jak fungují derived values a návazné přehledy

**Krok 5:**

- **Selectors:** `selectTotalMonthlySavings`, `selectTotalTargetCapital` – součty z `data.goals` (computed.pmt, computed.fvTarget). Zobrazení v horní části StepGoals.
- **Calculations:** `computeGoalComputed` – použita v store při addGoal/updateGoal a v saveLoad při merge goals. Vrací fvTarget, pmt, netNeeded podle typu cíle (renta vs kapitál).
- **Charts:** `getGoalChartData(goal)` – vrací labels, targetData, projectionData pro Line graf vývoje hodnoty v čase.

**Krok 6:**

- **Selector:** `selectStrategyTotals(data)` – volá `strategyTotals(invs, conservative)` z calculations; vrací totalFV, totalLump, totalMonthly, totalInvested.
- **Store:** Při `updateInvestment` store přepočítá `computed.fv` pro danou investiční položku (pomocí investment FV z calculations).
- **Formatters:** `getProductName`, `getStrategyProfileLabel`, `formatCzk`, `formatPercent` pro zobrazení názvů a částek.

Žádná klíčová výpočtová logika není v komponentách; vše v calculations, selectors a store.

---

## 7. Zachovaná save/load kompatibilita

- **Struktura dat:** `FinancialAnalysisData.goals` (pole GoalEntry s id, type, name, amount, horizon, strategy, annualRate, initialAmount, lumpSumNow, computed), `FinancialAnalysisData.strategy` (profile, conservativeMode), `FinancialAnalysisData.investments` (pole investičních položek s computed.fv). Merge při načtení je v `mergeLoadedState()` v saveLoad.
- **Goals při načtení:** Pro každý načtený cíl se volá `computeGoalComputed` a doplní se `computed`, aby byly FV a PMT konzistentní s aktuálními calculations.
- **Uložení:** Store volá `saveToStorage()` po změnách; toolbar „Uložit“ exportuje JSON. Reset nastaví `getDefaultState()` včetně prázdného `goals` a výchozího `strategy` a `investments`.
- **Přechod mezi kroky:** Data jsou v jednom store; při přepnutí na krok 5 nebo 6 se hodnoty načtou ze store. Žádná ztráta dat.

---

## 8. Co zbývá na finální fázi

- **Report / summary krok:** StepSummary již existuje v Reactu a čte data ze store (buildReportHTML(data), grafy z charts). Finální fáze může přidat vylepšení reportu (PDF export, další sekce), ale není nutné přepisovat krok 7 od nuly; architektura je připravena.

---

## 9. Shrnutí

- **Chování odpovídá původní analýze:** Stejný datový model a výpočty z Fáze 1 (computeGoalComputed, strategyTotals, investment FV); merge a serializace v saveLoad včetně přepočtu goals.
- **Architektura zvládá cíle a strategické výpočty:** Dynamické cíle s add/edit/remove, odvozené součty a graf; strategický profil, konzervativní režim a mřížka investic s FV projekcí; vše napojené na store a calculations/selectors bez duplicity v UI.
