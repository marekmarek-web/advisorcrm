# WePlan v0.2 – Bugfix & UX Rework – dodání

## 1) BOARD

### 1a) Název boardu editovatelný
- **Kde:** `apps/web/src/app/components/monday/BoardHeader.tsx`
- **Změny:** Název je zobrazen jako kliknutelný text (span s `cursor-text`). Klik otevře input. **Enter** uloží, **Esc** zruší a obnoví původní hodnotu, **blur** (klik mimo) uloží. `onViewNameChange` volá persist (v `PortalBoardView` je napojen na `updateBoardViewName` při `dbViewId`).
- **Test:** Board → klikni na název „Plán rozděleno“ → zobrazí se input → zadej nový název → Enter nebo klik mimo → název se změní. Esc před uložením vrátí původní text.

### 1b) Přejmenování skupiny
- **Kde:** `apps/web/src/app/components/monday/GroupHeaderRow.tsx`
- **Změny:** Klik na název skupiny zapne inline edit. **Esc** zruší a obnoví `editVal` na původní `name`. Menu „Přejmenovat skupinu“ dál funguje.
- **Test:** Klikni na název skupiny (např. „Nové“) → uprav název → Enter uloží, Esc zruší. Diakritika v názvech zůstává.

### 1c) Typy sloupců (datum, číslo, produkt)
- **Kde:**  
  - `apps/web/src/app/components/monday/Row.tsx` – už renderuje `CellDate`, `CellNumber`, `CellProduct` dle `col.type`.  
  - `apps/web/src/app/components/monday/CellProduct.tsx` – **přepsáno:** po kliku se otevře popover s **ProductPicker** (Partner → Produkt), tlačítka „Použít“ / „Zrušit“, hodnota se ukládá jako řetězec „partnerName – productName“.  
  - `CellDate` / `CellNumber` – beze změny logiky (datum = date input, číslo = numeric + prázdné).
- **Test:** Menu sloupce → „Změnit typ“ → zvol Datum / Číslo / Produkt. V buňkách: datum = date picker, číslo = číselný input (prázdné = prázdné), produkt = klik otevře výběr Partner + Produkt → Použít uloží.

### 1d) Přejmenování sloupců, výchozí „Jméno klienta“
- **Kde:**  
  - `apps/web/src/app/actions/board.ts` – `DEFAULT_COLUMNS`: první sloupec má `title: "Jméno klienta"` (ne „Item“). BJ sloupce v defaultu **nejsou**.  
  - `apps/web/src/app/components/monday/ColumnHeader.tsx` – menu „Přejmenovat sloupec“ zapne editaci; **Esc** zruší a vrátí `renameVal` na `column.title`.
- **Test:** Menu (⋯) u sloupce → „Přejmenovat sloupec“ → změň název → Enter uloží, Esc zruší. První sloupec má v novém boardu výchozí název „Jméno klienta“.

### 1e) Dropdowny nemizí po kliknutí
- **Kde:** `apps/web/src/app/components/TooltipBlurListener.tsx`
- **Změny:** Přidána výjimka: kliknutí uvnitř **`.wp-dropdown`** nebluruje aktivní prvek. Výjimky už byly pro select/option/input/textarea a `[role="listbox"]` / `[role="menu"]`.
- **Test:** Board → otevři menu sloupce (⋯) nebo status v buňce → dropdown zůstane otevřený, výběr položky nebo klik mimo / Esc ho zavře.

### 1f) Sticky první sloupec, scroll jen tabulka
- **Kde:**  
  - `apps/web/src/app/components/monday/BoardTable.tsx` – kontejner s tabulkou má `pl-4` (odsazení zleva).  
  - `apps/web/src/styles/weplan-monday.css` – `.monday-sticky-first-col` a `.monday-sticky-corner` mají `box-shadow: 2px 0 6px -2px rgba(...)` aby při horizontálním scrollu nevznikal layout shift.
