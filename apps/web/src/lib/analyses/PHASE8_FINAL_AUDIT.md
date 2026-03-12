# Fáze 8 – Finální audit: osobní FA, firemní FA, shared facts, výstupy

Tento dokument shrnuje stav modulu finančních analýz po Fázi 8 (finalizace, QA, parity audit, migrace dat a produkční dotažení). Neobsahuje nové funkce; pouze ověření, opravy odchylek a dokumentaci.

---

## 1. Shrnutí

| Oblast | Stav | Poznámka |
|--------|------|----------|
| Osobní FA (8 kroků) | Hotové | Kroky včetně Zajištění příjmů; výpočty, save/load, report. |
| Firemní FA (5 kroků) | Hotové | Firma, Jednatelé, Finance, Benefity a rizika, Výstup. |
| Zajištění příjmů | Hotové | Více osob, pojišťovny, rizika, fundingSource, benefit vs mzda, PDF. |
| Optimalizace jednatel/majitel | Hotové | BENEFIT_OPTIMIZATION v constants; computeBenefitVsSalaryComparison. |
| Shared facts | Hotové | Tabulka financial_shared_facts; sync rules; refresh/diff/apply; odpojení. |
| Snapshot / refresh / override | Hotové | Payload = snapshot; _provenance; clearFinancialAnalysisLink → overridden. |
| JSON import osobní | Hotové | mergeLoadedState včetně incomeProtection a _provenance; loadFromFile. |
| JSON import firemní | Hotové | executeCompanyFaImport + extractAndUpsertSharedFactsFromCompany. |
| Report personal_only / business_only / combined | Hotové | buildReportHTML, buildCompanyReportHTML, renderReportToHTML; provenance labels. |
| Export do dokumentů | Hotové | StepSummary: uploadDocument; setFinancialAnalysisLastExportedAt. |
| Konfigurovatelné sazby | Částečně | Sazby v constants (BENEFIT_OPTIMIZATION); rozšíření na tenant config možné později. |

**Částečně hotové:** Konfigurovatelné sazby jsou v kódu (constants), nikoli v UI nebo tenant nastavení.

**Nehotové:** E2E testy; více importních formátů; konfigurace sazeb v UI.

---

## 2. Parity audit – osobní FA

Referenční zdroje: `docs/archive/financni-analyza.html`, `apps/web/src/lib/analyses/financial/PHASE1_AUDIT.md`.

| Oblast | Stav | Soubory / poznámka |
|--------|------|--------------------|
| Kroky a pořadí | Shodné (rozšířeno) | 8 kroků: Klient, Cashflow, Majetek, Úvěry, Cíle, Strategie, **Zajištění příjmů**, Shrnutí. Původní HTML měl 7 kroků (Shrnutí bylo krok 7); v Aidvisoru je krok 7 Zajištění příjmů, krok 8 Shrnutí – záměrné rozšíření. |
| Pole a struktura dat | Shodné (rozšířeno) | types.ts, defaultState.ts: client, partner, children, cashflow, assets, liabilities, goals, strategy, insurance, **incomeProtection** (persons, plány, funding, benefitVsSalaryComparison). |
| Výpočty | Shodné | calculations.ts, selectors.ts: totalIncome/Expense, surplus, reserveTarget/Gap, totalAssets/Liabilities, netWorth, goal FV/PMT, strategyTotals, loansList*, **computeBenefitVsSalaryComparison**. |
| Save/load a import | Opraveno | saveLoad.ts: **incomeProtection** a **_provenance** se v mergeLoadedState načítají; exportToFile zahrnuje celý data (včetně _provenance). |
| Report a pojištění | Shodné (rozšířeno) | report.ts: buildReportHTML, computeInsurance, renderInsurancePage, **renderIncomeProtectionProposed** (grid + optimalizace), provenance labels; null-safe escapeHtml pro displayName/provider. |

---

## 3. Parity audit – firemní FA

Referenční zdroj: `apps/web/src/lib/analyses/company-fa/` (types, constants, store, calculations). Původní fa-sro HTML v repozitáři není; parita je vůči aktuálnímu company-fa modelu.

