# Fáze 1 – Audit firemní finanční analýzy (FA s.r.o. hlavní.html)

Dokument mapuje obsah `FA s.r.o. hlavní.html` na kroky, datový model, výpočty, report/PDF, save/load, seznamy produktů, vazby na klienta/firmu a přípravu na Aidvisora + Supabase. Cíl: oddělit business logiku od DOM/UI a připravit migraci bez změny chování.

**Zdroj:** [FA s.r.o. hlavní.html](../../FA%20s.r.o.%20hlavní.html) (~1880 řádků, třída `App` v inline `<script>`).

**Referenční vzor:** Osobní FA v [apps/web/src/lib/analyses/financial/](../../apps/web/src/lib/analyses/financial/) (types, defaultState, calculations, report, store, saveLoad).

---

## 1. Mapa kroků a sekcí

Firemní analýza má **4 kroky** (stepper + `step-content`, ř. cca 178–586).

| Krok | ID      | Název                 | Obsah |
|------|---------|------------------------|--------|
| 1    | step-1  | **Firma**             | Společnost: název, IČO, obor (select), počet zaměstnanců, 3. kategorie, průměrná hrubá mzda, závislost TOP klient (%). Jednatelé: dynamický seznam (přidat/odebrat), každý s jménem, věkem, podílem %, manžel/ka, děti, typ příjmu (zaměstnanec/OSVČ), čistý měsíční příjem, osobní rezervy, hlavní cíl (bezpečí/renta/daňová optimalizace), benefity (DPS/DIP/IŽP, částka), platí ze svého, staré penzijní. KPI: zaměstnanci, mzdový fond/měs, 3. kat., rizikovost. |
| 2    | step-2  | **Finance**           | Výnosy a zisk: roční tržby, roční zisk/EBITDA. Rezervy a závazky: hotovostní rezerva, měsíční splátka úvěrů/leasingů. Inflační varování (3,5 % z rezervy). KPI: tržby, zisk, cash runway (měs.), dluhová služba/rok. |
| 3    | step-3  | **Benefity & Rizika** | **Záložky:** (1) Benefity – DPS/DIP/IŽP, příspěvek na osobu/měs a počet zaměstnanců, roční náklad; příspěvky jednatelům měsíčně; kalkulačka mzda vs benefit (gross, odvody, náklad firmy, čisté); úspora zaměstnanci, daňová úspora majitelů; převod na firmu (paysFromOwn). (2) Pojištění firmy – 6 rizik (Majetek, Přerušení, Odpovědnost, D&O, Flotila, Kyber), u prvních tří limit a stáří smlouvy; skóre rizik 0/6, gaps. (3) Pojištění jednatele – smrt, invalidita, stupeň invalidity, státní invalidní důchod, PN/den; doporučené zajištění (6 % renty), OSVČ varování. (4) Investice – profil (dynamický/vyvážený/konzervativní), konzervativní režim; jednorázové (AlgoImperial, CREIF, PENTA, ATRIS), pravidelné (iShares, Fidelity 2040), penzijní (Conseq); FV a souhrn. |
| 4    | step-4  | **Výstup**            | Celkové hodnocení (verdict + semafor). Orientační hodnota firmy (profit×5). TOP 3 příležitosti (benefity úspora, investice volného CF, daňová optimalizace). TOP 3 rizika (klíčová osoba, odpovědnost/D&O, koncentrace klientů). Rychlé doporučení. Tip na audit (staré smlouvy, nízké limity). Další kroky do 30 dní (3 položky). Skóre spolupráce (5 kritérií + celkové skóre). Tlačítko „Stáhnout PDF“. |

**DOM / rendering:** přepínání v `updateView()` (ř. 1053–1068): třídy `stepper-item` active/completed, `step-content.active`, tlačítka Další/Zpět, na posledním kroku text „Generovat PDF“.

---

## 2. Datový model (přesné pole a typy)

Stav je v `this.data` (ř. 749–786). Žádné TypeScript typy v HTML – níže je kanonický tvar pro budoucí `types.ts`.

### 2.1 company

| Pole        | Typ     | Význam |
|-------------|---------|--------|
| name        | string  | Název společnosti |
| ico         | string  | IČO |
| industry    | string  | `office` \| `services` \| `light-manufacturing` \| `heavy-manufacturing` \| `construction` \| `transport` |
| employees   | number  | Počet zaměstnanců |
| cat3        | number  | Počet 3. kategorie |
| avgWage     | number  | Průměrná hrubá mzda (Kč) |
| topClient   | number  | Závislost na TOP klientu (%) |

