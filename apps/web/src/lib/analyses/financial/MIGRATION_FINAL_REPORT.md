# MASTER PROMPT – Závěrečný report migrace financni-analyza do Aidvisora CRM

Tento dokument je explicitní výstup migrace podle MASTER PROMPT: stav po blocích (Hotové / Částečně hotové / Nehotové), rizika, známé odchylky, doporučené další kroky a ověření acceptance criteria. Detailní technická dokumentace je v [PHASE1_AUDIT.md](./PHASE1_AUDIT.md), [PHASE7.md](./PHASE7.md) a [PHASE8.md](./PHASE8.md).

---

## Shrnutí

Migrace **financni-analyza.html** do Aidvisora CRM je **dokončena**. Původní HTML již není runtime (archiv v `docs/archive/financni-analyza.html`). Feature běží v React/Next na `/portal/analyses/financial`, persistence je v Aidvisora (tabulka `financial_analyses`, server actions), analýza je navázaná na klienta, domácnost a dokumenty. Parity vůči původní verzi byla ověřena a zdokumentována v PHASE8.

---

## Hotové

| Blok | Stav | Odkaz / poznámka |
|------|------|-------------------|
| **Wizard** | Hotové | 7 kroků (Klient, Cashflow, Majetek, Úvěry, Cíle, Strategie, Shrnutí). Stepper, next/prev, přechod mezi kroky (goToStep), zachování dat při přechodu. [FinancialAnalysisLayout](apps/web/src/app/portal/analyses/financial/components/FinancialAnalysisLayout.tsx), [FinancialAnalysisStepper](apps/web/src/app/portal/analyses/financial/components/FinancialAnalysisStepper.tsx). |
| **Calculations** | Hotové | Parity v PHASE8. [calculations.ts](./calculations.ts): totalIncome, totalExpense, surplus, reserveTarget/Gap, isReserveMet, totalAssetsFromValues, totalLiabilitiesFromValues, netWorth, monthlyPayment, totalRepayment, futureRentMonthly, capitalForRenta, goalFvTarget, pmtToReachFv, computeGoalComputed, investmentFv, strategyTotals, loansListBalanceSum, loansListPaymentsSum, ownResourcesFromLtv/FromAko. [selectors.ts](./selectors.ts) pro odvozené KPI. |
| **Store** | Hotové | Zustand store v [store.ts](./store.ts): data, currentStep, totalSteps, analysisId; hydrate, loadFromServerPayload, setAnalysisId, setLinkIds; všechny akce pro client, partner, children, cashflow, assets, liabilities, goals, credits, strategy, insurance. |
| **Save/load** | Hotové | localStorage draft (saveToStorage, loadFromStorage, clearStorage), JSON export/import (exportToFile, importFromFile), server draft (saveFinancialAnalysisDraft, getFinancialAnalysis, loadFromServerPayload). [saveLoad.ts](./saveLoad.ts), [financial-analyses.ts](apps/web/src/app/actions/financial-analyses.ts). |
| **CRM persistence** | Hotové | Tabulka [financial_analyses](packages/db/src/schema/financial-analyses.ts): id, tenantId, contactId, householdId, type, status, payload, createdBy, updatedBy, createdAt, updatedAt, lastExportedAt. Server actions: getFinancialAnalysis, getFinancialAnalysesForContact, getFinancialAnalysesForHousehold, saveFinancialAnalysisDraft, setFinancialAnalysisStatus, setFinancialAnalysisLastExportedAt. |
| **Report/PDF** | Hotové | [report.ts](./report.ts): buildReportHTML, computeInsurance. StepSummary: náhled reportu, window.print (PDF přes „Uložit jako PDF“), export do dokumentů. |
| **Charts** | Hotové | [charts.ts](./charts.ts): getGrowthChartData, getAllocationChartData, getGoalChartData. Vykreslení v StepSummary (růst, alokace) a StepGoals (graf cíle) přes Chart.js; cleanup při unmount. |
| **Client link** | Hotové | [ContactFinancialAnalysesSection](apps/web/src/app/dashboard/contacts/[id]/ContactFinancialAnalysesSection.tsx): seznam analýz pro kontakt, „Nová analýza“ → `?clientId=`, „Otevřít“ → `?id=`. contactId v payload a v tabulce financial_analyses. |
| **Household link** | Hotové | [HouseholdDetailView](apps/web/src/app/portal/households/[id]/HouseholdDetailView.tsx): blok Finanční analýzy, „Nová analýza“ → `?householdId=`, „Otevřít“ → `?id=`. householdId v payload a v tabulce. |
| **Document export** | Hotové | StepSummary: tlačítko „Uložit report do dokumentů“ (viditelné při data.clientId). uploadDocument(contactId, formData, { tags: ['financial-report'] }), po úspěchu setFinancialAnalysisLastExportedAt(analysisId). |
| **Responsive/mobile** | Hotové | Layout (px-3 sm:px-4, max-w-4xl/5xl, pb-20), stepper (hidden md:block pro názvy, min 44px tap targets), toolbar (min-h-[44px], flex-wrap), formuláře dotykově použitelné, report overlay scrollovatelný a s tlačítkem Zavřít. PHASE8 sekce 6. |
| **Cleanup legacy HTML** | Hotové | financni-analyza.html přesunut do docs/archive; public/financial-analysis-lib.js odstraněn; build:financial-lib odstraněn z package.json. Aplikace na původní HTML ani IIFE neodkazuje. |

