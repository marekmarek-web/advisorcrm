# Fáze 1 — golden dataset (scénáře pravdy)

**Účel:** Tvrdý referenční rámec pro Fázi 2+ (eval, regrese, acceptance).  
**Širší korpus:** Každý reálný PDF má záznam **C001–C027** v [`fixtures/golden-ai-review/scenarios.manifest.json`](../fixtures/golden-ai-review/scenarios.manifest.json) (`corpusDocuments`: `familyBucket`, `expectedPrimaryType`, entity, pole, zakázané akce, review flagy, `expectedAssistantRelevance`). Přehledová tabulka: [ai-review-assistant-phase-1-corpus-inventory.md](./ai-review-assistant-phase-1-corpus-inventory.md). **G01–G12** dál slouží jako agregační scénáře; mapování **G → C** je v manifestu (`scenarios[].coversCorpusIds`).

**PDF soubory:** pod `Test AI/`; část jen lokálně (není v gitu). Soubor `Hanna Havdan GČP.pdf` může chybět ve fyzické složce — doplnit lokálně dle master plánu.

Legenda **publishable**: zda má systém dovolit „apply jako smlouvu / visible“ bez override, až bude extrakce a typ správně.

---

## G01 — Finální životní pojistná smlouva

| Pole | Hodnota |
|------|---------|
| **Referenční soubor (master plán)** | Konkrétní finální LP smlouva z portfolia poradců (doplnit filename z `Test AI/`). |
| **document family** | `life_insurance` |
| **očekávaný document type (primary)** | `life_insurance_final_contract` nebo `life_insurance_contract` |
| **publishable** | Ano (po schválení review a platných platbách dle gate). |
| **expected entities** | Pojistník, 1+ pojištěných, pojistitel, produkt, smluvní vztah. |
| **expected extracted fields** | `contractNumber`, `institutionName`/`partner`, `productName`, `effectiveDate`, `endDate` pokud je v dokumentu, pojistné (měsíční/roční), frekvence, seznam rizik/shardů dle schématu. |
| **expected actions** | `create_or_update_contract_record`, případně `create_payment_setup*`, link dokumentu. |
| **expected forbidden actions** | Publish jako jiný segment (např. čistá investice); založení klienta na špatném jménu z přílohy. |
| **expected review flags** | Nízká confidence u health sekce → `review_required`; varování při neúplné platbě. |

---

## G02 — Modelace / návrh životního pojištění

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `33543904_Modelace zivotniho pojisteni.pdf`, příp. `Navrh_pojistne_smlouvy (1).pdf` |
| **document family** | `life_insurance` |
| **očekávaný document type** | `life_insurance_modelation` / `life_insurance_proposal` |
| **publishable** | Ne jako finální smlouva bez explicitního override (lifecycle `modelation` / `proposal`). |
| **expected entities** | Navrhovaní účastníci, produkt, měsíční/annual premium. |
| **expected extracted fields** | Premium, frekvence, produkt, instituce, ilustrační datumy — rozlišené od „účinnost smlouvy“. |
| **expected actions** | Spíše úkol / náhled; ne automatický `visibleToClient: true` bez gate bypass. |
| **expected forbidden actions** | Tvrdý apply finální smlouvy bez `applyBarrier` řešení. |
| **expected review flags** | `applyBarrierReasons` obsahuje návrh/modelace; banner override ve UI. |

---

## G03 — Bundle: smlouva + zdravotní dotazníky / více částí

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `Hanna Havdan GČP.pdf` (nebo jiný vícedílný balík z master plánu). |
| **document family** | `life_insurance` + `health_questionnaire` (více sub-dokumentů v jednom PDF — cíl Fáze 2: segmentace). |
| **očekávaný document type** | Primárně LP; sekundárně `medical_questionnaire` jako vazba/section. |
| **publishable** | Část smluvní ano; zdravotní část ne do portálu jako „smlouva“. |
| **expected entities** | Více osob, vazby pojistník × pojištění. |
| **expected extracted fields** | Oddělené health vs core smluvní pole; VS/účet pokud přítomny. |
| **expected actions** | Partial apply + manuální rozhodnutí o dokumentu v trezoru. |
| **expected forbidden actions** | Jedna plochá smlouva bez označení citlivých sekcí. |
| **expected review flags** | `mixed_sensitive_document`, `packetWarnings` (až doplní pipeline). |

