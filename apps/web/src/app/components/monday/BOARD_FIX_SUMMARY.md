# Board fix – Monday-style layout (oprava na místě)

Fix the existing board in place. Do not delete, hide, simplify, or replace columns. Preserve the full schema and only repair layout, sizing, scrolling, status rendering, summaries, and notes.

---

## A. Root cause (proč to bylo rozbité)

1. **Proč se sloupce rozjížděly**  
   Tabulka měla `w-full` a `table-layout: fixed`. Šířka tabulky tak byla 100 % scroll kontejneru. Sloupce z `<colgroup>` se pak braly jako podíly této 100% šířky a prohlížeč je mohl rozložit jinak než podle `col.width`. Header, body a footer tak nemusely sedět přesně pod sebou.

2. **Proč byl resize handle mimo čáru**  
   Resize byl uvnitř `<th>` s `right: 0` a `translateX(50%)`. Když měla tabulka šířku 100 % a sloupce se přerozdělily, pravý okraj sloupce nebyl na stejné pozici jako „logická“ hranice sloupce. Handle byl tedy vizuálně vedle dělící čáry.

3. **Proč se summary nepropsaly správně**  
   Stejný důvod jako u zarovnání: šířky buněk ve footeru závisely na rozložení tabulky. Když tabulka nebyla široká přesně jako součet sloupců, summary buňky neseděly přesně pod sloupci.

4. **Proč se board roztáhl doprava**  
   Obalující div měl `min-w-max w-full` – šířka obsahu byla „max-content“ a zároveň 100 %. Tabulka uvnitř `w-full` zabírala celou šířku kontejneru a mohla být širší než součet sloupců, takže board působil uměle roztáhlý.

---

## B. Co bylo změněno

### Komponenty

- **BoardTable.tsx**
  - **Single source of truth šířky:** `totalTableWidth = sum(visibleColumns.width) + ACTION_COLUMN_WIDTH`. Žádné další zdroje šířky.
  - **Scroll kontejner:** vnitřní wrapper má `style={{ width: totalTableWidth }}` (bez `min-w-max` a `w-full`). Šířka scrollovatelné oblasti = přesně součet sloupců.
  - **Tabulka:** `style={{ tableLayout: "fixed", width: totalTableWidth }}`, odstraněno `w-full`. Colgroup + thead/tbody/tfoot používají stejný column model.
  - **Header:** každé `<th>` má `width`, `minWidth`, `maxWidth` z `col` (nebo ACTION_COLUMN_WIDTH). Přidáno `overflow-visible` a `px-0` u neprvního sloupce kvůli resize.
  - **Footer:** každé `<td>` ve tfoot má `width`, `minWidth`, `maxWidth` podle sloupce. Summary bary sedí přesně pod sloupci.
  - **Řádek „Přidat klienta“:** první a akční buňka mají explicitní šířky pro zarovnání.

- **Row.tsx**
  - Všechny `<td>` (item, text, status, number, date, product, akce) mají `width`, `minWidth`, `maxWidth` z `col` (nebo `actionColumnWidth`).
  - Status buňka má třídu `monday-td-fullcell` pro pevnou výšku a vyplnění celé buňky.

- **ColumnHeader.tsx**
  - Resize handle zůstává `right: 0` + `translateX(50%)`. Díky pevné šířce tabulky a sloupců sedí přesně na hraně sloupce. Přidán `aria-label`.

- **weplan-monday.css**
  - `.monday-td-fullcell`: `height: 44px`, `min-height: 44px`, aby status buňka měla konstantní výšku a vnitřek (barva) vyplnil celou buňku.
  - `.monday-td > div` a `.monday-td > div > button`: `width: 100%`, `height: 100%` pro plné vyplnění buňky statusem.

### Status note

- **Zachováno a funguje:** `CellStatus` má `note`, `onNoteChange`; v dropdownu je „Přidat poznámku“ / „Poznámka (upravit)“ a portálový popover pro editaci. `PortalBoardView` předává `onCellNoteChange` do `BoardTable` → `Row` → `CellStatus`. Žádná změna v této funkci, pouze ověření.

---

## C. Co bylo zachováno

- **Žádný sloupec nebyl smazán.** Všechny sloupce z `visibleColumns` (item + ŽP, INV, HYPO, ÚVĚR, DPS, POV/HAV, NEM-DOM, ODP) zůstávají.
- **Data:** `items`, `cells`, `cellNotes`, skupiny a mapování sloupců beze změny.
- **Skupiny:** `groups`, `group.itemIds`, přidávání/skrývání skupin, barvy, přejmenování – vše zachováno.
- **Funkce:** resize sloupců, skrývání sloupců, footer summary, status dropdown, status note, akční sloupec, sticky první sloupec, horizontální scroll.

---

## D. Checklist

- [x] Všechny sloupce stále existují (žádný nebyl odstraněn ani skryt jako „řešení“).
- [x] Board se neroztahuje nesmyslně doprava – šířka = součet šířek sloupců + akční sloupec.
- [x] Horizontální scroll funguje – kontejner má `overflow-auto`, obsah má `width: totalTableWidth`.
- [x] Resize funguje – handle na hraně sloupce, změna šířky propisuje header/body/footer.
- [x] Header, body a footer sedí pod sebou – stejný column model (width/minWidth/maxWidth) v colgroup, thead, tbody, tfoot.
- [x] Summary bary jsou přesně pod správnými sloupci – footer buňky mají stejné šířky jako sloupce.
- [x] Status note existuje a funguje (dropdown → Přidat poznámku, popover, uložení přes `onCellNoteChange`).
- [x] Žádná funkcionalita nebyla odstraněna (footer, resize, status, summary zůstaly).