- **Test:** Board s více sloupci → horizontální scroll jen v oblasti tabulky, první sloupec zůstává vlevo s odsazením, nezatahuje celou stránku.

---

## 2) ÚKOLY

### 2a) Vytvoření úkolu
- **Kde:** `apps/web/src/app/portal/tasks/page.tsx`
- **Změny:** `handleCreate` beze změny logiky (volá `createTask`, při úspěchu resetuje formulář a `reload()`). Globálně: **TooltipBlurListener** nebluruje při kliku do inputu/selectu a **BaseModal** (pokud by se použil) zavírá na mouseup na overlay, takže selecty v formulářích by neměly mizet. Formulář má `onSubmit={handleCreate}`, tlačítko `type="submit"`.
- **Test:** Úkoly → vyplň „Nový úkol…“, volitelně Kontakt a Termín → klik „+ Přidat“. Úkol se uloží a objeví v listu. Při chybě se zobrazí `createError`.

### 2b) Pill / select u kontaktu
- **Kde:** `apps/web/src/app/portal/tasks/page.tsx`
- **Změny:** Přidána třída `selectCls`: `min-h-[40px]`, `rounded-[var(--monday-radius)]`, `text-[13px]`, stejné ohraničení a focus jako inputy. Použita u selectů „Kontakt“ (nový úkol i edit řádku).
- **Test:** Formulář nového úkolu a editace úkolu – výběr kontaktu má větší, čitelnější výběr (pill styling).

---

## 3) KALENDÁŘ

### 3a) Event card – název, klient, čas, vizuální „handle“
- **Kde:** `apps/web/src/app/portal/PortalCalendarView.tsx`
- **Změny:** Karta události v týdenním view: `rounded-[var(--monday-radius)]`, `border-l-2 border-white/40` jako vizuální „handle“. Zobrazení: ikona, **čas** (tučně), **název** (řádek), **klient** (řádek, menší). Tooltip s typem, názvem, klientem a časem.
- **Test:** Kalendář → Týden → událost zobrazuje čas, název a klienta, levý okraj vypadá jako „úchop“.

### 3b) Režim „Pracovní týden“ (Po–Pá)
- **Kde:** `apps/web/src/app/portal/PortalCalendarView.tsx`
- **Změny:** Přidán `ViewMode = "month" | "week" | "workweek"`. Přepínač: **Týden** | **Pracovní týden** | **Měsíc**. Pracovní týden: `weekDays` má 5 dní, `rangeEnd` +5, navigace po 5 dnech, header „X. týden – … (Po–Pá)“.
- **Test:** Kalendář → „Pracovní týden“ → zobrazí se jen Po–Pá, So/Ne chybí.

### 3c) Dropdowny v kalendáři
- **Kde:** Stejný globální fix jako 1e (TooltipBlurListener + `.wp-dropdown`). Formulář „Nová aktivita“ používá nativní `<select>` a BaseModal (zavírání na mouseup na overlay).
- **Test:** Nová aktivita → výběr Kontakt / Obchod / Připomenutí – dropdown zůstane otevřený až do výběru nebo kliku mimo.

---

## 4) PŘEHLED → OBCHODY

### 4a) Proklik na Obchody
- **Kde:** `apps/web/src/app/components/contacts/ProductCoverageGrid.tsx` – odkaz „Obchody →“ na `href={/portal/contacts/${contactId}#obchody}`. `ContactTabLayout` (`apps/web/src/app/portal/contacts/[id]/ContactTabLayout.tsx`) už na `hashchange` a při načtení volá `readHash()` a nastaví `activeId` podle `#obchody`.
- **Test:** Kontakt → záložka Přehled → v sekci „Pokrytí produktů“ klik na „Obchody →“. Otevře se záložka Obchody téhož kontaktu.