| Oblast | Stav | Soubory / poznámka |
|--------|------|--------------------|
| Kroky | Shodné | 5 kroků: Firma, Jednatelé, Finance, Benefity a rizika, Výstup. constants.ts, CompanyAnalysisLayout. |
| Pole | Shodné | company-fa/types.ts: company, directors, benefits, finance, risks. |
| Výpočty | Shodné | company-fa/calculations.ts. |
| Import | Shodné | importValidate.ts včetně legacy director → directors[]. |
| Report | Shodné | buildBusinessReportPayload → buildCompanyReportHTML; rawBlocks v renderReportToHTML. |

---

## 4. Import audit

**Osobní FA**

- Vstup: sessionStorage `financial_analysis_import` (page.tsx), loadFromFile z souboru (FinancialAnalysisToolbar), store.loadFromFile → saveLoad.importFromFile → mergeLoadedState.
- Ověřeno: merge do výchozího stavu včetně **incomeProtection** a **_provenance**. Pokud import neobsahuje incomeProtection, default zůstává (merge nepřepisuje prázdným). Pokud obsahuje _provenance, sloučí se.
- Opraveno: V saveLoad.ts doplněn merge `_provenance` z `p._provenance` do `data`.

**Firemní FA**

- Vstup: company-fa-import.ts (validateCompanyFaImport, getCompanyFaImportPreview, executeCompanyFaImport), importValidate (normalizeCompanyFaPayload, včetně legacy director).
- Ověřeno: Po executeCompanyFaImport se volá extractAndUpsertSharedFactsFromCompany(companyId, normalizedPayload, analysisId, "json_import"). Vytvoření firmy, company_person_links a analýzy; shared facts se zakládají.

---

## 5. Shared facts audit

- **Osobní FA:** PersonalFALinkBanner načítá getCompaniesForContact a getSharedFactsForContact; tlačítka „Načíst firemní data“ / „Aktualizovat“ (diff → apply), „Odpojit“. applyRefreshFromShared a clearFinancialAnalysisLink v financial-analyses.ts. Payload se ukládá včetně _provenance; po odpojení se bývalé linked přepíše na overridden.
- **Firemní FA:** saveCompanyAnalysisDraft volá extractAndUpsertSharedFactsFromCompany. CompanyFALinkedPersonsSection zobrazuje počet osob a osobní analýzy napojené na firmu (getPersonalAnalysesLinkedToCompany).
- **Combined report:** buildCombinedReportPayload přijímá provenance a linkedCompanyName; buildPersonalReportPayload je předává do buildReportHTML; v HTML se zobrazují štítky „sdílený údaj“. StepSummary předává reportOptions (provenance z data._provenance).

---

## 6. Report/PDF audit

| Režim | Stav | Poznámka |
|-------|------|----------|
| personal_only | Hotové | buildPersonalReportPayload → buildReportHTML → rawBlocks[0]; renderReportToHTML vrací první raw block. StepSummary předává reportOptions (provenance). Sekce: titulní strana, přehled, majetek/závazky, cashflow, cíle/strategie, pojištění, zajištění příjmů – navržené řešení a optimalizace. |
| business_only | Hotové | buildBusinessReportPayload → buildCompanyReportHTML; renderReportToHTML obalí do `<div class="pdf">`. |
| combined | Hotové | buildCombinedReportPayload; renderReportToHTML skládá titulní stránku, personal bloky, sharedSections.links, business bloky. sharedSections.links.summary se zobrazuje. |

Export do dokumentů: StepSummary volá uploadDocument(contactId, formData, { tags: ['financial-report'] }) a setFinancialAnalysisLastExportedAt(analysisId). _provenance je součástí payloadu a exportovaného JSONu; není stripován při běžném ukládání.

---

## 7. Zajištění příjmů a optimalizace

