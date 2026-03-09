# Rework & Bugfix – změny podle plánu (Board, Kontakty, Úkoly, UI)

## Seznam změněných souborů

### Board (P0)

| Soubor | Změny |
|--------|--------|
| `apps/web/src/app/actions/board.ts` | DEFAULT_COLUMNS: první sloupec „Klient“ → **„Jméno klienta“**; výchozí název view **„Plan rozděleno“** (s diakritikou). Žádné BJ sloupce v defaultu. |
| `apps/web/src/app/board/seed-data.ts` | Sloupec item: title **„Jméno klienta“**. |
| `apps/web/src/app/components/monday/ColumnHeader.tsx` | **„Změnit typ“** (místo „Change type“); typy: Číslo, Datum, Produkt; menu zavírání na **mouseup**. |
| `apps/web/src/app/components/monday/BoardHeader.tsx` | **Název nástěnky** přímo editovatelný (klik na název → inline edit); dropdown: „Přejmenovat nástěnku“, „+ Přidat nástěnku“. |
| `apps/web/src/app/components/monday/BoardTable.tsx` | Tlačítko pod skupinou: **„+ Nový řádek“**; tlačítko přidat skupinu: **„+ Přidat skupinu“**. |
| `apps/web/src/app/components/monday/GroupHeaderRow.tsx` | **Klik na název skupiny** spustí inline přejmenování (ne jen z menu). |
| `apps/web/src/app/components/monday/CellText.tsx` | **Jedno kliknutí** (ne jen dvojklik) vstoupí do režimu úprav; `stopPropagation`; tooltip „Klikněte pro úpravu“. |
| `apps/web/src/app/components/monday/CellStatus.tsx` | Zavírání menu na **mouseup**; „Upravit štítky“; `role="listbox"` pro správné chování dropdownu. |
| `apps/web/src/app/portal/PortalBoardView.tsx` | **Wizard přidání skupiny**: modal s názvem (povinné) a barvou (volitelně); tlačítko „+ Přidat skupinu“ otevře modal; nový řádek = **„Nový řádek“**; persist názvů (board, skupiny, sloupce) a Change type přes stávající debounce save. |

### Dropdowny a globální UX

| Soubor | Změny |
|--------|--------|
| `apps/web/src/app/components/TooltipBlurListener.tsx` | Při kliknutí na **select, option, input, textarea, [role=listbox/menu]** se **nebluruje** aktivní prvek → dropdowny a textová pole zůstávají použitelné. |
| `apps/web/src/app/components/BaseModal.tsx` | Zavírání modalu až na **mouseup** na overlay (ne click), aby výběr v `<select>` v modalu nezavřel modal. |
| `apps/web/src/app/components/monday/Toolbar.tsx` | **Filtrovat**, **Seřadit**, **Skrýt**, **Seskupit** (s diakritikou). |

### Kontakty

| Soubor | Změny |
|--------|--------|
| `apps/web/src/app/components/contacts/ClientFinancialSummary.tsx` | **Odstraněn blok „Pokrytí produktů“** – zůstává jen na záložce Přehled (ProductCoverageGrid). Na Smlouvy zůstává Finanční přehled, Pokrytí dle segmentu, Časová osa smluv. |
| `apps/web/src/app/components/contacts/ProductCoverageGrid.tsx` | **UI na Přehledu**: ikona u nadpisu „Pokrytí produktů“, progress řádek centrovaný (max-w-md mx-auto), **rounded-lg** na progress baru; kategorie s malou ikonou (první písmeno); konzistentní spacing (gap, items-stretch). |

### Úkoly a Kalendář

- **Úkoly** (`apps/web/src/app/portal/tasks/page.tsx`): formulář vytvoření úkolu a selecty beze změny logiky; **TooltipBlurListener** a **BaseModal** už neblurují při kliknutí do selectu/inputu, takže vytvoření úkolu a výběr kontaktu/termínu by měly fungovat.
- **Kalendář** (`PortalCalendarView.tsx`): formulář „Nová aktivita“ používá **BaseModal** (zavírání na mouseup) a nativní `<select>`; **TooltipBlurListener** nebluruje při kliknutí na select/option → vytvoření události a výběr Kontakt/Obchod/Připomenutí by měly fungovat.

### Diakritika a názvy

