# Fáze 4 – Převod třetího a čtvrtého kroku

Dokumentace převodu kroku 3 (Bilance – aktiva/pasiva) a kroku 4 (Úvěry k vyřízení) do React komponent: které části byly převedeny, dynamické seznamy, napojení na store, výpočty a save/load kompatibilita.

---

## 1. Třetí krok – převedené části

**Komponenta:** `app/portal/analyses/financial/components/steps/StepAssetsLiabilities.tsx`

**Aktiva:**

- **Hotovost** (cash), **nemovitosti** (realEstate) – číselné vstupy v Kč. Zápis: `setAssetsField("cash" | "realEstate", value)`.
- **Investice** – dynamický seznam `investmentsList` (typ + hodnota v Kč). Přidat/upravit/odebrat: `addAssetInvestment(type, value)`, `updateAssetInvestment(id, { type?, value? })`, `removeAssetInvestment(id)`. Store po změnách volá `recalcAssetTotals()` (součty investic a penzí).
- **Důchody/penze** – dynamický seznam `pensionList` (typ + hodnota). Přidat/upravit/odebrat: `addAssetPension(type, value)`, `updateAssetPension(id, { type?, value? })`, `removeAssetPension(id)`. Store volá `recalcAssetTotals()`.
- **Ostatní aktiva** (other). Zápis: `setAssetsField("other", value)`.

**Pasiva:**

- **Hypotéka** – částka a detaily: úroková sazba, fixace, měsíční splátka; poskytovatel hypotéky. Mapování: `data.liabilities` (mortgageAmount, mortgageDetails.rate/fix/pay, mortgageProvider). Zápis: `setLiabilitiesField("mortgageAmount" | "mortgageDetails.rate" | "mortgageDetails.fix" | "mortgageDetails.pay" | "mortgageProvider", value)`.
- **Úvěry (kromě hypotéky)** – dynamický seznam `loansList` (položky: desc, balance, pay). Přidat: `addLoan({ balance, desc })` (store doplní id a volá `recalcLoansTotal()`); odebrat: `removeLoan(id)`. Řádky se zobrazují s desc, balance, pay; store nabízí `updateLoan(id, patch)` – komponenta ho zatím nepoužívá (inline editace je volitelná vylepšení).
- **Ostatní pasiva a popis.** Zápis: `setLiabilitiesField("other" | "otherDesc", value)`.

**Odvozené hodnoty:** `selectTotalAssets`, `selectTotalLiabilities`, `selectNetWorth` z `selectors.ts` (volají `calculations.ts`). Zobrazení: celková aktiva, celková pasiva, čisté jmění. Formátování přes `formatCzk` z `formatters.ts`.

**Store a save/load:** Všechny hodnoty ze store; změny procházejí store a `saveToStorage()`. `recalcLoansTotal()` zapisuje součet zůstatků a měsíčních splátek do cashflow.expenses.loans. Save/load/reset zachovávají `assets` a `liabilities` včetně `investmentsList`, `pensionList`, `loansList` (merge v saveLoad).

---

## 2. Čtvrtý krok – převedené části

**Komponenta:** `app/portal/analyses/financial/components/steps/StepCredits.tsx`

- **Formulář nového úvěru/hypotéky:** Produkt (hypotéka / úvěr), účel, částka (Kč), doba splácení (roky), fixace (roky), banka (select z `CREDIT_WISH_BANKS` v `constants.ts`), volitelná vlastní sazba; u hypotéky LTV a AKO (%). Lokální state pro vyplňování formuláře; po „Přidat“ se volá `addCreditWish(...)` se spočítanými `estimatedRate`, `estimatedMonthly`, `estimatedTotal`.
- **Výpočty:** `monthlyPayment(amount, ratePercent, termYears)` a `totalRepayment(estimatedMonthly, termYears)` z `calculations.ts`; sazba z banky nebo z vlastního pole. Žádná duplikace výpočtů v komponentě.
- **Seznam úvěrových přání:** `data.newCreditWishList` – zobrazení položek (produkt, účel, částka, doba, sazba, měsíční splátka), tlačítko Odebrat volá `removeCreditWish(id)`.

**Dynamické chování:** Přidání položky z formuláře do `newCreditWishList`; odebrání z listu. Data jsou pouze ve store; po načtení stránky nebo load ze souboru se seznam vykreslí ze store. Editace existující položky by vyžadovala akci `updateCreditWish` ve store (momentálně není; lze přidat v další fázi).

**Konstanty:** `CREDIT_WISH_BANKS` z `constants.ts`. Save/load zachovávají `newCreditWishList` (merge v saveLoad).