### 2.2 directors[] (jednatelé)

Každý prvek:

| Pole               | Typ    | Význam |
|--------------------|--------|--------|
| name               | string | Jméno |
| age                | number \| null | Věk |
| share              | number | Podíl % (výchozí 100) |
| hasSpouse          | boolean | Manžel/ka |
| childrenCount      | number | Počet dětí |
| incomeType         | string | `employee` \| `osvc` |
| netIncome          | number | Čistý měsíční příjem (Kč) |
| savings            | number | 0 \| 500000 \| 2000000 (pásmo rezerv) |
| goal               | string | `security` \| `rent` \| `tax` |
| benefits           | object | viz níže |
| paysFromOwn        | boolean | Platí si životní/penzijní ze svého |
| paysFromOwnAmount  | number | Měsíční částka (Kč) při paysFromOwn |
| hasOldPension      | boolean | Staré penzijní připojištění |

**benefits** (u každého directora):

| Pole          | Typ    |
|---------------|--------|
| dps           | boolean |
| dip           | boolean |
| izp           | boolean |
| amountMonthly | number  |

### 2.3 finance

| Pole        | Typ    | Význam |
|-------------|--------|--------|
| revenue     | number | Roční tržby (Kč) |
| profit      | number | Roční zisk / EBITDA (Kč) |
| reserve     | number | Hotovostní rezerva (Kč) |
| loanPayment | number | Měsíční splátka úvěrů/leasingů (Kč) |

### 2.4 benefits (firemní benefity)

| Pole             | Typ    |
|------------------|--------|
| dps              | boolean |
| dip              | boolean |
| izp              | boolean |
| amount           | number  | Příspěvek na osobu/měs (zaměstnanci) |
| count            | number  | Kolika zaměstnancům |
| directorsAmount  | number  | Celkem měsíčně jednatelům (Kč) |

### 2.5 risks (firemní pojištění)

- **property, interruption, liability:** objekt `{ has: boolean, limit: number, contractYears: number }`.
- **director, fleet, cyber:** boolean.

### 2.6 directorIns (pojištění jednatele)

| Pole                | Typ   | Význam |
|---------------------|-------|--------|
| death               | number | Pojistná částka – smrt (Kč) |
| invalidity         | number | Pojistná částka – invalidita (Kč) |
| sick                | number | Denní odškodné PN (Kč/den) |
| invalidityDegree   | number | 1 \| 2 \| 3 (pro výpočet: 1 = 25 % doplněk) |
| statePensionMonthly | number | Odhad státního invalidního důchodu (Kč/měs) |

### 2.7 investment (legacy, používáno v reportu)

| Pole               | Typ   |
|--------------------|-------|
| goal               | string |
| targetAmount       | number |
| targetRentaMonthly | number |
| horizonYears       | number |
| currentAssets      | number |
| strategy           | string |

### 2.8 strategy

| Pole             | Typ    |
|------------------|--------|
| profile          | string | `conservative` \| `balanced` \| `dynamic` |
| conservativeMode | boolean |

### 2.9 investments[] (portfolio)

Každý prvek:

| Pole        | Typ    | Význam |
|-------------|--------|--------|
| productKey  | string | imperial \| creif \| atris \| penta \| ishares \| fidelity2040 \| conseq |
| type        | string | `lump` \| `monthly` \| `pension` |
| amount      | number | Částka (Kč nebo Kč/měs) |
| years       | number | Horizont (roky) |
| annualRate  | number | Roční výnos (např. 0.12) |
| computed    | { fv: number } | Vypočtená FV |

Mapování na kategorie pro Fázi 2: **company profile**, **linked persons**, **company income/costs**, **liabilities**, **business risks**, **benefits**, **protection**, **recommendations**, **report payload**.

---

## 3. Výpočty a pravidla (pro calculations modul)

Vše musí zůstat 1:1 při extrakci.

