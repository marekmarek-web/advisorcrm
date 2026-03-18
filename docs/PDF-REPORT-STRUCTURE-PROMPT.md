# Prompt: Struktura a zdroje dat PDF výstupu finanční analýzy

**Účel:** Pro model (Sonnet 4) – pochopení, jak je strukturovaný PDF report, jaké informace obsahuje, z čeho plynou (inputs finanční analýzy) a které vstupy se do PDF přímo nepropisují.

---

## 1. Účel a kontext PDF reportu

PDF report je **finanční plán** vygenerovaný z dat **osobní finanční analýzy** (wizard v aplikaci). Slouží jako výstup pro klienta: shrnutí situace, doporučené cíle, portfolio, zajištění příjmů (pojištění) a volitelně firemní část. Data se zadávají v krocích wizardu; report je čistě odvozený výstup (žádná interaktivní editace v PDF).

---

## 2. Struktura PDF výstupu (pořadí sekcí a stránek)

Následuje **pořadí bloků** tak, jak je generuje `buildReportHTML`. Každá `<section class="pdf-page">` = jedna stránka A4 (s výjimkou sloučených krátkých bloků na jedné stránce).

### 2.1 Osobní část (vždy)

| Pořadí | Sekce / stránka | Obsah |
|--------|------------------|--------|
| 1 | **Titulní stránka** | Header „FINANČNÍ PLÁN“, logo (nebo placeholder), název dokumentu, jméno klienta, volitelně povolání/sporty, datum vyhotovení, footer. |
| 2 | **SOUHRN & BILANCE** | KPI: Čisté jmění, Měsíční bilance, Rezerva. Krátká interpretace (kladné/záporné jmění, rezerva v měsících). Tabulky: Aktiva (hotovost, nemovitosti, investice, penzijní, ostatní), Pasiva (hypotéka, úvěry, ostatní). Volitelně detail pasiv (hypotéka – úrok, fixace, splátka; úvěry – řádky). Sekce **Cashflow**: tabulka Příjmy vs. Výdaje (hlavní příjem, partner, ostatní příjmy | bydlení+energie, spotřeba+jídlo, ostatní výdaje+děti+pojištění), CELKEM, **Volná kapacita na investice**. |
| 3 | **CÍLE A STRATEGIE** | Blok „Finanční cíle & Pokrytí“: souhrn (celkem cíle, potenciál portfolia, status pokrytí). Tabulka cílů: Cíl, Horizont, Cílová částka, Potřeba měsíčně. Volitelně vzorec renty (FV = P×(1+i)^n, potřebný kapitál). Sekce **Úvěry/hypotéky k vyřízení**: tabulka (typ, částka, LTV/Akontace, úrok %, měsíčně, celkem). **Doporučené portfolio**: název strategie (profil), popis; tabulka produktů (Produkt, Typ, Vklad, Výnos, Předpoklad FV), řádek CELKEM (jednorázově, měsíčně, FV). |
| 4+ | **Detail produktu** (1 stránka na produkt) | Pro každý investiční produkt s vkladem > 0: název, typ (Jednorázová/Penzijní/Pravidelná), „Vaše investice“, popis proč, riziko/likvidita/výnos, investiční cíl, vhodné pro, strategie, výhody, parametry, holdings (top 10, země, sektory), očekávaná FV. |
| N | **PROJEKCE** | Nadpis „Vývoj hodnoty majetku“; placeholder pro canvas (graf). Text projekce (od X do Y v roce N). „Rozložení aktiv“; placeholder pro druhý canvas. Právní upozornění. |
| N+1 | **ZAJIŠTĚNÍ PŘÍJMŮ** (životní pojištění) | Pokud je příjem > 0: blok „Životní pojištění – [klient]“: příjem čistého měsíčně (badge OSVČ pokud OSVČ), tabulka rizik (Invalidita 2.–3., Trvalé následky, PN, Smrt) a doporučené částky. Gridy: Invalidita (potřeba, z pojištění, státní důchod, vlastní majetek), Pracovní neschopnost (ČSSZ, PN, celkem nebo OSVČ), Trvalé následky (základ, progrese), Smrt (závazky, rodina, doporučeno nebo „INDIVIDUÁLNĚ“). Na **stejné stránce** (sloučeno): bloky „Životní pojištění – [partner]“ (příjem, invalidita, PN, smrt) a „Doporučení pro děti“ (invalidita 3–5 mil., TN max 2 mil.). |
| N+2 | **Zajištění příjmů – navržené řešení** | Tabulka: Osoba, Role, Pojišťovna, Rizika, Měsíční/roční, Zdroj úhrady, Poznámka. Celková měsíční cena. (Data z `incomeProtection.persons` a jejich `insurancePlans`.) |
| N+3 | **Optimalizace zajištění příjmů** (volitelně) | Pokud je zapnutá optimalizace pro jednatele/majitele: pro každou osobu tabulka (Firma platí, Osobně doplácí, Celkové pojistné, Varianta A – mzda, Varianta B – příspěvek, Úspora firmy ročně, Daňová úspora majitelů), volitelně text vysvětlení. |
| N+4 | **POZNÁMKY** (volitelně) | Pouze pokud jsou vyplněné „Poznámky k analýze“. Jedna stránka s nadpisem a textem poznámek. |

