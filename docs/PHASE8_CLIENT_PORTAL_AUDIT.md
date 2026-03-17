# Fáze 8: Audit vstupních dat a klientsky viditelný scope

Tento dokument definuje, jaké datové zdroje klientský portál používá, co je klientsky viditelné a co zůstává interní.

## Přehled zdrojů

| Zdroj | Pro klienta vhodné? | Source of truth | Klientsky viditelné | Interní pouze | Refresh / sync | Rizika / edge cases |
|-------|---------------------|-----------------|---------------------|---------------|----------------|----------------------|
| **Klientské identity** | Ano | `client_contacts` (userId ↔ contactId) | vlastní profil (jméno, email z kontaktu) | userId, interní poznámky | při pozvánce / úpravě | 1 kontakt = 1 uživatel; více členů domácnosti zatím není |
| **Domácnosti** | Částečně (budoucí) | `households`, `household_members` | jméno domácnosti, „společné“ produkty dle pravidel | interní role, poznámky | při změně členství | nutné pravidla visibility (co sdílené vs individuální) |
| **Smlouvy** | Ano | `contracts` | segment, partner, produkt, č. smlouvy, pojistné, začátek, výročí | advisorId, interní note | read z DB | neukazovat interní pole; překlad segmentů na klientský jazyk (segmentLabel) |
| **Investiční data** | Opatrně | finanční analýzy (`financial_analyses` + data) | souhrn (aktiva, cíle) jen pokud status „completed/exported“ | draft, interní detaily | dle analýz | bez „fake“ přesnosti; pokud ne hotová analýza → fallback / CTA na poradce |
| **Platby** | Ano | odvozeno z `contracts` + `payment_accounts` | účet, banka, poznámka, č. smlouvy, segment/partner | interní účetní logika | read | frekvence/splatnosti nejsou v modelu → buď „orientační“ nebo CTA |
| **Dokumenty** | Ano | `documents` | pouze `visibleToClient = true` | cesty, interní tagy | read + download log | audit stahování; žádné interní doklady |
| **Schůzky** | Volitelně | `events` | pouze klientsky relevantní (název, datum) | interní poznámky, přiřazení | read | filtrovat jen „client-facing“ eventy |
| **Úkoly** | Ne (nebo jen „čekáme na vás“) | `tasks` | pouze zjednodušený stav typu „čekáme na doplnění“ | detaily, přiřazení | — | raději přes „stav požadavku“ |
| **Zprávy** | Ano | `messages` | celá konverzace pro daný contactId | senderType/senderId pro UX | realtime nebo poll | oddělení od týmové komunikace (již po kontaktu) |
| **Servisní případy** | Nyní neexistují | — | — | — | — | Fáze 8: použít **opportunities** s označením původu z portálu |
| **Leady/obchody** | Nepřímo | `opportunities` | klient vidí jen „své“ požadavky a jejich **klientský stav** | stageId, probability, expectedValue | po vytvoření z portálu | mapování stage → klientský stav |
| **Notifikace** | Ano | `portal_notifications` | nová zpráva, změna stavu požadavku, nový dokument, důležitý termín | interní upozornění | push/email dle preferencí | preference odhlášení (již částečně: unsubscribe) |
| **Souhlasy** | Ano (GDPR) | `consents`, `processing_purposes` | co klient souhlasil | právní detaily | read | zobrazit v profilu / nastavení |
| **Onboarding** | Ano | `client_invitations` | stav pozvánky (čeká, přijata) | token, interní log | po přijetí | expirace tokenu; jeden kontakt = jedna aktivní pozvánka |

## Výstupy auditu

### Používané vstupy portálu

- `contacts` (read, vlastní řádek)
- `client_contacts`, `client_invitations`
- `contracts`
- `documents` (pouze `visibleToClient = true`)
- `payment_accounts` (přes contracts)
- `messages`
- `financial_analyses` (volitelně, pouze hotové – completed/exported)
- `events` (volitelně, klientsky relevantní)
- `opportunities` (pro „požadavky“ klienta; zobrazení klientského stavu)
- `opportunity_stages` (pouze pro mapování stage → klientský stav)
- `portal_notifications` (in-app notifikace)
- `audit_log` (zápis při akcích klienta)

### Pouze interní (nikdy klientovi)

- Raw názvy stage (interní labely)
- `probability`, `expectedValue`, `expectedCloseDate` u obchodů
- Interní poznámky (contracts.note, atd.)
- `advisorId`
- Účetní detaily nad rámec platebních instrukcí
- Draft finanční analýzy
- `incident_logs`, AML checklists
- Tokeny pozvánek (pouze pro ověření, ne zobrazení)

### Hranice portál ↔ CRM

- Portál **nemění** source of truth bez validace: klient pouze vytváří požadavky (opportunity); změny údajů pouze návrh nebo need-review (např. „Změna situace“ → poradce upraví v CRM).
- Source of truth zůstává v CRM. Všechna zobrazená data jsou read-only kromě: odeslání zprávy, vytvoření požadavku, (budoucí) preference notifikací.

## Bezpečnost a audit

- **Autorizace:** Všechny server actions pro klienta kontrolují `auth.roleName === "Client"` a `auth.contactId`; data jsou vždy filtrována podle `auth.tenantId` a `auth.contactId`.
- **Audit log:** Zapisují se akce: `portal_request_create` (vytvoření požadavku z portálu), `download` (stažení dokumentu – již existuje). Volitelně lze doplnit `portal_login` v auth callback při přihlášení s rolí Client.
- **Dokumenty:** Stažení pouze při `visibleToClient = true` a shodě `contactId` s přihlášeným klientem; každé stažení se zapisuje do `audit_log`.
- **GDPR:** Export dat a odhlášení notifikací jsou v klientském portálu dostupné; souhlas při registraci (gdprConsentAt).