| Oblast              | Metoda v HTML     | Vzorec / pravidlo |
|---------------------|-------------------|-------------------|
| Krok 1 – KPI        | updateStep1       | wage fund = employees × avgWage. Rizikovost: industry → office/services = Nízká, light-manufacturing = Střední, heavy-manufacturing/construction/transport = Vysoká. |
| Krok 2 – finance    | updateStep2       | monthlyExp = employees×avgWage×1.34 + loanPayment. runway = floor(reserve / monthlyExp). inflation loss = reserve × 0.035 (zobrazit varování pokud > 1000 Kč). |
| Benefity            | updateBenefitCalc | yearlyCost = amount×count×12. grossEquiv = amount/0.67. employerCost = grossEquiv×1.338. netForEmployee = grossEquiv×0.67. savings = (employerCost−amount)×count×12. Daňová úspora majitelů = directorsAmount×12×0.21. Transfer na firmu: totalFromOwn = sum directors (paysFromOwn ? paysFromOwnAmount : 0); yearlyFromOwn = totalFromOwn×12; companySavings = yearlyFromOwn×0.19; directorSavings = (grossEquiv×1.338−totalFromOwn)×12×0.15; totalTransferSavings = companySavings + directorSavings. |
| Rizika – skóre      | updateRiskScore   | covered = počet true z [property.has, interruption.has, liability.has, director, fleet, cyber]. gaps: text „Chybí: Majetek, Odpovědnost, D&O“ podle chybějících. |
| Rizika – audit tip  | getRiskAuditTips  | Smlouvy starší 3 let (contractYears > 3). Nízké limity: liability.has a limit > 0 a revenue > 0 a limit < revenue. |
| Pojištění jednatele | calculateInsuranceGap | statePension = statePensionMonthly > 0 ? statePensionMonthly : income×0.5. requiredMonthly = income. neededCapital = (requiredMonthly−statePension)/0.005. degree 1 → neededCapital×0.25. gap = max(0, neededCapital−current invalidity). |
| Pojištění – doporučení | updateInsuranceRec | recDeath = yearly×5. recSickPerDay = round(income×0.6/30). recInv = z calculateInsuranceGap. Input „below recommended“ pokud death < recDeath nebo invalidity < recInv nebo sick < recSickPerDay. |
| Investice – FV      | recalcStrategy    | calcFVLump(amount, years, rate) = amount × (1+rate)^years. calcFVReg(monthly, years, rate): r = rate/12, n = years×12; pokud r=0 pak monthly×n; jinak monthly×((1+r)^n−1)/r. conservative: rate = max(0, annualRate − 0.02). Sum totalLump, totalMonthly, totalFV. |
| Výstup – valuation  | updateStep4       | valuation = profit × 5. |
| Výstup – příležitosti | updateStep4     | benefitSavings = amount×employees×12×0.34. freeMonthly = max(0, profit/12 − loanPayment). |
| Výstup – skóre     | updateStep4       | employees≥5, cat3>0, insurance = !liabHas \|\| !director, cash = reserve>0, family = nějaký director má hasSpouse nebo childrenCount>0. totalScore = počet true. Verdict: 4+ = zelený, 2–3 = žlutý, jinak červený. |
| Výstup – actions   | updateStep4       | Seznam: pokud !director → „Sjednat D&O…“; pokud !liabHas → „Prověřit pojištění odpovědnosti“; pokud employees≥5 → „Připravit návrh benefitního programu“; pokud cat3>0 → „Zkontrolovat pojištění 3. kategorie“; pokud firstDir.netIncome>0 → „Navrhnout životní pojištění jednatele“. První 3 do action-1, action-2, action-3. |
| Výstup – quick win  | updateStep4       | employees≥5 → text o benefitním programu a úspoře; jinak text o pojištění odpovědnosti a D&O. |

Konstanty: 1.34 (náklad mzdy), 0.035 (inflace), 0.67 (čistá/z hrubé), 1.338 (odvody), 0.21 a 0.15 a 0.19 (daňové úspory), 0.005 (6 % renty pro invaliditu), 5× roční příjem (smrt).

---

## 4. Report / PDF vrstva

- **Entry:** `generatePDF()` (ř. 1642–1649): `ensureLogosLoaded()`, `root.innerHTML = buildPDFHTML()`, `applyLogoDataUrls(root)`, `setTimeout(…, 500)` → `window.print()`.
- **buildPDFHTML()** (ř. 1651–1862): vrací jeden velký HTML string pro `#report-root`. Používá třídy `.pdf`, `.pdf-page`, `.pdf-section`, `.pdf .h2`, `.table`, `.kpi`, `.risk-matrix`, `.insurance-item`, `.total-summary-bar`, atd.

**Sekce PDF:**