### 2.2 Firemní část (pouze pokud `includeCompany === true`)

| Pořadí | Sekce | Obsah |
|--------|--------|--------|
| +1 | Titulka firmy | Header „FINANČNÍ ANALÝZA – FIRMA“, ikona, „Společnost a jednatel“, jméno jednatele, datum. |
| +2 | PŘEHLED FIRMY | KPI: Roční tržby, Roční zisk, Cash runway (měs.), Dluhová služba. Doporučení dle počtu pokrytých rizik. Tabulka Firemní pojištění (6 kategorií: Majetek, Přerušení, Odpovědnost, Jednatel, Vozidla, Kyber). Detail limitů u majetek/přerušení/odpovědnost. Sekce Benefity (DPS/DIP/IŽP, roční náklad, zaměstnanci, příspěvek na osobu, danové zvýhodnění). Odkaz na zajištění příjmů v osobní části. |

---

## 3. Mapování: Od vstupů wizardu k výstupům PDF

Wizard má kroky (v pořadí): **Klient**, **Cashflow**, (volitelně **FIRMA**), **Majetek**, **Úvěry**, **Cíle**, **Strategie**, **Zajištění**, **Shrnutí**. Níže jsou **vstupy** podle kroků a kde se v PDF objeví (nebo že se nepropisují).

### 3.1 Krok „Klient“

- **client.name** → Titulka, všechny hlavičky sekcí („pro: [jméno]“), záhlaví tabulek.
- **client.birthDate** → Nepropisuje se přímo; používá se pro **výpočet věku** (insurance: roky do 65, děti do 18).
- **client.hasPartner** → Nepropisuje se přímo; ovlivňuje výpočet smrti (rodina, partner) a zobrazení bloku partnera v pojištění.
- **client.occupation**, **client.sports** → Titulka („Povolání:“, „Sporty:“) v malém bloku pod jménem.
- **client.email**, **client.phone**, **client.birthNumber** → Do PDF **nepropisují** se (pouze v UI wizardu).

### 3.2 Krok „Cashflow“

- **cashflow.incomeType** (zaměstnanec / OSVČ) → Nepropisuje se slovně; ovlivňuje výpočet PN (OSVČ bez nemocenské) a zobrazení badge „OSVČ“ u příjmu na stránce Zajištění příjmů.
- **cashflow.incomes.main** → Příjem v tabulce Cashflow, výpočet pojištění (invalidita, PN, smrt), „Příjem: X čistého měsíčně“ v životním pojištění.
- **cashflow.incomes.partner** → Řádek Partner v Cashflow; výpočet smrti (rodina); blok Životní pojištění – partner.
- **cashflow.incomes.otherDetails** (pole { desc, amount }) → Řádek „Ostatní příjmy“, součet do tabulky.
- **cashflow.expenses** (housing, energy, food, transport, children, insurance/insuranceItems, loans, otherDetails) → Sloupce výdajů v Cashflow (součty Bydlení+Energie, Spotřeba+Jídlo, Ostatní+děti+pojištění); **totalExpense** jde do interpretace rezervy a do výpočtu potřeby při invaliditě.
- **cashflow.reserveCash** → KPI Rezerva, interpretace „Rezerva pokrývá X měsíců“, výpočet renty z vlastního majetku (invalidity).
- **cashflow.reserveTargetMonths**, **reserveGap**, **isReserveMet** → Do PDF **nepropisují** se (pouze UI).
- **cashflow.incomeGross**, **partnerGross**, **partnerIncomeType** → Do PDF přímo ne; mohou ovlivnit odvozené hodnoty, pokud by se někde používaly (aktuálně výpočet PN používá main a GROSS_FROM_NET_FACTOR).

### 3.3 Krok „Majetek“ (assets)

- **assets.cash**, **realEstate**, **investments**, **pension**, **other** → Tabulka Aktiva, CELKEM aktiv; vstup do čistého jmění a do výpočtu pojištění (likvidní aktiva, renta z majetku při invaliditě).
- **assets.investmentsList**, **pensionList**, **realEstateItems** → Do PDF **nepropisují** se jako samostatné řádky (pouze součty do investments/realEstate/pension).

### 3.4 Krok „Úvěry“ (liabilities)

