# Fáze 3 – Převod prvního a druhého kroku

Dokumentace převodu kroku 1 (Osobní údaje) a kroku 2 (Cashflow) do React komponent: které části byly převedeny, napojení na store, přepočty, dynamické seznamy a save/load kompatibilita.

---

## 1. První krok – převedené části

**Komponenta:** `app/portal/analyses/financial/components/steps/StepClientInfo.tsx`

- **Hlavní klient:** Jméno, datum narození, věk (odvozený z data), email, telefon, povolání, sporty. Vše čteno z `data.client`, zápis přes `setClient({ ... })`. Mapování odpovídá typu `ClientInfo` z `lib/analyses/financial/types.ts`.
- **Partner:** Checkbox „Přidat partnera“ (`client.hasPartner`), při zaškrtnutí sekce s jménem a datem narození partnera. Čteno/zápis přes `setPartner({ name, birthDate })`, typ `PartnerInfo`.
- **Děti:** Dynamický seznam – přidat (tlačítko volá `addChild()`), pro každé dítě řádek s polem Jméno, Datum narození a tlačítko Odebrat. Zápis přes `updateChild(id, "name" | "birthDate", value)`, `removeChild(id)`. Struktura odpovídá `ChildEntry[]` (id, name, birthDate).

**Napojení na store:** Čtení `data.client`, `data.partner`, `data.children`; zápis `setClient`, `setPartner`, `addChild`, `updateChild`, `removeChild`. Store po každé změně volá `saveToStorage()`.

**Helper:** Věk se počítá v komponentě funkcí `ageFromBirthDate(birthDate)` (podpora RRRR-MM-DD a D.M.RRRR). Výpočet je čistý, neukládá se do modelu.

**Save/load:** Data klienta, partnera a dětí jsou součástí `FinancialAnalysisData`; ukládají a načítají se přes `saveToStorage()` / `loadFromStorage()` a `mergeLoadedState()` z Fáze 1. Po načtení nebo resetu se hodnoty znovu vykreslí ze store.

---

## 2. Druhý krok – převedené části

**Komponenta:** `app/portal/analyses/financial/components/steps/StepCashflow.tsx`

- **Příjmy:** Hlavní příjem, příjem partnera (číselné vstupy v Kč), sekce „Ostatní“ – dynamický seznam položek `{ desc, amount }` s přidat/upravit/odebrat. Mapování: `incomes.main`, `incomes.partner`, `incomes.otherDetails[]`. Zápis: `setCashflowField("incomes.main" | "incomes.partner", value)`, `addIncomeOther`, `updateIncomeOther`, `removeIncomeOther`.
- **Výdaje:** Bydlení, energie, jídlo, doprava, děti, pojistky (číselné vstupy), sekce „Ostatní“ – dynamický seznam. Mapování: `expenses.housing|energy|food|transport|children|insurance`, `expenses.otherDetails[]`. Zápis: `setCashflowField("expenses.*", value)`, `addExpenseOther`, `updateExpenseOther`, `removeExpenseOther`.
- **Součty a odvozené hodnoty:** Příjmy celkem, výdaje celkem, bilance (surplus) a blok „Finanční rezerva“ (aktuální hotovost, cílová rezerva v měsících 3–12, cíl rezervy v Kč, chybí doplnit, rezerva splněna). Žádný výpočet v komponentě – vše přes **selectors** z Fáze 1: `selectTotalIncome`, `selectTotalExpense`, `selectSurplus`, `selectReserveTarget`, `selectReserveGap`, `selectIsReserveMet`. Formátování přes `formatCzk` z `formatters.ts`.

**Napojení na store a Fázi 1:** Čtení `data` ze store, odvozené hodnoty ze selectors (selectors volají `calculations.ts`). Zápis: `setCashflowField`, `addIncomeOther`, `updateIncomeOther`, `removeIncomeOther`, `addExpenseOther`, `updateExpenseOther`, `removeExpenseOther`. Rezerva: `reserveCash`, `reserveTargetMonths` (range 3–12) ukládány přes `setCashflowField("reserveCash" | "reserveTargetMonths", value)`.

**Dynamické seznamy:** Ostatní příjmy a ostatní výdaje – každá položka má `id`, `desc`, `amount` (typ `OtherDetailItem`). Přidání: `addIncomeOther("Ostatní", 0)` resp. `addExpenseOther("Ostatní", 0)`; editace: `updateIncomeOther(id, { desc?, amount? })` a obdobně u výdajů; odebrání: `removeIncomeOther(id)` / `removeExpenseOther(id)`.

**Save/load:** Cashflow včetně `incomes`, `expenses`, `reserveCash`, `reserveTargetMonths` je součástí `FinancialAnalysisData.cashflow`; merge a serializace jsou v saveLoad z Fáze 1. Export/import JSON a reset zachovávají strukturu a hodnoty.