1. **Titulní stránka** – logo, „FINANČNÍ PLÁNOVÁNÍ“, společnost (companyName), jednatel (directorName), datum (today).
2. **Přehled situace** – KPI (zaměstnanci, mzdový fond, tržby, zisk, rezerva+runway, dluhová služba, 3. kat., TOP klient). TOP 3 příležitosti (tabulka). Rychlé doporučení (text). Doporučení – souhrn (tabulka: daňová úspora benefitů, chybějící krytí invalidity, potřebná investice měsíčně).
3. **Firemní pojištění** – analýza rizik (skóre X/6), risk matrix 6 položek (covered/not-covered). Tip na audit (pokud getRiskAuditTips.length>0). Pojištění jednatele – doporučené vs aktuálně nastaveno (smrt, invalidita, PN). Varování OSVČ.
4. **Cíle a strategie** – doporučené portfolio: tabulka produktů (Produkt, Typ, Vklad, Výnos, FV), total lump, total monthly, total FV. Strategie label (Konzervativní/Vyvážená/Dynamická).
5. **Detail produktu** – jedna stránka na každý vybraný fond (z PDF_FUNDS) s amount>0: název, badge, investice, description, risk/horizon/liquidity, strategie, výhody, parametry, očekávaná FV.
6. **Zajištění příjmů** – životní pojištění jednatele: příjem, OSVČ badge; tabulka (invalidita 2.–3., TN, PN, smrt); bloky Invalidita, PN, TN, Smrt; u OSVČ dodatek o nemocenské.

**Zdroj dat pro report:** wageFund, runway, directorIncome, yearlyIncome, isOsvc, benefitSavings, risksCount, auditTips (getRiskAuditTips), invGap (calculateInsuranceGap), taxSavings a fromOwn pro souhrn, strategy.profile, investments s computed.fv, PDF_FUNDS metadata. **riskItems** (6 položek key/name/icon). **PDF_FUNDS** (ř. 1795–1803): key, name, badge, badgeColor, risk, goal, horizon, minInvest, currency, liquidity, description, strategy, benefits[], representation, morningstar, zlataKoruna. Zajištění stránka: invNeed = directorIncome×1.2, statePension, invCapital (zaokrouhleno), pnDaily, deathCov = yearlyIncome×5, tnBase podle příjmu (100k+ → 3M, 50k+ → 2M, jinak 1M).

Čistá vrstva: funkce typu `buildCompanyReportHTML(data, options?)` vrací HTML string; příprava všech odvozených hodnot bez DOM. V UI zůstávají: ensureLogosLoaded, applyLogoDataUrls, volání print.

---

## 5. Save / load a migrace

- **exportData()** (ř. 1570–1576): `JSON.stringify(this.data, null, 2)`, Blob, download filename `fp-{company.name || 'klient'}-{YYYY-MM-DD}.json`.
- **importData(e)** (ř. 1578–1594): FileReader → JSON.parse → `migrateImportedData(raw)` → `sessionStorage.setItem('fp_import_data', JSON.stringify(migrated))` → `location.reload()`. Při init (ř. 793–799) pokud `fp_import_data` v sessionStorage, parse a `this.data = migrateImportedData(parsed)`, pak removeItem a pokračovat.
- **migrateImportedData(raw)** (ř. 1596–1635):
  - Pokud existuje `director` a ne `directors`: převést na jeden prvek v `directors[]` (name, age z birthYear, share, hasFamily→hasSpouse, incomeType, netIncome, savings, goal; benefits prázdné, paysFromOwn false, hasOldPension false).
  - Doplnit `investment`, `strategy`, `investments` (7 položek), `directorIns` (včetně invalidityDegree, statePensionMonthly), `directors` (array), `risks` (plný tvar).
  - risks: property/interruption/liability musí být objekt { has, limit, contractYears }; pokud jsou boolean, převést na objekt s limit 0, contractYears 0. director, fleet, cyber default false.

Pro Fázi 2: payload = normalizovaný objekt (migrateImportedData bez side-effectů); ukládat do DB, ne do JSON/local storage jako finální cíl.

---

## 6. Seznamy konstant a produktů

