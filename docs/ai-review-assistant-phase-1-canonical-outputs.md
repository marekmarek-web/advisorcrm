# Fáze 1 — kanonická výstupní data (minimální scope podle segmentů)

Tento dokument upřesňuje, co musí systém **umět získat a držet** v extrakčním envelope / CRM vazbách. Typová struktura v kódu: `DocumentReviewEnvelope` (`apps/web/src/lib/ai/document-review-types.ts`) + `extractedFields` / klasifikace.

---

## A) Životní pojištění

Minimálně musí být dohledatelné nebo explicitně označené jako `missing` / `not_applicable`:

| Doména | Pole / koncept |
|--------|----------------|
| Typ dokumentu | `documentClassification.primaryType`, `lifecycleStatus`, `documentIntent` |
| Pojistník | identita + vztah k pojištěným |
| Pojištěné osoby | seznam s vazbou na osobní údaje v extrakci |
| Role osob | pojistník / pojištěný / účastník investiční složky |
| Rizika per osoba | kódy nebo popisy rizik z tabulek dokumentu |
| Pojistné | částka + měna + periodicita |
| Frekvence placení | měsíčně / čtvrtletně / ročně … |
| Číslo smlouvy / návrhu / pojistky | `contractNumber` nebo ekvivalent v extractedFields |
| Počátek a konec | `effectiveDate`, případně konec pojištění |
| Pojistitel | instituce / `partnerName` |
| Produkt | `productName` |
| Investiční strategie / fondy | pokud dokument IŽP — fondy, strategie, podíly |
| Podpisy | přítomnost / datum podpisu pokud v dokumentu |
| Zdravotní dotazníky | samostatná sekce nebo typ `medical_questionnaire` + citlivost |
| Platební údaje | účet, VS, varianta inkasa — vazba na `payment_instruction` typy |
| Publish hints | `documentIntent`, lifecycle (návrh vs finál) |
| Coverage hints | odvozené portfolio atributy pro mapu produktů (kam spadá smlouva) |
| Client portal relevance | flag zda má jít `visibleToClient` při linku dokumentu |

---

## B) Investice / DIP / DPS

| Doména | Pole / koncept |
|--------|----------------|
| Instituce | správce / obchodník |
| Produkt | fond / program / DPS |
| Pravidelná / jednorázová | periodicita a směr toku peněz |
| Částka | jednorázová nebo měsíční vklad |
| Fond / strategie | ISIN, název strategie |
| Datum účinnosti | podpis / první vklad |
| Vlastník / účastník | držitel účtu |
| Publishability | servisní vs úpis — `investment_service_agreement` vs subscription |
| Coverage relevance | segment investice / penze v CRM |

---

## C) Hypotéka / úvěr / leasing

| Doména | Pole / koncept |
|--------|----------------|
| Instituce | banka / leasingová společnost |
| Typ úvěru | spotřebitelský / hypoteční / leasing |
| Jistina / rámec | částka úvěru |
| Sazba | úroková sazba, RPSN u spotřeby |
| Splatnost | délka měsíců / let |
| Fixace | pokud uvedena |
| Datum podpisu / účinnosti | |
| Platební údaje | splátka, účet, inkaso |
| Účel | bydlení / podnikání / refinancování |
| Klient / spoludlužník | více osob |
| Publishability | interní smlouva vs sdílení |
| Navazující akce | úkol zástava, pojištění majetku |

---

## D) Majetek / odpovědnost / POV / HAV

| Doména | Pole / koncept |
|--------|----------------|
| Instituce | pojistitel |
| Produkt | Domov, POV, HAV, … |
| Pojištěný předmět | adresa, vozidlo (RZ, VIN), popis |
| Limity / pojistné částky | tabulky limitů |
| Pojistné | výše a frekvence |
| Období | počátek / konec |
| Osoby / vozidla / adresa | vazba na klienta |
| Coverage relevance | mapování na neživotní segmenty |

---

## E) Dokumenty nepublikovatelné jako smlouva

Tyto typy musí být v klasifikaci a UI **jednoznačně oddělené** od „produkční smlouvy“:

- AML / FATCA / KYC balíčky  
- Smlouva o poskytování služeb (investiční servis)  
- Servisní přílohy  
- Dotazníky (zdravotní, investiční, bonita)  
- Doprovodné formuláře  

**Pravidlo:** systém nesmí nabízet jedním kliknutím stejný apply profil jako u finální pojistné smlouvy; minimálně `manual_review_required`, `reference_only` nebo `illustrative_only` + apply bariéry z `quality-gates.ts`.

---

## SQL migrace (Fáze 1 — tento dokument)

Žádné SQL migrace nejsou potřeba — jde o specifikaci polí vůči existujícím JSON sloupcům (`extracted_payload`, `portfolio_attributes`).

```sql
-- Žádný nový skript.
```
