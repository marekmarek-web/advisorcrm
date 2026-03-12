# Fáze 5 – Migrace hlavních business kroků firemní FA

Tento dokument popisuje převod hlavní business logiky firemní FA (finance, benefity, rizika, pojištění jednatele, investice) do React komponent s plnou výpočetní logikou podle PHASE1_AUDIT a původního HTML. Vše zůstává kompatibilní s JSON importem, Aidvisora store a Supabase persistence a s normalizovanou output/report vrstvou.

**Vstupní dokumenty:** [PHASE1_AUDIT.md](./PHASE1_AUDIT.md), [PHASE4_STEPS_AND_OUTPUT.md](./PHASE4_STEPS_AND_OUTPUT.md).

---

## 1. Přehled převedených kroků

| Krok | Komponenta | Obsah |
|------|------------|--------|
| 3 | **StepCompanyFinance** | Tržby, zisk/EBITDA, rezerva, měsíční splátka úvěrů. KPI: měsíční náklady, **dluhová služba/rok**, runway, inflační varování (3,5 %). |
| 4 | **StepCompanyBenefitsRisks** | Benefity (DPS/DIP/IŽP, amount, count, directorsAmount), **odvozené hodnoty** (roční náklad, úspora, daňová úspora majitelů, převod ze svého). Pojištění firmy (6 rizik: property, interruption, liability s limit/contractYears; director, fleet, cyber). **Risk score (X/6)** a **gaps** (Chybí: Majetek, Odpovědnost, D&O). **Tip na audit** (smlouvy starší 3 let, nízké limity). Pojištění jednatele (smrt, invalidita, PN, stupeň invalidity, státní důchod) + **doporučené zajištění**, **gap invalidita**, **varování OSVČ**. Strategie (profil, konzervativní režim). Investice (tabulka s **FV**), **celkové FV / jednorázově / měsíčně**. |

---

## 2. Výpočty (calculations.ts)

Všechny vzorce odpovídají PHASE1_AUDIT oddílu 3 a původnímu HTML (`updateStep2`, `updateBenefitCalc`, `updateRiskScore`, `getRiskAuditTips`, `calculateInsuranceGap`, `updateInsuranceRec`, `recalcStrategy`).

- **step2Kpi** – rozšířeno o `yearlyLoanService` (loanPayment × 12).
- **benefitCalc(payload)** – yearlyCost, grossEquiv, employerCost, netForEmployee, savings, directorsYearly, taxSavingsOwners, totalFromOwn, totalTransferSavings (převod ze svého → úspora firmy a jednatele).
- **riskScore(payload)** – covered (0–6), gaps (pole názvů chybějících: Majetek, Odpovědnost, D&O).
- **getRiskAuditTips(payload)** – smlouvy starší 3 let; nízké limity odpovědnosti (limit &lt; revenue).
- **calculateInsuranceGap(payload)** – neededCapital (6 % renty), gap (rozdíl oproti aktuální invaliditě), recommended; stupeň invalidity 1 = 25 % needed.
- **directorInsuranceRec(payload)** – recDeath (yearly×5), recInv (z calculateInsuranceGap), recSickPerDay (income×0.6/30), belowDeath/belowInv/belowSick, isOsvc.
- **calcFVLump**, **calcFVReg** – budoucí hodnota jednorázová / pravidelná (měsíční).
- **recalcStrategy(payload)** – pro každou investici vypočte `computed.fv` (s konzervativním režimem −2 %), vrací investments s FV a totalFV, totalLump, totalMonthly.

---

## 3. Finance firmy

- **StepCompanyFinance** – vstupy: revenue, profit, reserve, loanPayment. KPI z `step2Kpi`: monthlyExp, **yearlyLoanService** (zobrazeno jako „Dluhová služba (rok)“), runway, inflationLoss (varování pokud &gt; 1000 Kč).
- Firemní závazky zůstávají jako jeden souhrn **měsíční splátky** (loanPayment); v HTML ani v typu není rozpad na více úvěrů ani provider. Data se ukládají do payload.finance a propisují do reportu (buildCompanyReportHTML).

---

## 4. Benefity