- **liabilities.mortgage**, **loans**, **other** → Tabulka Pasiva; součet jde do výpočtu smrti (krytí závazků).
- **liabilities.mortgageDetails** (rate, fix, pay) → Detail pod pasivy („Hypotéka – detail: Úrok X %, Fixace Y let, Splátka Z Kč/měs.“).
- **liabilities.loansList** → Řádky tabulky „Úvěry – detail“ (typ, zůstatek, úrok, splátka).
- **liabilities.otherDesc** → Text „Ostatní závazky“.
- **newCreditWishList** → Celá sekce „Úvěry / hypotéky k vyřízení“ (tabulka s typem, částkou, LTV/Ako, úrok, měsíčně, celkem). Každá položka = jeden řádek.

### 3.5 Krok „Cíle“ (goals)

- **goals** (name, type, years/horizon, amount, targetMonthlyIncome, targetAmount, initialAmount, lumpSumNow, useInflationFV, pensionDeduction, pensionAmount, **computed**) → Tabulka cílů (Cíl, Horizont, Cílová částka, Potřeba měsíčně); **computed.fvTarget** a **computed.pmt** jsou vypočtené. Blok „Finanční cíle & Pokrytí“ používá součet fvTarget a součet FV z investic. U cílů typu renta se může zobrazit vzorec FV a potřebný kapitál (odvozeno z amount, years, inflace 3 %, výnos 6 %).

### 3.6 Krok „Strategie“ (strategy + investments)

- **strategy.profile** (dynamic_plus / dynamic / balanced / conservative) → Název strategie a popis v „Doporučené portfolio“; vstup do **getGrowthChartData** a do výnosů (conservativeMode snižuje výnos).
- **strategy.conservativeMode** → Snižuje zobrazený výnos u investic a v projekci.
- **investments** (productKey, type, amount, years, annualRate, **computed.fv**) → Tabulka doporučeného portfolia; **Detail produktu** na každý produkt s amount > 0; projekce (getGrowthChartData) a alokace (getAllocationChartData). **computed.fv** je dopočtený (investmentFv).

### 3.7 Krok „Zajištění“ (insurance + incomeProtection)

- **insurance.riskJob** (low/medium/high) → Nepropisuje se přímo; ovlivňuje doporučené denní odškodné (150/300/500 Kč/den).
- **insurance.invalidity50Plus** → Nepropisuje se přímo; znamená 50% doporučení na invaliditu (pro 50+ nebo volba poradce).
- **incomeProtection.persons** → Sekce „Zajištění příjmů – navržené řešení“: pro každou osobu a každý plán řádek (jméno, role, pojišťovna, rizika, měsíční/roční, zdroj úhrady, poznámka). **Celková měsíční cena** = součet z plánů. **Optimalizace zajištění příjmů**: pokud má osoba funding.benefitOptimizationEnabled a firma platí, zobrazí se tabulka (firma platí, osobně doplácí, celkové pojistné, varianta A/B, úspora firmy, daňová úspora) a text **benefitVsSalaryComparison.explanation** (odvozený text z calculations – „Při firemním příspěvku X Kč/měs. firma ušetří …“).

Životní pojištění (doporučené částky) **nepoužívá** přímo `incomeProtection`; používá **computeInsurance(data)**. Ten bere: incomes.main, incomes.partner, expenses (totalExpense), assets (cash, investments), liabilities (součet), client.hasPartner, client.birthDate, children, cashflow.incomeType, insurance.riskJob, insurance.invalidity50Plus. Výstup (invalidity, sickness, tn, death, partnerInsurance, childInsurance) se zobrazuje v sekci Zajištění příjmů (tabulka + gridy).

### 3.8 Krok „Shrnutí“ / obecná data

- **notes** → Samostatná stránka „Poznámky k analýze“, pouze pokud jsou vyplněné.
- **clientId**, **householdId** → Do PDF **nepropisují** se (slouží pro ukládání do CRM, propojení s kontaktem).
- **includeCompany** → Rozhodne, zda se za osobní část přidá firemní blok (titulka firmy + PŘEHLED FIRMY).

### 3.9 Firemní vstupy (krok FIRMA, když includeCompany)

- **companyFinance** (revenue, profit, reserve, loanPayment) → KPI Přehled firmy (Roční tržby, Roční zisk, Cash runway z rezerva/(zisk−splátka), Dluhová služba).
- **companyRisks** (property, interruption, liability, director, fleet, cyber) → Tabulka „Pokrytí rizik: X/6“ a řádky Ano/Ne.
- **companyRiskDetails** (property/interruption/liability: limit, contractYears) → Detail pod tabulkou (limity, stáří smlouvy).
- **companyBenefits** (dps, dip, izp, amountPerPerson, employeeCount, directorsAmount, annualCost, statePensionTaxBenefit, statePensionTaxLimitAnnual, statePensionTaxRefundAnnual) → Sekce Benefity (DPS/DIP/IŽP, roční náklad, zaměstnanci, příspěvek na osobu, danové zvýhodnění).

