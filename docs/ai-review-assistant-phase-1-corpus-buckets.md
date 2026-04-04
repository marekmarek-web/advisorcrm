# Fáze 1 — `familyBucket` taxonomie (10 kategorií)

**Účel:** Společná návěstí pro `corpusDocuments[].familyBucket` v [`fixtures/golden-ai-review/scenarios.manifest.json`](../fixtures/golden-ai-review/scenarios.manifest.json).  
**Kanoničtější výstupní pole:** sladit s [ai-review-assistant-phase-1-canonical-outputs.md](./ai-review-assistant-phase-1-canonical-outputs.md).

**Důležité:** Bucket `life_proposal` v této fázi záměrně drží i **neživotní návrhy / nabídky** (POV, majetek, odpovědnost), kde jde o stejnou *fázi dokumentu* (návrh), ale jiný produkt — viz `corpusNote` u příslušných `C0xx`. Fáze 2 může zavést samostatný `non_life_*` bucket.

---

## 1. `final_life_contract`

**Minimální data z dokumentu:** `primaryType` + lifecycle finál; pojistitel; produkt; číslo smlouvy; pojistné (částka + frekvence); účinnost; účastníci (pojistník / pojištění); rizika tam, kde jsou v dokumentu; platební údaje; evidence (strana) u klíčových polí.

## 2. `life_proposal`

**Minimální data:** návrhová klasifikace; instituce; produkt; navrhované pojistné; účastníci; **odlišení ilustrace vs závazné datumy**; očekávané apply bariéry pro „finální smlouvu“.  
**Neživot:** stejné minimum + předmět (vozidlo, majetek, obrat…) podle typu dokumentu.

## 3. `life_modelation`

**Minimální data:** čistá modelace; produkt; částky; instituce; žádné vynucení finálního `effectiveDate` jako u podepsané smlouvy.

## 4. `life_bundle_with_questionnaires`

**Minimální data:** flag packet/bundle; smluvní jádro vs zdravotní / citlivé sekce; více osob kde platí; co je publishable do CRM/portálu vs jen trezor; signál pro segmentaci (Fáze 2).

## 5. `investment_or_dip_or_dps`

**Minimální data:** instituce; produkt; DIP vs úpis vs DPS; částky a periodicita; účet/účastník; účinnost; určené osoby u DPS.

## 6. `consumer_loan`

**Minimální data:** věřitel; dlužník; jistina; sazba/RPSN; splátka; splatnost; úč Č; datum čerpání kde je uvedeno.

## 7. `mortgage_or_mortgage_proposal`

**Minimální data:** věřitel; všichni dlužníci; jistina; sazba; fixace; zástava; účel; návrh vs čerpaná smlouva dle textu.

## 8. `leasing`

**Minimální data:** pronajímatel/context leasingu; předmět (VIN/RZ); výše financování; podnikatelský účel; POV/HAV jako metadata pokud jsou součástí dokumentu.

## 9. `service_or_aml_or_supporting_doc`

**Minimální data:** typ podpůrné dokumentace (servisní smlouva, AML/FATCA, změna pojistky, DP…); subjekty; datum; **záměr `reference_only` / `manual_review_required`** — nesmí se automaticky equovat finální produktové smlouvě v CRM.

## 10. `non_publishable_attachment_only`

**Minimální data:** čistá příloha / samostatný dotazník bez smluvního jádra — typ dokumentu a citlivost; žádný slepý `create_contract`.

V aktuálním korpusu **není** samostatný PDF pouze v tomto bucketu (části dotazníků jsou uvnitř balíků C009, C014, C027). Bucket zůstává v taxonomii pro Fázi 2+ a eval čistých příloh.

---

## SQL migrace

Žádné — dokumentace pouze.

```sql
-- Žádný nový skript.
```