---

## Částečně hotové

| Blok | Stav | Poznámka |
|------|------|----------|
| **Versioning** | Částečně | Jedna řádka v `financial_analyses` = jeden draft; při „Uložit do CRM“ se payload přepisuje (update stejného id). Sloupce createdAt, updatedAt, createdBy, updatedBy a status (draft/completed/exported/archived) existují; plná historie verzí (např. tabulka analysis_versions) není. Pro plné versioning lze doplnit až při budoucím požadavku. |

---

## Nehotové

| Položka | Poznámka |
|---------|----------|
| **E2E smoke test** | V repozitáři není automatizovaný E2E test (Playwright) pro flow wizardu. PHASE8 doporučuje manuální smoke: otevření `/portal/analyses/financial`, přechod krok 2 → zpět, uložení do souboru. |
| **Manuální QA** | Strukturovaný manuální průchod všech kroků a CRM flow před release je doporučen; checklist je v PHASE8. |

---

## Rizika

| Riziko | Popis |
|--------|--------|
| **db:push na velké DB** | Při spuštění `pnpm db:push` může fáze „Pulling schema from database“ trvat dlouho (minuty) na větší nebo vzdálené databázi; timeout v CI nebo při ručním spuštění může přerušit příkaz. Řešení: spouštět push z terminálu s dostatečným časem nebo použít migrace místo push. |
| **Chyby při načtení draftu** | Při neplatném nebo velmi starém payloadu z DB může mergeLoadedState vrátit rozumný fallback; výjimky jsou zachyceny na stránce a zobrazena hláška. Žádné další mitigace. |

---

## Známé odchylky

| Oblast | Odchylka |
|--------|----------|
| **Funkční** | Žádné. Parity audit (PHASE8) nepotvrdil funkční rozdíly oproti původní HTML verzi. |
| **UX** | Chybové hlášky (uložení do CRM, načtení souboru, export do dokumentů) používají `alert()`. Konzistentní toast systém v aplikaci může být zaveden později. |

---

## Doporučené další kroky

1. **Manuální QA** – Projít checklist v PHASE8 (všechny kroky wizardu, save/load, reset, export, CRM: otevření z klienta/domácnosti, uložení draftu, načtení draftu, export reportu do dokumentů).
2. **E2E smoke test (volitelně)** – Přidat Playwright test: otevření `/portal/analyses/financial`, přechod na krok 2 a zpět, uložení do souboru.
3. **Versioning (volitelně)** – Pokud bude požadována plná historie verzí, doplnit např. tabulku `analysis_versions` a ukládat snapshoty při každém uložení.
4. **Toast místo alert** – Sjednotit zobrazení chyb s ostatními částmi aplikace (toast nebo jiný pattern).

---

## Acceptance criteria z MASTER PROMPT (ověření)

| Kritérium | Splněno | Odkaz |
|-----------|----------|--------|
| financni-analyza.html už není finální runtime řešení | Ano | HTML v docs/archive; žádný iframe ani route na HTML. |
| Feature běží v React / Next.js | Ano | `/portal/analyses/financial`, app/portal/analyses/financial/, lib/analyses/financial/. |
| Celý wizard funguje | Ano | 7 kroků, stepper, next/prev, goToStep, zachování dat. |
| Výpočty a derived values odpovídají původní analýze | Ano | PHASE8 parity; calculations.ts, selectors.ts. |
| Grafy fungují | Ano | charts.ts, StepSummary, StepGoals, Chart.js. |
| Report/PDF/export funguje | Ano | buildReportHTML, tisk, export do dokumentů. |
| Analýza se ukládá do Aidvisora systému, ne jen do JSON/local storage | Ano | financial_analyses, saveFinancialAnalysisDraft; localStorage jako draft/recovery. |
| Analýzu lze uložit, načíst a upravit | Ano | saveFinancialAnalysisDraft, getFinancialAnalysis, loadFromServerPayload; toolbar Uložit/Načíst/Nový plán. |
| Analýza je navázaná na klienta | Ano | contactId, ContactFinancialAnalysesSection, ?clientId=. |
| Analýza je připravená nebo navázaná na domácnost | Ano | householdId, HouseholdDetailView, ?householdId=. |
| Export lze navázat na dokumenty | Ano | StepSummary „Uložit report do dokumentů“, uploadDocument, tag financial-report. |
| Byl proveden parity/backtest proti původní HTML verzi | Ano | PHASE8.md sekce 1, PHASE1_AUDIT.md. |
| Existuje jasný závěrečný report co je hotové / co ne | Ano | Tento dokument (MIGRATION_FINAL_REPORT.md). |
