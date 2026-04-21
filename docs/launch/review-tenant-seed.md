# App Review Tenant — reproducible seed (Delta A27)

**Cíl:** Existuje dedikovaný `review@aidvisora.cz` tenant s **reproducible** seed daty,
který slouží výhradně pro App Store + Play Store recenzi. Reviewer se přihlásí,
vidí realistický ale bezpečný data set, a může projít happy path.

**Proč dedikovaný tenant:**
- App Reviewer nesmí vidět reálná osobní data zákazníků (GDPR).
- Reviewer musí umět proběhnout demo flow i když si vytvoří registraci / mění stav.
- Po každém review cycle chceme tenant resetnout do "fresh demo" stavu.

---

## Credentials (pro App Store Connect + Play Console)

**Primary advisor (Admin role):**
- Email: `review@aidvisora.cz`
- Heslo: `AidvisoraReview2026!` *(přepsat před submissionem)*

**Sekundární klient (pro ověření client portal):**
- Email: `review-klient@aidvisora.cz`
- Heslo: `AidvisoraReview2026!` *(stejné heslo pro usnadnění)*

**Kam zadat:**
- iOS: App Store Connect → Your App → App Information → Review Information → Demo Account.
- Android: Play Console → Store listing → App content → App access → Login credentials.

---

## Tenant struktura — co má reviewer vidět

### Organizace
- Název: `Aidvisora Demo s.r.o.`
- Subscription status: `active` (nepadne do dunning UI).
- Plan: `PREMIUM_MONTHLY` (aby viděli full feature set).
- Fake DIČ: `CZ99999999` (invalid, nejde do Stripe live).

### Členi týmu (3)
1. **Review Admin** — `review@aidvisora.cz` — Admin role.
2. **Jan Novák (demo advisor)** — `jan.novak.demo@aidvisora.cz` — Advisor role.
3. **Petr Svoboda (demo manager)** — `petr.svoboda.demo@aidvisora.cz` — Manager role.

### Kontakty (15)
Mix osob rozložený tak, aby reviewer viděl:
- Kompletní kontakt s plnou sadou polí (osobní údaje, bank account, smlouvy).
- Minimalistický kontakt (jen jméno + telefon — ukazuje začátek onboardingu).
- Kontakt s několika smlouvami na různém pojistiteli.
- Kontakt s nedávnou interakcí (message, task, meeting note).
- Jednoho klienta s magic-link přístupem do client portalu (`review-klient@…`).

Všechna jména **fiktivní** (John Doe style v CZ). Rodná čísla generovaná syntheticky (RČ s validním checksumem ale nepatřící reálné osobě).

### Smlouvy (12)
- 4× životní pojištění (různé pojistitelé: Kooperativa, Allianz, Česká).
- 3× povinné ručení auto.
- 2× investiční fondy.
- 1× hypotéka (starší).
- 2× smlouvy ve stavu "požadavek na ukončení" (ukázat termination flow).

Každá smlouva má:
- PDF attachment v Supabase Storage (generické demo PDF, stejný soubor pro všechny).
- AI review záznam v `ai_contract_upload_reviews` s kompletní extrakcí (showcase AI review feature).

### Messaging (klient ↔ advisor)
- 2 aktivní konverzace s last message < 24h (ukáže unread badges).
- 1 konverzace s flag "action needed" (ukáže notification pipeline).

### Tasks / Calendar
- 5 tasks přidělených review advisor, 2 overdue (červený badge), 2 upcoming, 1 done.
- 3 calendar eventy v následujících 7 dnech (1× dnes, 1× zítra, 1× za 3 dny).

### Notifications
- 2 unread portal notifications (platební / klient-request).

### Sample payments (pro /portal/nastaveni/fakturace test)
- `subscription_started` event (3 měsíce zpátky).
- 2 successful invoices (minulý a předminulý měsíc).

---

## Seed script (referenční implementace)

Skript: `scripts/seed/review-tenant-seed.ts`. Spouští se jednou před submissionem nebo
po resetu reviewer tenantu.

```bash
# Z root repozitáře:
pnpm tsx scripts/seed/review-tenant-seed.ts \
  --supabase-url $SUPABASE_URL \
  --supabase-service-role $SUPABASE_SERVICE_ROLE_KEY \
  --tenant-name "Aidvisora Demo s.r.o."
```

**Idempotent:** skript nejprve smaže existující review tenant (pokud existuje) a pak vytvoří znovu.

### Struktura skriptu

1. Vytvořit Supabase user `review@aidvisora.cz` (skip pokud existuje).
2. Vytvořit tenant + workspace + membership (Admin role).
3. Vytvořit demo sub-users (`jan.novak.demo`, `petr.svoboda.demo`).
4. Vložit 15 contacts s deterministickými UUIDs (stejný reset přinese stejné IDs).
5. Vložit 12 contracts + upload demo PDF (`public/review/demo-smlouva.pdf`).
6. Vložit AI review záznamy s extrakcí.
7. Vložit conversations, messages, tasks, calendar events, notifications.
8. Nastavit subscription state na `active` s fiktivním Stripe customer ID (mock).
9. Zapsat `tenant.metadata.is_review_tenant = true` jako příznak (nutné pro prod hygiene check).

---

## Prod hygiene

### Co NESMÍ v prod produkci jít

- Žádné real customer data v tomto tenantu.
- Žádné real Stripe customer IDs (subscription musí být "fake active" state).
- Dne deplotu prod script musí *nepřekopírovat* review tenant seed do real tenant, pokud náhodou review tenant nemá flag.

### Denní cron sanity check (roadmap)

```sql
-- Spouštět denně, alert na Slack pokud se počet zvýší:
SELECT count(*) FROM contacts WHERE tenant_id IN (
  SELECT id FROM tenants WHERE metadata->>'is_review_tenant' = 'true'
);
-- Očekávané: ~15. Pokud > 20 = někdo zapisuje do review tenantu, investigate.
```

---

## Pre-submission checklist

- [ ] Seed script odladěn a spuštěn v produkci (přes SUPABASE_SERVICE_ROLE_KEY).
- [ ] Manuálně přihlášeno pod `review@aidvisora.cz` z iOS TestFlight — všechno zobrazuje.
- [ ] Přihlášeno pod `review-klient@aidvisora.cz` → client portal se načte, vidí své smlouvy.
- [ ] Credentials zadány v App Store Connect (Review Information).
- [ ] Credentials zadány v Play Console (App access).
- [ ] Demo video nebo screencasty dokumentují happy path (uploaded na App Store Connect).
- [ ] Password je **rotace-ready** — v dokumentu `docs/launch/review-tenant-credentials.gpg` (gpg-encrypted).

---

## Post-review reset flow

Po každém review cycle (úspěšném nebo rejected):

```bash
# 1. Reset tenant dat
pnpm tsx scripts/seed/review-tenant-seed.ts --reset

# 2. Rotace hesla (aby expired password v App Store netrpěl)
pnpm tsx scripts/seed/rotate-review-credentials.ts

# 3. Update credentials v App Store Connect / Play Console (manual).

# 4. Zapsat do docs/launch/review-tenant-log.md (date, reason, next-review).
```
