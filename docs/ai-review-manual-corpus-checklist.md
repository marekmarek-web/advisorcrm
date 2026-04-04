# AI Review — manuální regrese na PDF korpusu

Korpus žije ve složce **`Test AI/`** (kořen monorepa). **Plný inventář** (C001–C027, `familyBucket`, očekávané typy): [ai-review-assistant-phase-1-corpus-inventory.md](./ai-review-assistant-phase-1-corpus-inventory.md) a [`fixtures/golden-ai-review/scenarios.manifest.json`](../fixtures/golden-ai-review/scenarios.manifest.json).

Část PDF může být **jen lokálně** (ne v gitu); sloupec „v git“ v inventáři odpovídá `git ls-files -- Test AI/`. Pro aktualizaci strojového stavu po přidání PDF do repa spusť z kořene repa: `node fixtures/golden-ai-review/regenerate-manifest.cjs` (přepočítá `gitTracked`).

## Soubory v širším korpusu (orientační očekávání)

| ID | Soubor | familyBucket | očekávaný `primaryType` (cíl) | v git |
|----|--------|--------------|------------------------------|-------|
| C001 | `1045978-001_D102_Smlouva o poskytnutí hypotečního úvěru_navrh.pdf` | mortgage_or_mortgage_proposal | `mortgage_document` | ne |
| C002 | `30. Pojistná smlouva c. 3282140369.pdf` | final_life_contract | `life_insurance_final_contract` | ano |
| C003 | `33543904_Modelace zivotniho pojisteni.pdf` | life_modelation | `life_insurance_modelation` | ne |
| C004 | `AMUNDI PLATFORMA - účet CZ KLASIK - DIP (4).pdf` | investment_or_dip_or_dps | `investment_subscription_document` | ne |
| C005 | `DPPDP9-0009513230-20250325-100501.pdf` | investment_or_dip_or_dps | `pension_contract` | ano |
| C006 | `Honzajk čpp změna.pdf` | service_or_aml_or_supporting_doc | `insurance_policy_change_or_service_doc` | ano |
| C007 | `Honzajk_KNZ_1FG_modelace_251107_161032.pdf` | life_modelation | `life_insurance_modelation` | ano |
| C008 | `Lehnert Metlife.pdf` | life_proposal | `life_insurance_proposal` | ne |
| C009 | `Navrh_pojistne_smlouvy (1).pdf` | life_bundle_with_questionnaires | `life_insurance_proposal` (+ health) | ne |
| C010 | `Navrh_pojistne_smlouvy (2).pdf` | life_proposal | `nonlife_insurance_contract` (motor) | ne |
| C011 | `Navrh_pojistne_smlouvy (3).pdf` | life_proposal | `liability_insurance_offer` | ano |
| C012 | `Navrh_pojistne_smlouvy (4).pdf` | life_proposal | `nonlife_insurance_contract` (majetek) | ne |
| C013 | `Navrh_pojistne_smlouvy_20251201152350427347.PDF` | life_proposal | `life_insurance_proposal` | ano |
| C014 | `Pojistna_smlouva.pdf` | life_bundle_with_questionnaires | `life_insurance_proposal` | ne |
| C015 | `Pojistna_smlouva_Bibiš.pdf` | life_proposal | `nonlife_insurance_contract` | ne |
| C016 | `RSR Quick s.r.o. DP 2024.pdf` | service_or_aml_or_supporting_doc | `corporate_tax_return` | ano |
| C017 | `Roman Koloburda UNIQA.pdf` | life_proposal | `life_insurance_proposal` (ověřit finál) | ano |
| C018 | `Smlouva (3).pdf` | investment_or_dip_or_dps | `pension_contract` | ne |
| C019 | `Smlouva o ČSOB Spotřebitelském úvěru.pdf` (+ viz alias v JSON) | consumer_loan | `consumer_loan_contract` | ne |
| C020 | `Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf` | service_or_aml_or_supporting_doc | `service_agreement` | ne |
| C021 | `Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf` | investment_or_dip_or_dps | `investment_subscription_document` | ne |
| C022 | `VL-202512.pdf` | investment_or_dip_or_dps | `pension_contract` | ano |
| C023 | `komis sml. aml fatca (1).pdf` | service_or_aml_or_supporting_doc | `consent_or_declaration` | ne |
| C024 | `Úvěrová smlouva ČÚ 111 06034 25 (1).pdf` | mortgage_or_mortgage_proposal | `mortgage_document` | ne |
| C025 | `ČSOB Leasing PBI.pdf` | leasing | `generic_financial_document` | ne |
| C026 | `Čučka zamzam GČP.pdf` | life_proposal | `liability_insurance_offer` | ne |
| C027 | `Hanna Havdan GČP.pdf` | life_bundle_with_questionnaires | `life_insurance_investment_contract` | ne |

Podrobné entity, pole, forbidden actions a review flagy jsou v JSON u každého `corpusDocuments` záznamu.

## Záznam po každém běhu (vyplň ručně v dev)

Spusť `pnpm dev`, nahraj PDF v AI Review, sleduj terminál / log.

| Soubor | `primaryType` (skutečné) | `promptKey` / router | `extractedFields` (počet klíčů) | `extraction_validation_soft_fail` (ano/ne) | Poznámka (OCR, výřez textu, …) |
|--------|--------------------------|----------------------|----------------------------------|--------------------------------------------|-------------------------------|
| | | | | | |

## Minimální kontrola kvality

- Po `applyExtractedFieldAliasNormalizations` nejsou povinná pole z `DOCUMENT_SCHEMA_REGISTRY` prázdná jen kvůli aliasům (`insurer` vs `institutionName` atd.).
- U `insuranceProposalModelation`: odpověď by měla obsahovat rozšířená pole (klient, platby, rizika) — viz adaptér [`legacy-insurance-proposal-envelope.ts`](../apps/web/src/lib/ai/legacy-insurance-proposal-envelope.ts).

## Související

- [ai-review-prompt-inventory.md](./ai-review-prompt-inventory.md) — proměnné a mapování na `ai uceni/`
- [ai-review-corpus-acceptance.md](./ai-review-corpus-acceptance.md) — obecné očekávání typů dokumentů