---

## 3. Jak fungují dynamické seznamy

| Seznam | Krok | Akce | Store metody |
|--------|------|------|-------------|
| investmentsList | 3 | Přidat, upravit (typ, hodnota), odebrat | `addAssetInvestment`, `updateAssetInvestment`, `removeAssetInvestment` |
| pensionList | 3 | Přidat, upravit (typ, hodnota), odebrat | `addAssetPension`, `updateAssetPension`, `removeAssetPension` |
| loansList | 3 | Přidat, odebrat | `addLoan`, `removeLoan`. Editace: store má `updateLoan`, UI zatím nepoužívá |
| newCreditWishList | 4 | Přidat (z formuláře), odebrat | `addCreditWish`, `removeCreditWish` |

Po každé změně investic/penzí store volá `recalcAssetTotals()`; po změně úvěrů v pasivech store volá `recalcLoansTotal()`.

---

## 4. Jak jsou pole napojená na store

**Krok 3 – aktiva:** `setAssetsField(key, value)` pro cash, realEstate, other; dynamické seznamy přes `addAssetInvestment`, `updateAssetInvestment`, `removeAssetInvestment`, `addAssetPension`, `updateAssetPension`, `removeAssetPension`.

**Krok 3 – pasiva:** `setLiabilitiesField(path, value)` pro mortgageAmount, mortgageDetails.rate/fix/pay, mortgageProvider, other, otherDesc; úvěry přes `addLoan`, `removeLoan` (a volitelně `updateLoan`).

**Krok 4:** Formulář je lokální state; odeslání volá `addCreditWish(entry)` s vypočtenými estimatedRate, estimatedMonthly, estimatedTotal. Seznam čte `data.newCreditWishList`, odebrání přes `removeCreditWish(id)`.

Všechny změny procházejí store; store po změně volá `saveToStorage()`.

---

## 5. Jak fungují výpočty a derived values

**Krok 3:**

- **Selectors:** `selectTotalAssets`, `selectTotalLiabilities`, `selectNetWorth` – volají `totalAssetsFromValues`, `totalLiabilitiesFromValues`, `netWorth` z `calculations.ts`. Zobrazení celková aktiva, celková pasiva, čisté jmění.
- **Store:** `recalcAssetTotals()` přepočítává součty v rámci assets; `recalcLoansTotal()` sčítá zůstatky a splátky z `loansList` a zapisuje do cashflow.expenses.loans.

**Krok 4:**

- **Calculations:** `monthlyPayment(amount, ratePercent, termYears)`, `totalRepayment(estimatedMonthly, termYears)` – použity při přidání položky do `newCreditWishList`. Sazba z banky (CREDIT_WISH_BANKS) nebo z vlastního pole.

Žádná duplikace výpočtů v komponentách; formátování částek přes `formatCzk`.

---

## 6. Zachovaná save/load kompatibilita

- **Struktura dat:** `FinancialAnalysisData.assets` (cash, realEstate, investmentsList, pensionList, other) a `FinancialAnalysisData.liabilities` (mortgageAmount, mortgageDetails, mortgageProvider, loansList, other, otherDesc); `FinancialAnalysisData.newCreditWishList`. Merge při načtení je v `mergeLoadedState()` v saveLoad.
- **Uložení:** Store volá `saveToStorage()` po změnách; toolbar „Uložit“ exportuje JSON. Reset nastaví `getDefaultState()` včetně prázdných `investmentsList`, `pensionList`, `loansList`, `newCreditWishList`.
- **Přechod mezi kroky:** Data jsou v jednom store; při přepnutí na krok 3 nebo 4 se hodnoty načtou ze store. Žádná ztráta dat.

---

## 7. Co zůstává na další fáze (volitelně)

- **Editace úvěrů v kroku 3:** V `StepAssetsLiabilities` jsou položky `loansList` zobrazené s tlačítkem Odebrat. Store má `updateLoan(id, patch)`. Přidání inline editace (desc, balance, pay) v každém řádku a volání `updateLoan` – bez změny datového modelu a save/load.
- **Editace položky v kroku 4:** `newCreditWishList` umí přidat a odebrat; úprava existující položky by vyžadovala akci `updateCreditWish` ve store (pro Fázi 4 není nutná).

---

## 8. Shrnutí

- **Chování odpovídá původní analýze:** Stejný datový model a význam polí; výpočty v calculations a selectors; merge a serializace v saveLoad.
- **Architektura unese složitější kroky:** Dynamické seznamy s add/update/remove (investice, penze), add/remove (úvěry v pasivech, úvěrová přání); store recalc metody a selectors bez duplicity v UI.
