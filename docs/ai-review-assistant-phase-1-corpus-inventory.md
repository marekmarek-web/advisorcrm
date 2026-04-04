# Fáze 1 — inventář reálného korpusu (`Test AI/`)

**Source of truth (strojová):** [`fixtures/golden-ai-review/scenarios.manifest.json`](../fixtures/golden-ai-review/scenarios.manifest.json) — pole `corpusDocuments` (verze 2).

**Definice bucketů:** [ai-review-assistant-phase-1-corpus-buckets.md](./ai-review-assistant-phase-1-corpus-buckets.md)

**Scope dalších fází:** AI Review i AI asistent se v eval a opravách **musí opírat o celý tento korpus** (27 dokumentů / řádků C001–C027) a o scénáře G01–G12 — nikoli jen o původních ~9 souborů z raného checklistu. Dokument [ai-assistant-stage5-acceptance.md](./ai-assistant-stage5-acceptance.md) **není** definicí rozsahu korpusu.

**PDF v gitu:** typicky jen část souborů; sloupec „v git“ odpovídá `git ls-files -- Test AI/` v době generování manifestu (`gitTracked`). Ostatní PDF patří do **lokálního korpusu** na pracovní stanici (stejná cesta `Test AI/`).

**Chybějící soubor v clone:** `Hanna Havdan GČP.pdf` (C027) je v master plánu a manifestu; pokud není ve složce, je potřeba ho **doplnit lokálně** (není blokací pro docs/manifest).

---

## Přehled C001–C027

| ID | Soubor | familyBucket | expectedPrimaryType | publish | packet | v git |
|----|--------|--------------|---------------------|---------|--------|-------|
| C001 | 1045978-001_D102_Smlouva o poskytnutí hypotečního úvěru_navrh.pdf | mortgage_or_mortgage_proposal | mortgage_document | partial | ne | ne |
| C002 | 30. Pojistná smlouva c. 3282140369.pdf | final_life_contract | life_insurance_final_contract | ano | ne | ano |
| C003 | 33543904_Modelace zivotniho pojisteni.pdf | life_modelation | life_insurance_modelation | ne | ne | ne |
| C004 | AMUNDI PLATFORMA - účet CZ KLASIK - DIP (4).pdf | investment_or_dip_or_dps | investment_subscription_document | ano | ne | ne |
| C005 | DPPDP9-0009513230-20250325-100501.pdf | investment_or_dip_or_dps | pension_contract | ano | ne | ano |
| C006 | Honzajk čpp změna.pdf | service_or_aml_or_supporting_doc | insurance_policy_change_or_service_doc | ne | ne | ano |
| C007 | Honzajk_KNZ_1FG_modelace_251107_161032.pdf | life_modelation | life_insurance_modelation | ne | ne | ano |
| C008 | Lehnert Metlife.pdf | life_proposal | life_insurance_proposal | partial | ne | ne |
| C009 | Navrh_pojistne_smlouvy (1).pdf | life_bundle_with_questionnaires | life_insurance_proposal | partial | ano | ne |
| C010 | Navrh_pojistne_smlouvy (2).pdf | life_proposal | nonlife_insurance_contract | partial | ne | ne |
| C011 | Navrh_pojistne_smlouvy (3).pdf | life_proposal | liability_insurance_offer | partial | ne | ano |
| C012 | Navrh_pojistne_smlouvy (4).pdf | life_proposal | nonlife_insurance_contract | partial | ne | ne |
| C013 | Navrh_pojistne_smlouvy_20251201152350427347.PDF | life_proposal | life_insurance_proposal | partial | ne | ano |
| C014 | Pojistna_smlouva.pdf | life_bundle_with_questionnaires | life_insurance_proposal | partial | ano | ne |
| C015 | Pojistna_smlouva_Bibiš.pdf | life_proposal | nonlife_insurance_contract | partial | ne | ne |
| C016 | RSR Quick s.r.o. DP 2024.pdf | service_or_aml_or_supporting_doc | corporate_tax_return | ne | ne | ano |
| C017 | Roman Koloburda UNIQA.pdf | life_proposal | life_insurance_proposal | partial | ne | ano |
| C018 | Smlouva (3).pdf | investment_or_dip_or_dps | pension_contract | ano | ne | ne |
| C019 | Smlouva o ČSOB Spotřebitelském úvěru.pdf | consumer_loan | consumer_loan_contract | ano | ne | ne |
| C020 | Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf | service_or_aml_or_supporting_doc | service_agreement | ne | ne | ne |
| C021 | Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf | investment_or_dip_or_dps | investment_subscription_document | ano | ne | ne |
| C022 | VL-202512.pdf | investment_or_dip_or_dps | pension_contract | partial | ne | ano |
| C023 | komis sml. aml fatca (1).pdf | service_or_aml_or_supporting_doc | consent_or_declaration | ne | ne | ne |
| C024 | Úvěrová smlouva ČÚ 111 06034 25 (1).pdf | mortgage_or_mortgage_proposal | mortgage_document | ano | ne | ne |
| C025 | ČSOB Leasing PBI.pdf | leasing | generic_financial_document | ano | ne | ne |
| C026 | Čučka zamzam GČP.pdf | life_proposal | liability_insurance_offer | partial | ne | ne |
| C027 | Hanna Havdan GČP.pdf | life_bundle_with_questionnaires | life_insurance_investment_contract | partial | ano | ne |

**Alias:** C019 obsahuje též `aliasFileNames` pro alternativní název souboru spotřebitelského úvěru (viz JSON).

---

## SQL migrace

Žádné.

```sql
-- Žádný nový skript.
```
