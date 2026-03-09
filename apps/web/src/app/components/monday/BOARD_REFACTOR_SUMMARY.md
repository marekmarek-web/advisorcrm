# Board view refaktor – Monday-style (shrnutí)

## Co bylo špatně (root cause)

1. **Různé zdroje šířek**  
   Hlavička používala pevné hodnoty (`280px` první sloupec, `120px` ostatní, `60px` Akce), řádky v `Row` měly první sloupec `280px` a zbytek `col.width`, footer/summary měl zase `w-[280px]`, `w-[120px]`, `w-[60px]`. Žádná společná definice → sloupce se rozjížděly.

2. **Více horizontálních scrollů**  
   Každá skupina měla vlastní `overflow-x-auto` kolem tabulky. Footer (progress bary) byl mimo scroll, s vlastním flex layoutem a pevnými šířkami → summary nebylo pod sloupci a nescrollovalo se společně.

3. **Resize**  
   Resize handle byl v pořádku, ale šířky po změně nebyly jednotně aplikované (header/body/footer měly různé zdroje). Chyběly `minWidth`/`maxWidth` pro sloupce.

4. **Status note**  
   Nebyla implementovaná (ani typ, ani UI, ani indikace).

5. **Footer summary**  
   Byl mimo tabulku, s vlastními šířkami → nezarovnaný se sloupci a nescrollující s tabulkou.

---

## Co se změnilo

### 1. Centrální model sloupců (`types.ts`, `seed-data.ts`)

- **Column**: přidány `minWidth?`, `maxWidth?`, `sticky?`, `hasSummary?`, `supportsNote?`. Všechny šířky se berou z `column.width` (a případně min/max při resize).
- **Item**: přidáno `cellNotes?: Record<string, string>` pro poznámky ke status buňkám.
- **seed-data**: první sloupec má `width: 280`, status sloupce `width: 120`, `minWidth: 60`, `maxWidth: 200`; u status sloupců `hasSummary: true`, `supportsNote: true`.

### 2. Jedna šířka pro header / buňky / footer (`BoardTable.tsx`)

- **colgroup**: Každá tabulka má `<colgroup>` s jedním `<col>` na každý `visibleColumns` a jeden na akční sloupec (`ACTION_COLUMN_WIDTH = 60`). Šířky pouze z `col.width` a konstanty.
- **thead**: `<th>` už nemají hardcoded `280`/`120` – používají `style={{ width: col.width, minWidth: col.width }}` z modelu.
- **tbody**: `Row` dostává `visibleColumns` a používá u všech buněk `col.width` (včetně prvního sloupce).
- **tfoot**: Summary řádek je součástí tabulky (`<tfoot>`). První buňka je sticky (první sloupec), další odpovídají sloupcům z `visibleColumns.slice(1)`, poslední je akční sloupec. Šířky určuje stejný colgroup → footer je přesně pod sloupci a scrolluje s tabulkou.
- Odstraněn samostatný „progress bar“ blok pod tabulkou s pevnými `w-[280px]`/`w-[120px]`.

### 3. Jeden horizontální scroll

- U každé skupiny odstraněn vlastní `overflow-x-auto`.
- Celý obsah boardu (všechny skupiny) je v jednom scrollovatelném kontejneru (`overflow-auto` na rodiči). Header, tělo i tfoot každé tabulky scrollují společně. První sloupec zůstává sticky (`sticky-col` / `sticky-col-th`).

### 4. Resize (`ColumnHeader.tsx`)

- Při resize se používá `column.minWidth ?? 60` a `column.maxWidth ?? 400`. Změna šířky jde do `onColumnResize` → aktualizuje se `view.columns` → všechny části tabulky (colgroup, thead, tbody, tfoot) berou novou šířku z téhož modelu.
- Resize handle zůstává na pravém okraji buňky (`right: 0`), šířka 6px (`w-1.5`), hover zvýraznění.

### 5. Status buňky (`Row.tsx`, `CellStatus.tsx`)

- Všechny buňky včetně prvního sloupce používají `col.width`. Status buňka má `fullCell` a vyplňuje celou plochu (`w-full h-full`, `rounded-none`).
- Žádné vlastní margin/translate pro dorovnání – šířka z tabulky/colgroup.