- **Obor (industry):** office (Kancelář/IT), services (Služby), light-manufacturing (Lehká výroba), heavy-manufacturing (Těžká výroba), construction (Stavebnictví), transport (Doprava).
- **Benefity – typy:** DPS (Penzijní připojištění), DIP (Dlouhodobé investice), IŽP (Životní pojištění).
- **Rizika (firemní pojištění):** property (Majetek), interruption (Přerušení provozu), liability (Odpovědnost), director (D&O), fleet (Flotila), cyber (Kyber). První tři mají detail: limit (Kč), contractYears.
- **Investiční profil:** dynamic 9 %, balanced 7 %, conservative 5 % (INV_STRATEGY_RATES). conservativeMode sníží rate o 2 %.
- **Fondy (investments):** productKey + type + default annualRate: imperial lump 12 %, creif lump 6 %, atris lump 6 %, penta lump 9 % (volba 10 %), ishares monthly 12 %, fidelity2040 monthly 7 %, conseq pension 9,5 %. getProductName(key) → zobrazený název (AlgoImperial, CREIF, ATRIS, PENTA, iShares MSCI World, Fidelity Target 2040, Conseq Globální).
- **PDF_FUNDS** (ř. 1795–1803): pro každý fond key, name, badge, badgeColor, risk, goal, horizon, minInvest, currency, liquidity, description, strategy, benefits[], representation, morningstar, zlataKoruna.
- **FUND_LOGOS:** AlgoImperial, Creif, ATRIS, Fidelity, iShares, PENTA, Conseq (pro data URL v PDF, getAssetUrl('/images/'+key+'.png')).

Tyto seznamy mají být v modulu konstant (např. companyFaConstants.ts, companyFaFunds.ts) bez změny hodnot oproti HTML.

---

## 7. Vazby na klienta / firmu / osoby a mapování na osobní FA

- **Firma:** v HTML pouze company.name, company.ico v payloadu; žádná entita „firma“ v DB. Pro Aidvisora: tabulka companies (id, tenantId, ico, name, industry, …).
- **Osoby:** directors = jednatelé; v HTML bez contactId. Pro Aidvisora: company_persons (companyId, contactId, role: jednatel|majitel|…).
- **Osobní FA:** v HTML žádné volání ani sdílený stav. Níže je návrh pravidel pro Fázi 2.

**Shared facts – co se má propsat do osobní FA (např. při propojení kontaktu s firmou):**

- Příjem klienta z firmy: director.netIncome (pro jednatele spárovaného s kontaktem).
- Příjem partnera z firmy: pokud partner je v directors.
- Dividendy / podíly na zisku: odvozeno z finance.profit a director.share (ne přímo v HTML, z dat).
- Ručení za firemní úvěr: zatím jen finance.loanPayment; pro sync potřebný příznak „osobní ručení“ (v HTML není).
- Firemní závazky s osobním dopadem: loanPayment + případný příznak ručení.
- Vlastnický podíl: director.share.
- Benefity relevantní pro domácnost: directors[].benefits (dps, dip, izp, amountMonthly), directors[].paysFromOwnAmount.

**Co nepropsat automaticky:**

- Celý obrat (revenue).
- Všechny firemní náklady.
- Celý firemní majetek jako osobní majetek.
- Všechny firemní závazky jako osobní závazky (bez rozlišení ručení).

**Sync pravidla (Fáze 1 = zdokumentovat):** Které hodnoty mají být „linked“ (odkaz na firemní analýzu) a které „snapshot“ (zkopírované v čase pro report osobní FA) – rozhodnutí až ve Fázi 2.

---

## 8. Rozpad na logické domény (bloky A–F)

| Blok | Obsah |
|------|--------|
| **A. Firma** | company (všechna pole), industry→risk mapa, KPI: wage fund, risk level. |
| **B. Osoby napojené na firmu** | directors[] (všechna pole včetně benefits, paysFromOwn). Vazba firma↔osoba zatím implicitní (pořadí); pro Supabase: company, person (contact), company_person_role. |
| **C. Finance firmy** | finance (revenue, profit, reserve, loanPayment). Odvozené: monthlyExp, runway, inflation loss, freeMonthly. |
| **D. Firemní závazky a financování** | loanPayment (jeden souhrn měsíční splátky). V HTML není rozpad na úvěry/leasingy ani ručení. |
| **E. Benefity a ochrana** | benefits (DPS/DIP/IŽP, amount, count, directorsAmount). risks (6 položek). directorIns. Doporučení jednatele (recDeath, recInv, recSick, gap, OSVČ). |
| **F. Výstup** | verdict, semafor, valuation, TOP 3 příležitosti/rizika, quick win, audit tip, actions (3), skóre spolupráce (5 kritérií), buildPDFHTML. |

Každý blok = odpovídající část datového modelu a výpočtů.

---

## 9. Čistá logika vs DOM (tabulka)

