# Fáze 8: Návrh rozšíření klientského portálu o domácnost (household)

Tento dokument popisuje návrh rozšíření pro přístup na úrovni domácnosti. **Implementace není součástí první verze** – slouží jako podklad pro další iteraci.

## Aktuální stav

- Jeden uživatel (Client) = jeden kontakt přes `client_contacts(tenant_id, user_id → contact_id)`.
- Unikátní `(tenant_id, contact_id)` znamená, že ke jednomu kontaktu může být vázán nejvýše jeden přihlášený klient.
- V CRM existují `households` a `household_members`; Client Zone je zatím pouze na úrovni jednoho kontaktu.

## Cíl rozšíření

1. **Přístup na úrovni domácnosti**  
   Např. `client_contacts.household_id` (nullable). Pokud je nastaveno, klient vidí „sdílený“ scope (smlouvy domácnosti dle pravidel).

2. **Pravidla visibility**  
   Rozlišit:
   - **Sdílené v rámci domácnosti** – smlouvy/dokumenty viditelné všem členům domácnosti s portálovým přístupem.
   - **Individuální** – pouze vlastník kontaktu (např. životní pojištění jen na jednu osobu).

3. **Delegovaný přístup**  
   Druhý člen domácnosti má vlastní účet → stejný `household_id` v `client_contacts` → vidí jen to, co je označeno jako sdílené.

## Návrh schématu (pro další fázi)

### Rozšíření `client_contacts`

- **household_id** (uuid, nullable, FK → households.id)  
  Pokud je nastaveno, uživatel má přístup ke sdílenému scope domácnosti dle pravidel.

### Pravidla visibility (jedna z variant)

**Varianta A: Sloupec u entity**

- `contracts.household_visible` (boolean, default false) – pokud true, smlouva je viditelná všem členům domácnosti s portálovým přístupem.
- Podobně u dokumentů: rozšířit logiku `visibleToClient` o „visible to household“ (např. `documents.visible_to_household`).

**Varianta B: Samostatná tabulka pravidel**

- `portal_household_visibility_rules` (entity_type, entity_id, household_id, visible)  
  Explicitní pravidla bez změny stávajících tabulek.

### Audit a bezpečnost

- Nikdy neukazovat smlouvy/dokumenty jiného kontaktu v rámci domácnosti, pokud nejsou explicitně označeny jako sdílené.
- Audit přístupu k dokumentům ponechat (stávající `audit_log`).
- Při načítání dat pro Client s `household_id`: nejdřív kontaktní scope (vlastní kontakt), pak navíc entity kde `household_visible = true` a entity náleží k domácnosti (přes household_members).

## Implementační poznámky pro další iteraci

1. Migrace: přidat `household_id` do `client_contacts`, volitelně `household_visible` do `contracts` (nebo nová tabulka pravidel).
2. V server actions pro Client: pokud `auth.householdId` existuje, rozšířit dotazy o sdílené entity domácnosti dle zvolených pravidel.
3. V UI zobrazit např. sekci „Naše domácnost“ nebo odlišit „Moje“ vs „Sdílené v domácnosti“.
4. Onboarding: při pozvánce druhého člena domácnosti vyplnit `household_id` z kontaktu pozvaného.