### 4b) Jednotný design gridů
- **Kde:** `apps/web/src/styles/weplan-monday.css`
- **Změny:** Přidány třídy **`.wp-grid-card`** (border, border-radius, background, shadow) a **`.wp-grid-header-row`** (header řádek). Design tokeny: `--monday-radius`, `--monday-border`, `--monday-shadow`. Komponenty (Board, tabulky) už používají `monday-*` třídy; nové gridové sekce lze sjednotit přidáním `wp-grid-card` / `wp-grid-header-row`.
- **Test:** Vizuální konzistence – karty a tabulky s jednotným radius a stínem.

---

## 5) GLOBÁLNÍ

### 5a) Stejné rozložení gridů
- Board: `BoardTable` + `monday-cell-sep`, sticky header, pl-4.  
- Přidány `.wp-grid-card` a `.wp-grid-header-row` pro další obrazovky.  
- Kalendář: grid s `weekDays.length` sloupci, `rounded-[var(--monday-radius)]`.

### 5b) Diakritika
- Board: výchozí názvy „Jméno klienta“, „Plan rozděleno“, „Nové“, „Rozpracované“, „Úvěr/Kons..“, menu „Přejmenovat sloupec“, „Změnit typ“, „Přidat skupinu“, „Nový řádek“.  
- Toolbar: Filtrovat, Seřadit, Skrýt, Seskupit.  
- Kalendář: „Pracovní týden“, „Dnes“, „Nová aktivita“.

### 5c) Pills – menší radius
- `:root` má `--monday-pill-radius: 8px` a `--monday-radius: 8px`.  
- Event karty v kalendáři a tlačítka používají `rounded-[var(--monday-radius)]`.  
- Status pills (CellStatus) už mají `rounded-lg` (8px).

---

## Seznam změněných souborů

- `apps/web/src/app/components/monday/BoardHeader.tsx` – 1a Escape revert
- `apps/web/src/app/components/monday/GroupHeaderRow.tsx` – 1b Escape revert
- `apps/web/src/app/components/monday/ColumnHeader.tsx` – 1d Escape revert, 1e (menu mouseup už bylo)
- `apps/web/src/app/components/monday/BoardTable.tsx` – 1f pl-4
- `apps/web/src/app/components/monday/CellProduct.tsx` – 1c ProductPicker v popoveru
- `apps/web/src/app/components/TooltipBlurListener.tsx` – 1e, 3c `.wp-dropdown` výjimka
- `apps/web/src/styles/weplan-monday.css` – 1f sticky shadow, 4b wp-grid-card, wp-grid-header-row
- `apps/web/src/app/portal/tasks/page.tsx` – 2a, 2b selectCls a pill styling
- `apps/web/src/app/portal/PortalCalendarView.tsx` – 3a event card, 3b Pracovní týden
- `apps/web/src/app/actions/board.ts` – výchozí „Jméno klienta“, bez BJ (již bylo)

---

## Rychlý test (krok za krokem)

1. **Board:** Otevři Board → klikni na název nástěnky → změň → Enter. Klikni na název skupiny → změň → Esc zruší. Menu sloupce → Změnit typ → Produkt → v buňce klikni → vyber Partner + Produkt → Použít. Otevři status v buňce → vyber položku (dropdown nemizí hned). Scrolluj vpravo – první sloupec zůstane vlevo s odsazením.
2. **Úkoly:** Zadej název úkolu, vyber kontakt (větší select), klik „+ Přidat“ → úkol se objeví v listu.
3. **Kalendář:** Přepni na „Pracovní týden“ → jen Po–Pá. Událost zobrazuje čas, název, klienta a levý „handle“. Nová aktivita → selecty Kontakt/Obchod zůstanou otevřené.
4. **Kontakt Přehled:** Klik „Obchody →“ v Pokrytí produktů → přepne na záložku Obchody.

BJ není v defaultním boardu. Nové featury (drag-resize událostí, plná integrace wp-grid-card do všech stránek) nebyly přidány – jen opravy a konzistence UI.
