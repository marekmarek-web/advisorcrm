# Fáze 2 – Datový model a persistence firemní FA

Dokument popisuje datový model v Supabase, persistence vrstvu, JSON import a připravenost na Fázi 3.

---

## 1. Schéma v Supabase

### 1.1 Tabulka `companies`

Subjekty firemní analýzy (právnické osoby). Oddělená od `organizations`.

| Sloupec    | Typ      | Popis |
|------------|----------|--------|
| id         | uuid PK  | |
| tenant_id  | uuid NN  | |
| ico        | text     | IČO (nullable); pro deduplikaci hledat dle tenant_id + ico |
| name       | text NN  | |
| industry   | text     | |
| employees  | integer  | |
| cat3       | integer  | |
| avg_wage   | integer  | |
| top_client | integer  | |
| created_at | timestamp | |
| updated_at | timestamp | |

Soubor: [packages/db/src/schema/companies.ts](../../packages/db/src/schema/companies.ts).

### 1.2 Tabulka `company_person_links`

Vazby osoba ↔ firma (jednatel, majitel, společník, klíčová osoba, zaměstnanec). Základ pro shared facts.

| Sloupec                      | Typ      | Popis |
|-----------------------------|----------|--------|
| id                          | uuid PK  | |
| tenant_id                   | uuid NN  | |
| company_id                  | uuid FK  | → companies (onDelete cascade) |
| contact_id                  | uuid FK  | → contacts (onDelete set null) |
| role_type                   | text NN  | director \| owner \| partner \| key_person \| employee |
| ownership_percent           | integer  | |
| salary_from_company_monthly | integer  | |
| dividend_relation           | text     | |
| guarantees_company_liabilities | boolean | default false |
| created_at, updated_at      | timestamp | |

Soubor: [packages/db/src/schema/company-person-links.ts](../../packages/db/src/schema/company-person-links.ts).

### 1.3 Rozšíření `financial_analyses`

Přidané sloupce pro firemní analýzu:

| Sloupec             | Typ      | Popis |
|---------------------|----------|--------|
| company_id          | uuid FK  | → companies (nullable) |
| primary_contact_id  | uuid FK  | → contacts (nullable), hlavní jednatel |
| source_type         | text NN  | default `native`; `native` \| `imported_json` |
| version             | integer NN | default 1 |

Pro `type = 'company'`: payload = snapshot celého stavu (company, directors, finance, benefits, risks, directorIns, strategy, investments). Soubor: [packages/db/src/schema/financial-analyses.ts](../../packages/db/src/schema/financial-analyses.ts).

### 1.4 Tabulka `analysis_versions`

Historie verzí analýzy.

| Sloupec           | Typ      |
|-------------------|----------|
| id                | uuid PK  |
| analysis_id       | uuid FK  | → financial_analyses (onDelete cascade) |
| version_number    | integer NN |
| snapshot_payload  | jsonb NN |
| created_at        | timestamp |
| created_by        | text     |

[packages/db/src/schema/analysis-versions.ts](../../packages/db/src/schema/analysis-versions.ts).

### 1.5 Tabulka `analysis_import_jobs`

Audit a retry pro JSON import.

| Sloupec       | Typ      |
|---------------|----------|
| id            | uuid PK  |
| tenant_id     | uuid NN  |
| status        | text NN  | pending \| success \| failed |
| analysis_id   | uuid FK  | nullable |
| raw_payload   | jsonb    | nullable |
| errors        | jsonb    | nullable (pole chyb) |
| created_at    | timestamp |
| completed_at  | timestamp | nullable |

[packages/db/src/schema/analysis-import-jobs.ts](../../packages/db/src/schema/analysis-import-jobs.ts).

---

## 2. Persistence – create / save / load / update

- **Companies:** [apps/web/src/app/actions/companies.ts](../../apps/web/src/app/actions/companies.ts) – createCompany, getCompanyById, getCompanyByIco, listCompanies, updateCompany.
- **Company person links:** [apps/web/src/app/actions/company-person-links.ts](../../apps/web/src/app/actions/company-person-links.ts) – upsertCompanyPersonLinks (replace all links for company), getCompanyPersonLinks, getCompaniesForContact.
- **Firemní analýzy:** [apps/web/src/app/actions/company-financial-analyses.ts](../../apps/web/src/app/actions/company-financial-analyses.ts) – createCompanyAnalysis, getCompanyAnalysis, saveCompanyAnalysisDraft, setCompanyAnalysisStatus, setCompanyAnalysisLastExportedAt, listCompanyAnalyses, listCompanyAnalysesForCompany, listCompanyAnalysesForContact.
- **Verze:** createAnalysisVersion, getAnalysisVersions (ve stejném souboru).