---

## G04 — Dokument s více osobami na smlouvě

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `Lehnert Metlife.pdf`, `Navrh_pojistne_smlouvy (1).pdf` |
| **document family** | `life_insurance` |
| **očekávaný document type** | `life_insurance_proposal` nebo contract variant. |
| **publishable** | Podle typu; vždy s jednoznačným primárním klientem pro CRM. |
| **expected entities** | 2+ osoby s rolemi (pojistník, pojištěný, dítě). |
| **expected extracted fields** | Per-osoba rizika/kuřák/příjem kde je v dokumentu. |
| **expected actions** | Jeden `matchedClientId` + evidence ostatních v `portfolioAttributes` / poznámce. |
| **expected forbidden actions** | Sloučení dvou osob do jednoho jména bez varování. |
| **expected review flags** | `review_required` při ambiguous match více RČ/jmen. |

---

## G05 — Investice / DIP / DPS

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `AMUNDI PLATFORMA - účet CZ KLASIK - DIP (4).pdf`, `Smlouva (3).pdf` (Conseq DPS), `Smlouva-o-upisu-CODYAMIX-Chlumecky-Jiri.pdf` |
| **document family** | `investment` / `pension` |
| **očekávaný document type** | `investment_subscription_document`, `pension_contract`, příp. `investment_service_agreement` |
| **publishable** | Ano pro úpis/DPS; **ne** pro čistě servisní rámcovku bez produktové linky. |
| **expected entities** | Instituce, účastník, účet, strategie/fond. |
| **expected extracted fields** | Částka, periodicita, ISIN/strategie, účinnost. |
| **expected actions** | Contract segment investice/penzijní; ne PL segment. |
| **expected forbidden actions** | Klasifikace jako čisté životní pojištění. |
| **expected review flags** | Hybridní signály — `ai-review-document-type-signals`. |

---

## G06 — Spotřebitelský úvěr

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `Smlouva_o_ČSOB_Spotřebitelském_úvěru.pdf` |
| **document family** | `consumer_credit` |
| **očekávaný document type** | `consumer_loan_contract` |
| **publishable** | Ano s ohledem na citlivost — standardně interní smlouva + visible dle politiky tenantu. |
| **expected entities** | Dlužník, věřitel, účel. |
| **expected extracted fields** | Jistina, RPSN/sazba, splátka, délka, čerpání. |
| **expected actions** | `create_or_update_contract_record` se správným segmentem úvěr. |
| **expected forbidden actions** | Záměna za hypotéku. |
| **expected review flags** | Chybějící klíčová čísla → `blocked` u plateb pokud navázané. |

---

## G07 — Hypotéka / hypoteční návrh

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `1045978-001_D102_Smlouva o poskytnutí hypotečního úvěru_navrh.pdf`, `Úvěrová smlouva ČÚ 111 06034 25 (1).pdf` |
| **document family** | `mortgage` |
| **očekávaný document type** | `mortgage_document` |
| **publishable** | Ano po review; více dlužníků vyžaduje explicitní entity. |
| **expected entities** | Dlužníci, spoludlužníci, zástava, účel. |
| **expected extracted fields** | Jistina, fixace, sazba, splatnost, čerpání. |
| **expected actions** | Mortgage bundle v asistentovi kde zapnuto; contract záznam v CRM. |
| **expected forbidden actions** | Zápis jen jednoho dlužníka když jsou dva. |
| **expected review flags** | `shouldUseMortgageVerifiedBundle` / review_required při neúplnosti. |

---