---

## 4. Hodnoty odvozené (vypočtené), ne přímo zadané

- **Čisté jmění** = totalAssets − totalLiabilities (ze součtů aktiv a pasiv).
- **Měsíční bilance / Volná kapacita** = totalIncome − totalExpense.
- **Rezerva v měsících** = reserveCash / monthlyExp.
- **Interpretace** (kladné/záporné jmění, dostatečná rezerva) = pravidla z kódu podle hodnot výše.
- **Rychlá analýza majetku** = „Největší položka v majetku jsou X“ + varování na spotřebitelské úvěry.
- **Cíle: computed.fvTarget, computed.pmt** = z calculations (goalFvTarget, pmt podle typu cíle, inflace, výnos).
- **Pokrytí cílů** = součet FV investic vs. součet fvTarget; status „Pokryto“/„Chybí“, rozdíl, procento.
- **Renta vzorec** = FV = P×(1+0,03)^n, potřebný kapitál = (FV×12)/0,06; P a FV z goal.amount a goal.years.
- **Investment FV** = investmentFv(amount, type, years, annualRate) (lump: FV; monthly: FV anuity).
- **Projekce portfolia** = getGrowthChartData (rok po roku součet FV všech investic s reálným výnosem/conservative).
- **Životní pojištění – všechny částky** = computeInsurance (invalidita: needMonthly, statePension, ownAssetRenta, capital; PN: DVZ, reducedDVZ, dailyBenefit, totalMonthly; TN: base, progress, max; smrt: liabilities, familyProtection, coverage; děti: invalidity, tn, dailyComp). Vstupy viz sekce 3.7.
- **Cash runway (firma)** = companyRunway(companyFinance) = reserve / (měsíční zisk − měsíční splátka).
- **Optimalizace (úspora firmy, daňová úspora)** = BenefitVsSalaryComparison z company-fa calculations (salaryVariantCompanyCost, benefitVariantCompanyCost, estimatedSavings, ownerTaxSavingsAnnual, explanation).

---

## 5. Co se do PDF nepropisuje (ale existuje ve wizardu)

- **client**: email, phone, birthNumber.
- **partner**: většina polí kromě jména (birthDate se použije pro věk v pojištění; do PDF textu se nepropisuje přímo).
- **children**: birthDate (pouze pro výpočet věku a doporučení pro děti); id, sports, birthNumber ne v PDF.
- **cashflow**: reserveTargetMonths, reserveGap, isReserveMet, incomeGross, partnerGross, partnerIncomeType.
- **assets**: investmentsList, pensionList, realEstateItems (pouze součty).
- **liabilities**: mortgageProvider, loansDetails, otherProvider (pouze otherDesc jako text).
- **CRM identifikátory**: clientId, householdId.
- **Provenance** (sdílený údaj z firmy) se v PDF zobrazuje jen jako textová značka u vybraných polí („sdílený údaj“ / „z firmy X“), ne jako samostatná sekce.

---

## 6. Branding a metadata v PDF

- **Datum vyhotovení** = den generování (new Date().toLocaleDateString('cs-CZ')).
- **Autor** a **footer** = z options.branding (authorName, footerLine) nebo fallback („Marek Marek“, „Marek Marek - Privátní finanční plánování | …“).
- **Logo** na titulce = options.branding.logoUrl; pokud chybí, placeholder (kruh s „M“).
- **Číslování stránek** = „Strana {{FOOTER_PAGE}}“, nahrazené po řadě 1, 2, 3, …

---

## 7. Shrnutí pro model (Sonnet)

- PDF je **deterministický výstup** z jednoho objektu **FinancialAnalysisData** a volitelných **BuildReportHTMLOptions** (branding, provenance).
- **Struktura** je pevná: titulka → Souhrn & bilance → Cíle a strategie → Detail produktů → Projekce → Zajištění příjmů (doporučení) → Navržené řešení → Optimalizace → Poznámky → (volitelně firemní titulka + Přehled firmy).
- **Každá hodnota v PDF** buď pochází přímo z pole v `data` (client.name, assets.cash, goals[].name, …), nebo je **vypočtená** (čisté jmění, bilance, computeInsurance, investmentFv, getGrowthChartData, goal computed, companyRunway, benefitVsSalaryComparison).
- **Inputy, které se nikde v PDF neobjeví**, jsou hlavně kontaktní údaje (email, telefon), detailní seznamy položek (investmentsList, realEstateItems), CRM ID a některé pomocné stavy wizardu (reserveGap, isReserveMet). Vše ostatní buď přímo vidíš v nějaké sekci, nebo je to vstup do odvozené hodnoty, která tam je.
