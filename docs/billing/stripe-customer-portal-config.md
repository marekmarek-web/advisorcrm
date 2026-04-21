# Stripe Customer Portal — Configuration review (Delta A25)

**Stav:** manual external step, musí být hotov PŘED first paid customerem.
**Kdo:** finance/ops owner (účet s Stripe Dashboard `Administrator` rolí).

---

## Kontext

Aidvisora používá Stripe Billing pro předplatné (měsíční/roční plán) a redirectuje
uživatele do **Customer Portalu** (`/portal/nastaveni/fakturace` → `createBillingPortalSession`).
Customer Portal je no-code UI hostované Stripem. **Jediný způsob, jak ho konfigurovat,
je Stripe Dashboard.** Deploy frontendu to nemění.

Pokud toto není správně nastavené:
- Zákazník buď **nemůže** zrušit předplatné (právní + support risk), **nebo** naopak
  může zrušit bez dunning procesu, čímž obejdeme retention a CZ VAT re-issue flow.
- DPH ID update (`tax_id`) nemusí být vypnutý → Stripe vygeneruje nový invoice s
  nesprávnou DIČ strukturou, což následně rozbije účetnictví (A19).

---

## Dashboard kroky — Test mode + Live mode

Všechny kroky dělat **v obou** modes (Test + Live). Test používá SetupView dev, Live reálný billing.

**Dashboard:** https://dashboard.stripe.com → Settings → Billing → Customer Portal.

### 1. Functionality — co zákazník smí

| Feature | Setting | Důvod |
|---|---|---|
| **Invoice history** | ✅ Enabled | Auditní přístup, GDPR požadavek. |
| **Update payment methods** | ✅ Enabled | Self-service vymění kartu před expirací. |
| **Cancel subscription** | ✅ Enabled, mode: **"At end of billing period"** | Nechceme okamžité zrušení uprostřed period (způsobí partial refund a účetně komplikace). |
| **Pause subscription** | ❌ Disabled | Nepodporujeme v našem flow; způsobilo by inkonzistence v dashboard access middleware. |
| **Switch plan** | ❌ Disabled | Plán změny řešíme v našem portálu + `subscription.update` server-side (kvůli proration + terms acceptance audit). |
| **Update customer information** | ✅ Enabled, ALE: | |
| — Email | ✅ Enabled | Self-service update pro billing email. |
| — Billing address | ✅ Enabled | Potřeba pro EU VAT místo dodání. |
| — **Tax ID** | ❌ **Disabled** | **Kritické.** Musí se dělat výhradně server-side přes naše API, které spustí DIČ VIES validaci + přepíše customer metadata atomicky. Pokud zákazník změní DIČ v portalu, **porušíme VAT invoice numbering (A19)**. |
| — Shipping address | ❌ Disabled | Služba, nic nedoručujeme. |

### 2. Branding

| Field | Value |
|---|---|
| Business name | `Aidvisora s.r.o.` |
| Icon | `docs/brand/aidvisora-icon-square.png` |
| Logo | `docs/brand/aidvisora-logo-horizontal.png` |
| Brand color | `#6366F1` (stejná jako primary v `globals.css`) |
| Accent color | `#0F172A` |

### 3. Legal links

| Link | URL |
|---|---|
| Terms of service | `https://aidvisora.cz/pravni/vseobecne-obchodni-podminky` |
| Privacy policy | `https://aidvisora.cz/pravni/zasady-ochrany-osobnich-udaju` |

### 4. Return URL

**Default return URL** (kam Stripe přesměruje po uložení změn nebo zrušení):

```
https://aidvisora.cz/portal/nastaveni/fakturace?from=portal
```

Náš server then reads `?from=portal` a zobrazí flash notifikaci ("Změny byly uloženy.").

### 5. Cancellation flow

- **Reason collection:** ✅ Enabled (checkbox list).
  - Customized reasons: `Cena`, `Nepotřebuji tolik funkcí`, `Přecházím ke konkurenci`, `Dočasná pauza`, `Jiný důvod`.
- **Feedback prompt:** ✅ Enabled, free-text field.
- **Retention offer:** ❌ Disabled při launchi. (Lze přidat později — např. 1 měsíc zdarma — ale
  vyžaduje ticketovou analýzu churnu.)
- **Cancellation mode:** "At end of billing period" (viz výše).

---

## Webhook dependency

Po zrušení z portalu přijde událost `customer.subscription.updated` s `cancel_at_period_end=true`
a pak (po vyčerpání) `customer.subscription.deleted`. Obě jsou už wired v:
`apps/web/src/app/api/webhooks/stripe/route.ts` → `handleSubscriptionCanceled` → posílá
`subscription-canceled` email (A4) a v naší DB nastaví `tenants.subscription_status = 'canceled'`.

**Post-launch kontrola:** po prvním zrušení přes portal ověřit, že:
- `subscription-canceled` email dorazil na billing_email.
- Tenant ztratil access k billing-only features (middleware dunning check).

---

## Testovací flow

1. Test mode: vytvořit test customer přes `bin/seed-test-customer.ts` (nebo ručně v Dashboardu).
2. Login jako advisor, jít na `/portal/nastaveni/fakturace` → "Spravovat předplatné".
3. Stripe portal se otevře → ověřit pořadí:
   - "Invoice history" — zobrazí seznam.
   - "Payment methods" — update funguje.
   - "Cancel plan" — reason collection + confirmation → po kliknutí zpět na `/portal/nastaveni/fakturace`.
4. Ověřit webhook deliveries v Dashboardu (Developers → Webhooks → aidvisora endpoint).
5. Ověřit, že **NELZE** editovat Tax ID (nemělo by být v UI přítomné tlačítko).

---

## Post-launch checklist

- [ ] Test mode nastaveno a otestováno přes `bin/seed-test-customer.ts`.
- [ ] Live mode nastaveno identicky (jiné branding hodnoty zakázat!).
- [ ] Return URL testnutý (nevrací na localhost/vercel preview).
- [ ] "Update tax ID" prověřeně disabled (screenshot do této složky).
- [ ] Webhook `subscription.deleted` dorazí a triggeruje subscription-canceled email.