- **StepCompanyBenefitsRisks** – sekce Benefity: checkboxy DPS/DIP/IŽP, amount (příspěvek na osobu/měs), count (počet zaměstnanců), directorsAmount (jednatelé celkem/měs).
- Pod sekcí: **odvozené hodnoty** z `benefitCalc`: roční náklad (benefity zaměstnancům), úspora oproti mzdě, roční náklad jednatelé, daňová úspora majitelů (21 %), při totalFromOwn &gt; 0 převod ze svého a celková úspora.
- Ukládání přes `setBenefits`; data jdou do payload.benefits a do output vrstvy (business_only / combined). Report zatím neobsahuje samostatnou benefitní tabulku; KPI a přehled jsou v krocích.

---

## 5. Rizika

- **Pojištění firmy** – 6 rizik: property, interruption, liability (objekt has/limit/contractYears), director, fleet, cyber (boolean).
- **Risk score** – zobrazení „Pokrytí rizik: X/6“ a text „Chybí: …“ nebo „Všechna rizika pokryta“ z `riskScore(payload)`.
- **Tip na audit** – z `getRiskAuditTips`: smlouvy starší 3 let, nízké limity odpovědnosti; zobrazeno v kroku i v PDF (buildCompanyReportHTML).

---

## 6. Pojištění jednatele

- Vstupy: death, invalidity, sick, invalidityDegree (1–3), statePensionMonthly.
- **Doporučené zajištění** z `directorInsuranceRec`: recDeath, recInv, recSickPerDay; zobrazení gapi invalidity a varování OSVČ (incomeType === 'osvc').
- V reportu: aktuální hodnoty + doporučené, gap invalidita, OSVČ poznámka.

---

## 7. Investice a strategie

- **Strategie** – profil (conservative/balanced/dynamic), conservativeMode (sníží výnos o 2 % u FV).
- **Investice** – tabulka podle payload.investments; pro zobrazení se volá **recalcStrategy(payload)** a zobrazují se `investmentsWithFv` včetně **FV** u každého řádku a souhrn **jednorázově celkem**, **měsíčně celkem**, **očekávaná FV celkem**.
- FV se v reportu počítá vždy z aktuálních dat (buildCompanyReportHTML volá recalcStrategy), takže export má vždy správné FV bez nutnosti ukládat computed do DB.

---

## 8. Kompatibilita s JSON importem a output vrstvou

- **Import** – normalized payload z importValidate obsahuje benefits, risks, directorIns, strategy, investments. Po načtení do store všechny nové výpočty (benefitCalc, riskScore, getRiskAuditTips, directorInsuranceRec, recalcStrategy) běží nad tímto payloadem; žádná další transformace není potřeba.
- **Persistence** – saveCompanyAnalysisDraft ukládá celý payload včetně benefits, risks, directorIns, strategy, investments. Computed FV se při ukládání neukládá (report ho dopočítá).
- **Output** – buildBusinessReportPayload → buildCompanyReportHTML používá stejné calculations (step1Kpi, step2Kpi, getRiskAuditTips, directorInsuranceRec, recalcStrategy). business_only i combined výstupy tedy obsahují správné KPI, risk matrix, audit tipy, doporučení jednatele a investiční tabulku s FV.

---

## 9. Co zbývá do finální fáze firemní FA

- **Krok Výstup (StepCompanyOutput)** – rozšíření o verdict/semafor (skóre spolupráce 5 kritérií), orientační hodnota firmy (profit×5), TOP 3 příležitosti/rizika, rychlé doporučení, další kroky do 30 dní (actions). Částečně připraveno v PHASE1_AUDIT (updateStep4); logika může být přidána do calculations a do StepCompanyOutput.
- **Rozšíření reportu** – např. benefitní souhrn v PDF, detail produktů (PDF_FUNDS), plná stránka zajištění příjmů podle HTML.
- **Vazby na osobní FA** – shared facts (příjem z firmy, ručení, podíl) a volba „kombinovaný výstup“ v UI s propojením klient–firma.

---

## 10. Shrnutí

- Hlavní business kroky firemní FA (finance, benefity, rizika, pojištění jednatele, investice) běží jako React komponenty s plnou logikou z HTML.
- Výpočty jsou v `company-fa/calculations.ts` (benefitCalc, riskScore, getRiskAuditTips, calculateInsuranceGap, directorInsuranceRec, recalcStrategy).
- Kroky fungují s importovanými JSONy a ukládáním do Supabase.
- Data se správně propisují do output vrstvy (buildCompanyReportHTML s audit tipy, doporučení jednatele, FV z recalcStrategy).
- Architektura zůstává kompatibilní s business_only i combined výstupem.
