# CZ VAT Invoice Numbering — rozhodnutí (Delta A19)

**Owner:** CFO / účetní (externí).
**Stav:** ⚠ pending — rozhodnutí se musí uzavřít **před first paid customer** (live subscription).
**Deadline:** první platba (Stripe live mode).

---

## Problém

Česká legislativa (Zákon o DPH, § 28–29) požaduje, aby daňový doklad (invoice) měl:

1. **Unikátní identifikační číslo** v chronologické sekvenci kalendářního roku.
2. Sekvence **bez mezer** (každá přeskočená řada vyžaduje storno doklad s vysvětlením).
3. Jasné a konzistentní "sériové" prefix (např. `2026-0001`).

Stripe defaultně generuje invoice numbers jako `A1B2C3-0001` (prefix podle dashboard nastavení,
pořadí podle Stripe interního counteru). To je **strukturálně OK**, ale:

- Stripe neumí garantovat "bez mezer" v naší striktní definici (zrušené drafty → přeskočené ID).
- Prefix a padding nejsou 100% pod naší kontrolou při zásahu externí účetní.
- Některé účetní ERP systémy (Pohoda, Money S3) vyžadují vlastní číselnou řadu
  per dokladová řada (daňový doklad vs. storno vs. zálohový).

---

## Varianty

### Varianta A — **Stripe-native numbering**

- Kompletně spoléháme na Stripe invoice.number.
- V naší DB držíme pouze `stripe_invoice_id` + mapping na tenant.
- Účetní importuje CSV export ze Stripe Dashboard měsíčně.

**Pro:**
- 0 development work.
- Žádné race conditions / off-by-one.
- Historicky stabilní — Stripe nedělá re-number.

**Proti:**
- Prefix je *per Stripe account*, ne per CZ entity. Pokud později založíme druhou entitu,
  musíme udělat druhý Stripe account (nebo explicitně rebrandovat).
- Dokumentově oba (CZ úřad i accounting SW) musí akceptovat tento formát. Typicky akceptují,
  ale vyžaduje to explicitní potvrzení účetní.
- Pokud Stripe zruší draft invoice, vznikne "mezera" v jejich interním counteru. Stripe to
  neřeší jako gap, ale účetní se musí zeptat.

### Varianta B — **Vlastní sekvence generátor**

- Držíme vlastní tabulku `invoice_sequence` s `year` + `next_number`.
- Při `invoice.created` webhooku vezmeme další number, zapíšeme do našeho DB + přes Stripe API
  updateneme invoice `custom_fields` nebo `metadata.cz_invoice_number`.
- PDF generujeme vlastní (nebo jen posíláme jako supplementary PDF).
- CSV export pro účetní vytváří naše cron úloha.

**Pro:**
- Plná kontrola nad prefixy, padding, dokladovými řadami.
- Můžeme garantovat "bez mezer" (unikátní lock per row + `SELECT FOR UPDATE`).
- Snadnější adaptace na CZ accounting SW (Pohoda, Money) = import v jejich formátu.

**Proti:**
- ~3 dny dev work (migrace, webhook handler, PDF generator, export cron).
- Musíme testovat race conditions (concurrent invoices → SELECT FOR UPDATE v jedné transakci).
- Extra state — když se naše DB a Stripe rozjedou (např. po webhook failure), nutné reconcile script.

---

## Doporučení (assistant opinion — NEJE FINÁLNÍ)

**Pro MVP → Varianta A (Stripe-native).**

Důvod:
- První 3–6 měsíců očekáváme < 100 paid customers. Manuální import do účetního SW je triviální.
- Stripe invoice.number formát akceptuje většina CZ účetních po vysvětlení.
- Vlastní sequence generator má riziko chyb (off-by-one, lock timeout) → místo ušetřit
  účetní 10 min/měsíc rozbijeme 1 invoice → je to net-negative.

**Po 6 měsících / 200+ paid customers** přejít na Variantu B s řádnou testing campaign.

---

## Akční body (CFO / účetní)

- [ ] **CFO / externí účetní potvrdí písemně** (email / Slack screenshot) akceptaci Stripe
  invoice.number formátu pro CZ DPH účely.
- [ ] Pokud odmítne → **blokuje launch**. Přejít na Variantu B a plánovat +3 dny dev.
- [ ] V Stripe Dashboard nastavit invoice prefix na `AIDV` + sequential counter
  (Settings → Billing → Invoice template → Invoice number prefix = `AIDV-`, padding 4).
- [ ] Nastavit "Automatically collect tax" = ON s DIČ `CZxxxxxxxxxx` (doplnit po registraci k DPH).
- [ ] Nastavit `description` pole na invoice template = "Aidvisora SaaS služba — měsíční předplatné" (CZ).
- [ ] Po each month: CSV export (Dashboard → Invoices → Export → CSV) → předat účetní.
- [ ] Dokument nahrát do `docs/billing/cz-vat-invoice-numbering-decision.signed.pdf`
  (scan potvrzení).

---

## Pokud se rozhodne pro Variantu B (roadmap)

Pseudokód pro generator (pro budoucí implementaci):

```ts
// packages/db/src/schema/invoices.ts
export const invoiceSequence = pgTable("invoice_sequence", {
  year: integer("year").primaryKey(),
  nextNumber: integer("next_number").notNull().default(1),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// apps/web/src/lib/billing/cz-invoice-number.ts
export async function allocateCzInvoiceNumber(tx: typeof db): Promise<string> {
  const year = new Date().getFullYear();
  const row = await tx
    .select()
    .from(invoiceSequence)
    .where(eq(invoiceSequence.year, year))
    .for("update")
    .limit(1);
  let next = 1;
  if (row.length === 0) {
    await tx.insert(invoiceSequence).values({ year, nextNumber: 2 });
  } else {
    next = row[0].nextNumber;
    await tx
      .update(invoiceSequence)
      .set({ nextNumber: next + 1, updatedAt: new Date() })
      .where(eq(invoiceSequence.year, year));
  }
  return `AIDV-${year}-${String(next).padStart(5, "0")}`;
}
```

Wiring v Stripe webhooku `invoice.created` → volat tohle, uložit do
`stripe.invoice.metadata.cz_invoice_number`, zobrazit v PDF.

---

## Status log

| Datum | Akce | Osoba |
|---|---|---|
| 2026-04-21 | Dokument vytvořen — čekáme na rozhodnutí CFO / účetní | AI audit |
| | | |