| Odpovědnost | Kde v HTML | Cíl modulu |
|-------------|------------|------------|
| Datový model (typy) | this.data struktura | types.ts |
| Výchozí stav, _defaultDirector | constructor, ensureInvestmentsAndStrategy | defaultState.ts |
| Všechny výpočty z oddílu 3 | updateStep1–4, updateBenefitCalc, updateRiskScore, getRiskAuditTips, calculateInsuranceGap, updateInsuranceRec, recalcStrategy | calculations.ts (nebo companyFaCalculations.ts) |
| Formátování | fmt, fmtShort | formatters.ts |
| getProductName | getProductName(key) | formatters.ts / constants |
| Konstanty a seznamy | INV_STRATEGY_RATES, INV_FUNDS, FUND_LOGOS, industry options, riskItems, PDF_FUNDS | constants.ts, companyFaFunds.ts |
| migrateImportedData | migrateImportedData(raw) | saveLoad.ts (normalizace bez side-effectů) |
| Sestavení HTML reportu | buildPDFHTML() obsah | report.ts – buildCompanyReportHTML(data) |
| init, bindNav, bindInputs, bindInvestmentInputs, bindDirectorDelegation, bindTabs | ř. 797–1110, 1040–1084 | Zůstává v HTML (později React) |
| updateView, updateStep1–4, renderDirectors, syncRiskDetails, syncBenefitAndRiskCheckboxes, populateFormFromData, updateStrategyUI, restoreInvestmentInputs | ř. 1053–1469, 1112–1239 | DOM – zůstává v HTML |
| toggleCard, onCheckboxChange | globální toggleCard, onCheckboxChange | DOM |
| ensureLogosLoaded, applyLogoDataUrls, generatePDF, window.print | ř. 898–1024, 1642–1649 | UI – zůstává v HTML |

Žádná změna výsledků výpočtů; čisté části pouze přesunout do funkcí přijímajících `data` a vracejících výsledky.

---

## 10. Návrh entit pro Aidvisora + Supabase (Fáze 2)

- **companies:** id (uuid), tenantId, ico, name, industry, employees?, cat3?, avgWage?, topClient?, createdAt, updatedAt. (Případně část z payloadu.)
- **company_persons:** id, companyId (FK companies), contactId (FK contacts), role (jednatel|majitel|společník|…), podíl?, createdAt, updatedAt.
- **Firemní analýzy:** buď rozšíření stávající tabulky `financial_analyses`: sloupec `type` = `'financial'` \| `'company'`, volitelný `companyId` (FK companies), `payload` = celý datový model z oddílu 2; nebo dedikovaná tabulka `company_financial_analyses` (id, tenantId, companyId?, contactId? hlavní jednatel, status, payload, createdBy, updatedBy, createdAt, updatedAt, lastExportedAt).
- **Verze:** stejný princip jako u osobní FA (jeden řádek = aktuální stav; volitelně analysis_versions pro historii).
- **Report exporty:** lastExportedAt, vazba na dokumenty (upload s tagem např. company-financial-report).

**Persistence Fáze 1:** neukládat finálně do JSON/local storage jako cíl; struktura payloadu a migrateImportedData připraveny pro zápis do `financial_analyses.payload` s `type: 'company'` nebo do dedikované tabulky.

**Propojení s osobní FA:** contact ↔ company přes company_persons. V osobní FA možnost „načíst fakta z firemní analýzy“ podle pravidel z oddílu 7 (shared facts).

---

## 11. Acceptance criteria (ověření)

- [x] Firemní HTML modul je zmapovaný po krocích a logických blocích (oddíl 1).
- [x] Existuje jasný rozpad business logiky vs DOM logiky (oddíl 9).
- [x] Je popsaný datový model – všechna pole a struktury (oddíl 2).
- [x] Jsou identifikované výpočty a derived values včetně konstant a vzorců (oddíl 3).
- [x] Je zmapovaná report/PDF vrstva – sekce, zdroje dat, PDF_FUNDS (oddíl 4).
- [x] Jsou zmapované seznamy bank/providerů/produktů/benefitů (oddíl 6).
- [x] Je zmapovaná vazba na klienta/firmu/osoby a shared facts s osobní FA (oddíl 7).
- [x] Je zmapované, co se má sdílet s osobní FA a co ne (oddíl 7).
- [x] Je připravený základ pro Fázi 2: Supabase datový model a persistence (oddíl 10).

---

## 12. Shrnutí

Fáze 1 je **audit a dokumentace**. Žádná migrace UI, žádná změna kódu v HTML ani v Reactu, žádné ukládání do JSON/DB. Výstup: tento dokument a připravenost datového modelu, výpočtů, reportu a migrace pro Fázi 2 (Supabase + případná extrakce čistých modulů bez změny chování).