### 6. Status note (`CellStatus.tsx`, `PortalBoardView.tsx`)

- V dropdownu stavu je položka „Přidat poznámku“ / „Poznámka (upravit)“.
- Klik otevře popover (portal) s textarea; uložení volá `onNoteChange(note)`.
- V `PortalBoardView` je `onCellNoteChange`: aktualizuje `board.items[itemId].cellNotes[columnId]`.
- V buňce se zobrazí indikace (ikona), pokud `note` existuje.

---

## Proč to teď funguje správně

- **Zarovnání**: Jediný zdroj šířek je `visibleColumns[].width` (+ konstantní šířka akčního sloupce). Colgroup, thead, tbody a tfoot ji všude používají → hlavička, buňky a footer jsou v jedné vertikální ose.
- **Resize**: Změna šířky jde do stavu view → colgroup a všechny buňky se překreslí se stejnou šířkou; handle je na hraně sloupce; min/max omezují rozsah.
- **Scroll**: Jeden scroll kontejner; sticky jen první sloupec; header, body a footer jsou v jedné tabulce → scrollují synchronně.
- **Summary**: Je v `<tfoot>` se stejným colgroup → šířky a pozice odpovídají sloupům; při scrollu je footer vždy pod správným sloupcem.
- **Note**: Data v `item.cellNotes`, UI v dropdownu + popover; po uložení je v buňce indikace.

---

## Upravené komponenty

| Soubor | Změny |
|--------|--------|
| `types.ts` | Rozšíření `Column` (minWidth, maxWidth, sticky, hasSummary, supportsNote), `Item` (cellNotes). |
| `seed-data.ts` | Šířky a nové vlastnosti u sloupců (280/120, min/max, hasSummary, supportsNote). |
| `BoardTable.tsx` | Colgroup, tfoot místo samostatného footeru, jedna šířka ze sloupců, jeden scroll, odstranění per-group overflow, `onCellNoteChange`, `ACTION_COLUMN_WIDTH`. |
| `Row.tsx` | První sloupec s `col.width`, `onCellNoteChange`, `actionColumnWidth`, předání `note`/`onNoteChange` do `CellStatus`. |
| `ColumnHeader.tsx` | Resize s min/max z column, handle 6px na pravém okraji. |
| `CellStatus.tsx` | `note`, `onNoteChange`, položka v dropdownu pro poznámku, popover s textarea, indikace v buňce, zavření při Escape/click outside. |
| `PortalBoardView.tsx` | `onCellNoteChange` a předání do `BoardTable`. |

---

## Checklist pro ruční ověření

- [ ] **Zarovnání**  
  Hlavička a buňky jsou přesně pod sebou (žádné „ujíždění“). Změna šířky sloupce (resize) se projeví v hlavičce, všech buňkách i v summary řádku.

- [ ] **Resize**  
  Úchop je na pravém okraji sloupce (ne vedle). Při tažení se šířka mění v reálném čase; po puštění zůstává celý sloupec (včetně footeru) stejně široký. Resize nelze stáhnout pod min ani nad max.

- [ ] **Status buňky**  
  Barva statusu vyplňuje celou buňku (bez bílých okrajů nebo zkrácení). Text je vystředěný. Prázdný stav je neutrální (šedá + ikona).

- [ ] **Footer / summary**  
  Barevné pruhy pod skupinou jsou přesně pod příslušnými status sloupci. Při horizontálním scrollu se posunují společně s hlavičkou a tělem tabulky.

- [ ] **Horizontální scroll**  
  Board jde plynule scrollovat doprava. První sloupec zůstává vlevo, zbytek se posouvá. Header, body i footer scrollují společně (žádné „stojící“ části).

- [ ] **Status note**  
  Klik na status → dropdown → „Přidat poznámku“ / „Poznámka (upravit)“ → popover s textarea. Uložení uloží text; v buňce je indikace (ikona), že má poznámku. Zavření Escape nebo klik mimo.

- [ ] **Celkový dojem**  
  Chování a vizuál odpovídají referenci (Monday board): přesné mřížkové zarovnání, plynulý resize, status přes celou buňku, souhrny pod sloupci, poznámky u statusu, hladký horizontal scroll.