Všechny akce používají requireAuthInAction() a oprávnění contacts:read / contacts:write.

---

## 3. JSON import

- **Validace:** [apps/web/src/lib/analyses/company-fa/importValidate.ts](../../apps/web/src/lib/analyses/company-fa/importValidate.ts) – normalizeCompanyFaPayload (legacy single director → directors[], výchozí risks/strategy/investments), validateCompanyFaImportPayload.
- **Preview:** [apps/web/src/lib/analyses/company-fa/importPreview.ts](../../apps/web/src/lib/analyses/company-fa/importPreview.ts) – buildCompanyFaImportPreview (čistá funkce; doplnění suggestedCompanyId a directorContactSuggestions volá server action).
- **Server actions importu:** [apps/web/src/app/actions/company-fa-import.ts](../../apps/web/src/app/actions/company-fa-import.ts):
  - validateCompanyFaImport(raw) – validace a normalizace.
  - getCompanyFaImportPreview(normalizedPayload) – hledá firmu podle IČO, návrhy kontaktů podle jména, vrací preview.
  - executeCompanyFaImport(normalizedPayload, options) – vytvoření nebo výběr firmy, upsert company_person_links, vytvoření analýzy nebo nové verze, zápis analysis_import_jobs (success/failed).

**Deduplikace firmy:** podle IČO v rámci tenanta (getCompanyByIco). V UI volba „Vytvořit novou firmu“ vs „Použít existující“.

**Párování osob:** heuristika podle jména (firstName/lastName); v preview suggestedContactId; uživatel může potvrdit nebo nechat null.

---

## 4. Shared facts vs snapshot

- **Snapshot (payload analýzy):** Celý stav wizardu – company, directors[], finance, benefits, risks, directorIns, strategy, investments. Uložen v financial_analyses.payload pro type=company. Pouze pro tuto analýzu a report.
- **Shared facts (company_person_links):** salaryFromCompanyMonthly (= příjem z firmy), ownershipPercent (= podíl), guaranteesCompanyLiabilities. Slouží pro pozdější propojení s osobní FA (Fáze 3).
- **Co nepropsat do osobní FA:** celý obrat firmy, všechny firemní náklady, celý firemní majetek jako osobní, všechny firemní závazky bez rozlišení ručení (viz [PHASE1_AUDIT.md](./PHASE1_AUDIT.md) oddíl 7).

---

## 5. UI – Import flow

Stránka [apps/web/src/app/portal/analyses/company/page.tsx](../../apps/web/src/app/portal/analyses/company/page.tsx):

1. Tlačítko / file input pro výběr JSON.
2. Po výběru: validace (validateCompanyFaImport). Při chybách zobrazení seznamu chyb.
3. Při úspěchu: getCompanyFaImportPreview → zobrazení náhledu (firma, IČO, volba vytvořit novou / použít existující, seznam jednatelů).
4. Tlačítko „Potvrdit import“ → executeCompanyFaImport → při úspěchu zobrazení odkazu na analýzu a tlačítka „Importovat další“.
5. Seznam firemních analýz (listCompanyAnalyses) s odkazem „Otevřít“ (parametr id; detail/úprava v Fázi 3).

---

## 6. Připravenost na Fázi 3

- Načtení analýzy: getCompanyAnalysis(id). Payload lze předat do budoucího store pro firemní FA (loadFromServerPayload).
- Entry pointy: seznam podle firmy (listCompanyAnalysesForCompany), podle kontaktu (listCompanyAnalysesForContact), celkový seznam (listCompanyAnalyses).
- Shared facts: company_person_links obsahuje salaryFromCompanyMonthly, ownershipPercent, guaranteesCompanyLiabilities – v Fázi 3 akce „Načíst fakta z firemní analýzy“ do osobní FA.

---

## 7. Acceptance criteria (ověření)

- Existuje datový model pro firemní FA v Aidvisora/Supabase (companies, company_person_links, rozšíření financial_analyses, analysis_versions, analysis_import_jobs).
- Firemní FA není navržena jako JSON-only storage; finální persistence je v Supabase.
- Existuje persistence vrstva pro create / save / load / update (company, links, analysis).
- Existuje model verzí (analysis_versions) a statusů (status v financial_analyses).
- Existuje model firma ↔ osoba (company_person_links).
- Existuje návrh shared facts (zdokumentován výše).
- Existuje JSON import flow (upload → validace → preview → mapování → uložení).
- JSON import validuje a mapuje data do systému (ne jen blob).
- Import umí vytvořit reálnou analýzu v databázi (company, links, analysis záznam).
- Architektura je připravená na Fázi 3 (React shell, načtení analýzy, entry pointy).