- **Modelace:** incomeProtection.persons; každá osoba má insurancePlans (pojišťovna, rizika, monthlyPremium/annualContribution, fundingSource: company | personal | osvc). PersonProtectionFunding: companyContributionMonthly, benefitVsSalaryComparison.
- **Optimalizace:** Pro role director/owner/partner_company nebo při benefitOptimizationEnabled: sekce „Optimalizace příspěvku“, Varianta A (navýšení mzdy) vs Varianta B (benefit), úspora firmy, daňová úspora majitelů. computeBenefitVsSalaryComparison používá BENEFIT_OPTIMIZATION z constants.
- **Výstup v PDF:** renderIncomeProtectionProposed: tabulka navrženého řešení (osoba, role, pojišťovna, rizika, cena, zdroj úhrady); sekce „Optimalizace zajištění příjmů“ s firmou platí / osobně doplácí a srovnáním variant.

---

## 8. Cleanup

- **saveLoad.ts:** Doplněn merge _provenance (viz Import audit).
- **report.ts:** Defenzivní null handling pro person.displayName a plan.provider v renderIncomeProtectionProposed (?? '').
- **constants.ts:** Upřesněn komentář u BENEFIT_OPTIMIZATION (možnost tenant config v budoucnu).
- **TODO/FIXME:** V apps/web/src/lib/analyses nebyl nalezen žádný TODO/FIXME; žádné další odstranění.
- **Legacy:** Podpora legacy director v importValidate.ts ponechána záměrně pro staré firemní JSONy.

---

## 9. Konfigurovatelné sazby

- **Kde:** `apps/web/src/lib/analyses/financial/constants.ts` – BENEFIT_OPTIMIZATION (netFromGrossFactor, deductionsPercent, employerCostFactor, ownerTaxSavingsPercent).
- **Použití:** calculations.ts – computeBenefitVsSalaryComparison(options?) čte sazby z BENEFIT_OPTIMIZATION, volající může předat options a přepsat.
- **Stav:** Sazby nejsou natvrdo v business logice; jsou v jednom místě (constants). Rozšíření na tenant config nebo UI pro správu sazeb je možné bez změny vzorců.

---

## 10. Známé problémy a rizika

- **Manuální testování:** Životní cyklus (vytvoření, uložení, znovu otevření, import, refresh, export) a edge cases (prázdná analýza, neúplná data) nejsou pokryty automatizovanými E2E testy; doporučuje se manuální checklist před ostrým nasazením.
- **Původní firemní HTML:** Referenční fa-sro HTML není v repozitáři; parity firemní FA je vůči aktuálnímu company-fa modelu, ne vůči staré HTML verzi.
- **Multi-tenant sazby:** BENEFIT_OPTIMIZATION je globální; pro různé tenanty různé sazby bude potřeba rozšíření (tenant config nebo DB).

---

## 11. Doporučení pro další iteraci

- Přidat E2E testy pro kritické flow: nová osobní FA → uložení → znovu otevření; import osobního JSONu; import firemního JSONu → shared facts; refresh z firemních dat v osobní FA.
- Možnost měnit BENEFIT_OPTIMIZATION sazby v UI (např. v nastavení kroku Zajištění příjmů nebo v globálním nastavení).
- Rozšíření combined reportu o explicitní sekci „Příjmy a závazky z propojené firmy“ s tabulkou (dnes jen sharedSections.links.summary).
- Ověření na reálných historických JSONech od uživatelů (osobní i firemní) a případná úprava normalizace nebo mapování.

---

## Acceptance criteria Fáze 8 (kontrolní seznam)

- [x] Osobní FA funguje end-to-end (včetně Zajištění příjmů a optimalizace).
- [x] Firemní FA funguje end-to-end.
- [x] Staré JSONy (osobní i firemní) jde importovat a dál upravovat; firemní import zakládá shared facts.
- [x] Shared facts, snapshot, refresh a override jsou ověřené a zdokumentované.
- [x] personal_only, business_only a combined report fungují; PDF je stabilní; export do dokumentů funguje.
- [x] Existuje jasný finální audit (hotovo / nehotovo / rizika / doporučení) v tomto dokumentu.