- Board: Jméno klienta, Nový řádek, Přidat skupinu, Plan rozděleno, Přejmenovat nástěnku, Změnit typ, Číslo/Datum/Produkt, Upravit štítky.
- Toolbar: Filtrovat, Seřadit, Skrýt, Seskupit.
- Pills / zaoblení: `--monday-pill-radius: 8px` a `rounded-lg` (8px) v `weplan-monday.css` a u status pillů; progress v ProductCoverageGrid používá `rounded-lg`.

---

## Jak otestovat

### Board (1–8)

1. **Název nástěnky**  
   Otevři Board → klikni na název nástěnky (vlevo nahoře) → měl by se zobrazit input → zadej nový název → Enter nebo klik mimo → název se změní a po chvíli uloží (pokud je DB).

2. **Přidat skupinu (wizard)**  
   Dole v tabulce klikni **„+ Přidat skupinu“** → otevře se modal s polem „Název skupiny“ a výběrem barvy → zadej název (např. „V jednání“) → **Vytvořit skupinu** → skupina se objeví v boardu s daným názvem a barvou.

3. **Přejmenování skupiny**  
   Klikni na **název skupiny** (ne na menu) → zobrazí se input → změň název → Enter nebo blur → uloží se. Případně menu u skupiny → „Přejmenovat skupinu“.

4. **Sloupce**  
   - První sloupec má název **„Jméno klienta“** (ne Item).  
   - Menu u hlavičky sloupce (⋯) → **„Přejmenovat sloupec“** → název jde změnit.  
   - **„Změnit typ“** → submenu (Text, Číslo, Status, Datum, Produkt) → výběr typu změní buňky (text/number/status/date/product).  
   - **„Přidat sloupec vpravo“** → přidá se „Nový sloupec“.

5. **Řádky**  
   - Pod skupinou je tlačítko **„+ Nový řádek“** (ne „New item“).  
   - Klik na „+ Nový řádek“ → přidá se řádek s názvem **„Nový řádek“**.

6. **Editace buněk**  
   - **Textové buňky** (včetně Jméno klienta bez kontaktu): **jedno kliknutí** → režim úprav → piš → Enter uloží, Esc zruší.  
   - Ověř, že při kliknutí do buňky a psaní se text nemazání a focus neodchází (bez blur při kliku).

7. **Status dropdown**  
   Klik na status pill → menu zůstane otevřené → vyber jiný status → menu se zavře po výběru. Ověř, že se menu nezavře hned po prvním kliku.

8. **Persist**  
   Po změně názvu nástěnky, skupiny nebo sloupce (nebo typu sloupce) obnov stránku (s DB) → změny zůstanou.

### Úkoly (11–12)

9. **Vytvoření úkolu**  
   Úkoly → vyplň „Název“, v selectu vyber **Kontakt** a **Termín** (dropdown by neměl mizet po kliknutí) → Odeslat → úkol se objeví v seznamu.

### Kalendář (12–13)

10. **Vytvoření události**  
    Kalendář → **„+ Nová aktivita“** nebo klik na slot → vyplň název, vyber **Kontakt**, **Obchod**, **Připomenutí** (selecty by neměly hned mizet) → Vytvořit → událost se zobrazí.

### Kontakty (9–10)

11. **Smlouvy bez duplicitního Pokrytí**  
    Kontakt → záložka **Smlouvy** → sekce „Pokrytí produktů“ tam **není** (jen Finanční přehled, Pokrytí dle segmentu, Časová osa smluv, Platební instrukce).

12. **Přehled – Pokrytí produktů**  
    Kontakt → **Přehled** → sekce „Pokrytí produktů“ má ikonu u nadpisu, přehledný progress řádek a zarovnaný grid; klik na položku mění stav (Nic → Řeší se → Hotovo).

### Globální (14–16)

13. **Dropdowny**  
    V celé aplikaci: otevření dropdownu (status, sloupec, view, filtr, atd.) by nemělo po jednom kliku hned zmizet; zavření až po výběru, kliku mimo nebo ESC.

14. **Diakritika**  
    Board a toolbar: Jméno klienta, Nový řádek, Přidat skupinu, Plan rozděleno, Přejmenovat nástěnku, Změnit typ, Filtrovat, Seřadit, Skrýt, Seskupit, Upravit štítky.

15. **Pills**  
    Status pills a podobné prvky používají zaoblení cca 8px (`rounded-lg` / `--monday-pill-radius`), ne plně kulaté.

---

*Žádné BJ sloupce v defaultním boardu. „Item“ je všude nahrazen za „Jméno klienta“. Text „New item“ není – pouze „Nový řádek“ / „+ Nový řádek“ / „+ Přidat řádek“.*