## G08 — Leasing / financování

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `ČSOB Leasing PBI.pdf` |
| **document family** | `leasing` / `business_finance` |
| **očekávaný document type** | Mapovat na nejbližší v `PRIMARY_DOCUMENT_TYPES` (`generic_financial_document` nebo rozšíření ve Fázi 2). |
| **publishable** | Ano jako smlouva o financování; POV/HAV povinnost jako metadata pokud přítomna. |
| **expected entities** | Vozidlo (VIN/RZ), podnikatel, leasingová společnost. |
| **expected extracted fields** | Výše financování, splátka, účel podnikání. |
| **expected actions** | Contract + případně úkol na pojištění vozidla. |
| **expected forbidden actions** | Ignorovat VIN a propsat náhodný produkt. |
| **expected review flags** | `unknown` subtype → manual review. |

---

## G09 — Dokument jen do trezoru (nepublikovat jako smlouvu)

| Pole | Hodnota |
|------|---------|
| **Referenční soubor** | `komis sml. aml fatca (1).pdf`, `Smlouva-o-poskytovani-sluzeb-Chlumecky-Jiri.pdf` |
| **document family** | `compliance` / `service_agreement` |
| **očekávaný document type** | `consent_or_declaration`, `service_agreement`, příp. identity/AML kategorie |
| **publishable** | **Ne** jako standardní „smlouva produktu“ do portálu klienta. |
| **expected entities** | Subjekt služby, poskytovatel. |
| **expected extracted fields** | Datum, typ dokumentu, účel evidence. |
| **expected actions** | Upload do `documents` bez `visibleToClient` nebo s explicitním advisor rozhodnutím. |
| **expected forbidden actions** | Auto-apply `create_contract` s segmentem život/investice. |
| **expected review flags** | `manual_review_required`, `reference_only`. |

---

## G10 — Assistant: upload dokumentu → navazující chat

| Pole | Hodnota |
|------|---------|
| **document family** | libovolná z G01–G09 |
| **očekávaný document type** | Stejné jako review pipeline po zpracování |
| **publishable** | N/A (scénář asistenta) |
| **expected entities** | `reviewId` v `activeContext` |
| **expected extracted fields** | Shrnutí z `buildReviewDetailContext` (status, typ, gate). |
| **expected actions** | `bootstrapPostUploadReviewPlan: true` navrhne kroky; canonical orchestration. |
| **expected forbidden actions** | CRM write bez confirm v canonical režimu. |
| **expected review flags** | Stejné jako u odpovídajícího G0x. |

---

## G11 — Assistant: více klientů ve stejném vlákně

| Pole | Hodnota |
|------|---------|
| **document family** | N/A |
| **očekávaný document type** | N/A |
| **publishable** | N/A |
| **expected entities** | Dva kontakty zmíněné v jedné konverzaci |
| **expected extracted fields** | Rozlišení přes `pendingClientDisambiguation` / lock |
| **expected actions** | Zeptat se nebo vyžadovat výběr; zápis jen na `lockedClientId`. |
| **expected forbidden actions** | Zápis na špatného klienta při ambiguous textu. |
| **expected review flags** | Warning v odpovědi asistenta. |

---

## G12 — Assistant: slang poradců

| Pole | Hodnota |
|------|---------|
| **document family** | N/A |
| **očekávaný document type** | N/A |
| **publishable** | N/A |
| **expected entities** | „životko“, „hypo“, „šmudla“, „DIPko“, regionální zkratky |
| **expected extracted fields** | Kanonický intent mapovaný na stejné akce jako formální slova. |
| **expected actions** | Stejné jako u formálních příkazů po ověření. |
| **expected forbidden actions** | Odmítnutí helpu nebo halucinace nástroje. |
| **expected review flags** | Nízká confidence → žádný auto-confirm. |

---

## Manifest

Strojový index: [`fixtures/golden-ai-review/scenarios.manifest.json`](../fixtures/golden-ai-review/scenarios.manifest.json) — **`version`: 2**, pole `scenarios` + `corpusDocuments`. Po přidání PDF do gitu nebo změně cesty spusť z kořene repa: `node fixtures/golden-ai-review/regenerate-manifest.cjs`.
