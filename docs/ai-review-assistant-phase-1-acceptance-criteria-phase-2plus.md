# Fáze 1 — acceptance criteria pro Fázi 2+

Konkrétní, testovatelné věty. Splnění = pro daný golden scénář (G01–G12) bez regrese.

---

## Document type classification

1. Pro `33543904_Modelace zivotniho pojisteni.pdf` musí `primaryType` být `life_insurance_modelation` (ne `life_insurance_final_contract`) a `lifecycleStatus` musí odpovídat modelaci.
2. Pro CSOB spotřebitelský úvěr PDF musí být `primaryType` `consumer_loan_contract`, nikdy `mortgage_document`.
3. Pro AMUNDI DIP PDF musí výstup nést investiční/DIP signál (`investment_subscription_document` nebo schválený hybridní mapping z `resolveHybridInvestmentDocumentType`), ne čisté `life_insurance_contract`.
4. Pro `komis sml. aml fatca (1).pdf` musí být klasifikace v rodině compliance / servis (`consent_or_declaration`, `service_agreement`, nebo `generic_financial_document` s `documentIntent: manual_review_required`) — nikdy automaticky finální životní smlouva.

## Packet / bundle segmentation

5. U vícedílného PDF (G03) musí `reasonsForReview` nebo budoucí `packetWarnings` obsahovat signál „více logických dokumentů“, pokud text obsahuje samostatný zdravotní dotazník oddělený od smluvních stran.
6. Page-level evidence (`sourcePage`) u alespoň 3 klíčových polí musí odkazovat na správné strany (manuální audit na 1 vzorku z G03).

## Multi-person extraction

7. U dokumentu se dvěma dospělými účastníky musí extrakce nést dvě distinktní jména nebo explicitní `missing` pro vztah, ne jedno sloučené jméno bez varování.
8. U dokumentu s dítětem jako pojištěným musí být dítě uvedeno jako samostatná osoba v structured části envelope (ne jen v poznámce).

## Payment extraction

9. Pokud PDF obsahuje VS a číslo účtu v sekci plateb, `create_payment_setup*` draft musí po apply obsahovat obě hodnoty nebo být blokován gatem `PAYMENT_*`, ne tichý prázdný stav.
10. Měsíční vs roční pojistné musí být mapováno konzistentně s polem `premiumAmount` / `premiumAnnual` (žádné prohození bez `reasonsForReview`).

## Participant / role extraction

11. Pojistník odlišený od pojištěného musí mít v extrakci odlišné pole nebo explicitní role tag; pokud nelze, `review_required` + důvod v `classificationReasons`.

## Risk extraction

12. U tabulky rizik (např. úmrtí, invalidita) musí být alespoň jedno riziko v structured formě s částkou nebo označením „vybráno", ne prázdný seznam bez varování.

## Investment strategy extraction

13. U IŽP nebo DIP s výběrem strategie musí být název strategie nebo fond extrahován do `extractedFields` nebo portfolio attrs, ne zahozen.

## Contract publish safety

14. Apply nesmí nastavit `visibleToClient: true` u dokumentu klasifikovaného jako `life_insurance_modelation` bez explicitního advisor override v auditovaném kroku.
15. `evaluateApplyReadiness` musí pro návrh/modelaci vrátit alespoň jednu `applyBarrierReason` shodnou s UI copy v `AIReviewExtractionShell`.

## No wrong-client writes

16. Asistent v canonical režimu nesmí provést `executePlan` zápis na klienta, pokud `verifyWriteContextSafety` selže nebo `lockedClientId` neodpovídá intentu po disambiguaci.
17. Při `pendingClientDisambiguation === true` nesmí další zpráva automaticky obnovit lock z URL bez nového úspěšného match.

## Assistant review-context continuity

18. Po `bootstrapPostUploadReviewPlan` musí druhá zpráva v téže session obsahovat v kontextu stále `reviewId` facts z DB (stejná `processingStatus` po refresh), ověřeno E2E nebo integračně.
19. `buildReviewDetailContext` musí pro `blocked` review vrátit `blockedReasons` v textu facts pro model.

## Assistant multi-client handling

20. Testovací prompt se dvěma jmény bez RČ musí vyvolat buď disambiguační otázku, nebo `warnings` s explicitním „vyberte klienta“, nikoli tichý zápis na prvního nalezeného.

## Slang understanding

21. Věta „založ hypo na Nováka 3M“ musí mapovat na mortgage intent stejně jako formální „vytvoř hypoteční obchod“ (parametry mohou být incomplete, ale intent a tool family správné).
22. „životko k životku“ musí vést na životní pojištění produkt domain, ne na investment subscription.

## No raw debug leakage do UI

23. Odpověď asistenta po sanitizaci nesmí obsahovat substring `[TOOL:` ani `[RESULT:` (regrese na `assistant-message-sanitizer.test.ts`).
24. Odpověď nesmí obsahovat holý JSON objekt větší než 80 znaků jako top-level blok (stejný sanitizer).

---

## SQL migrace (Fáze 1 — tento dokument)

Žádné SQL migrace — kritéria jsou funkční a testovací.

```sql
-- Žádný nový skript.
```