---

## 3. Jak jsou pole napojená na store

| Krok | Pole / sekce | Store akce |
|------|--------------|------------|
| 1 | client (name, birthDate, email, phone, occupation, sports, hasPartner) | `setClient({ ... })` |
| 1 | partner (name, birthDate) | `setPartner({ ... })` |
| 1 | children[] | `addChild()`, `updateChild(id, field, value)`, `removeChild(id)` |
| 2 | incomes.main, incomes.partner | `setCashflowField("incomes.main" | "incomes.partner", value)` |
| 2 | incomes.otherDetails[] | `addIncomeOther`, `updateIncomeOther`, `removeIncomeOther` |
| 2 | expenses.* | `setCashflowField("expenses.housing" | ... , value)` |
| 2 | expenses.otherDetails[] | `addExpenseOther`, `updateExpenseOther`, `removeExpenseOther` |
| 2 | reserveCash, reserveTargetMonths | `setCashflowField("reserveCash" | "reserveTargetMonths", value)` |

Všechny změny procházejí store; store po změně volá `saveToStorage()` (localStorage + kompatibilita s exportem JSON).

---

## 4. Jak fungují přepočty

- **Krok 1:** Věk je odvozený v komponentě z `client.birthDate` pomocí `ageFromBirthDate()`; neukládá se do store.
- **Krok 2:** Příjmy celkem, výdaje celkem, surplus, cíl rezervy, chybí doplnit, rezerva splněna – vše přes **selectors** (`selectTotalIncome`, `selectTotalExpense`, `selectSurplus`, `selectReserveTarget`, `selectReserveGap`, `selectIsReserveMet`). Selectors volají čisté funkce z `calculations.ts`. V komponentě se výpočty neduplikují; zobrazení částek přes `formatCzk` z `formatters.ts`.

---

## 5. Jak fungují dynamické seznamy

- **Děti (krok 1):** Seznam `data.children`. Přidat → `addChild()` (store přidá položku s id, name, birthDate). Editace → `updateChild(id, "name" | "birthDate", value)`. Odebrat → `removeChild(id)`.
- **Ostatní příjmy (krok 2):** Seznam `data.cashflow.incomes.otherDetails`. Přidat → `addIncomeOther("Ostatní", 0)`. Editace → `updateIncomeOther(id, { desc?, amount? })`. Odebrat → `removeIncomeOther(id)`.
- **Ostatní výdaje (krok 2):** Seznam `data.cashflow.expenses.otherDetails`. Přidat → `addExpenseOther("Ostatní", 0)`. Editace → `updateExpenseOther(id, { desc?, amount? })`. Odebrat → `removeExpenseOther(id)`.

Struktura položek (id, desc/name, amount/birthDate) odpovídá typům z Fáze 1 (`ChildEntry`, `OtherDetailItem`). Po reloadu nebo načtení ze souboru se seznamy vykreslí ze store.

---

## 6. Zachovaná save/load kompatibilita

- **Struktura dat:** Stejná jako v Fázi 1 – `FinancialAnalysisData` (client, partner, children, cashflow s incomes/expenses a otherDetails, reserveCash, reserveTargetMonths). Export JSON z toolbaru obsahuje `data` a `currentStep`; merge při načtení je v `mergeLoadedState()` v `saveLoad.ts`.
- **Uložení:** Store volá `saveToStorage()` po změnách; toolbar „Uložit“ navíc exportuje JSON soubor (exportToFile).
- **Načtení:** `hydrate()` na stránce načte z localStorage; „Načíst“ v toolbaru předá obsah souboru do `loadFromFile()` ve store, který použije `mergeLoadedState()`. Data z kroku 1 a 2 se po načtení znovu vykreslí.
- **Reset:** Volá `reset()` ze store – nastaví `getDefaultState()` a krok 1. Žádná ztráta kompatibility se staršími exporty.

---

## 7. Co zůstává v původním HTML a další fáze

- **Původní HTML:** Soubor `financni-analyza.html` zůstává samostatnou SPA s vlastním AppState a UI třídou; není tímto převodem měněn.
- **Kroky 3–7:** Již jsou převedeny v Reactu (StepAssetsLiabilities, StepCredits, StepGoals, StepStrategy, StepSummary). Pro „další fáze“ tedy nejde o převod zbylých kroků z HTML, ale o vylepšování již existujících React kroků (validace, UX, sdílené komponenty).

---

## 8. Shrnutí

- **Chování odpovídá původní analýze:** Stejný datový model a význam polí; výpočty a merge logika z Fáze 1; žádná změna výsledků.
- **Architektura je připravena na další vylepšení:** Validace polí, sdílené field komponenty (CurrencyField / InputAmount, SectionCard) lze doplnit bez změny store ani Fáze 1 modulů.
