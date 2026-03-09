# Oprava dropdown / context menu – kompaktní panel

Fix all dropdown/context menus so the popover panel sizes to content only. Do not delete menu items or change action logic. Remove the layout bug causing oversized empty space in the menu panel.

---

## Příčina (root cause)

1. **Šířka panelu**  
   U `position: fixed` i `position: absolute` je containing block pro šířku viewport (fixed) nebo rodič (absolute). U blokového elementu bez nastavené šířky platí `width: auto` → element zabere celou šířku containing blocku. Dropdown panel tedy měl šířku 100 % viewportu (portály do `body`) nebo 100 % šířky rodiče (absolute menu u skupin), takže vpravo zůstávala velká prázdná plocha.

2. **Výška panelu**  
   Pokud je `body` (nebo jiný předek) flex kontejner a portálový div je jeho potomek, výchozí `align-self: stretch` způsobí, že se panel roztáhne na výšku flex kontejneru. To vedlo k velké prázdné ploše dole.

3. **Wrapper bez omezení**  
   Třídy `.wp-dropdown` a `.wp-popover` neměly `width: max-content`, takže panel se vždy roztáhl. U portálových panelů (ColumnHeader, CellStatus) nebyl použit žádný wrapper s omezením šířky/výšky.

---

## Co bylo změněno

### 1. Globální styly (weplan-monday.css, weplan-components.css)

- **`.wp-dropdown`**: přidáno `width: max-content`, `max-width: min(400px, 100vw)`, `box-sizing: border-box`. Panel je jen tak široký, jak vyžaduje obsah (s respektem k `min-width`), a nepřesáhne viewport.
- **`.wp-popover`, `.wp-menu`**: stejné úpravy v weplan-components.css.

Všechny dropdowny používající třídu `.wp-dropdown` nebo `.wp-popover` (BoardHeader view dropdown, GroupHeaderRow, CellProduct, UserMenu, ne‑portálové menu v ColumnHeader) se nyní velikostí řídí obsahem.

### 2. ColumnHeader.tsx (portálové menu sloupce)

- Portálový div (`#column-header-menu-portal`): přidány třídy `w-max`, `max-w-[min(400px,100vw)]`, `self-start`. Šířka podle obsahu, výška se neroztahuje v flex kontextu.

### 3. CellStatus.tsx (status dropdown + note popover)

- **Dropdown portál** (`#cell-status-dropdown-portal`): přidány `w-max`, `max-w-[260px]`, `self-start`. Zachován `min-w-[200px]`.
- **Note portál** (`#cell-status-note-portal`): přidány `w-max`, `max-w-[320px]`, `min-w-[240px]`, `self-start`.

### 4. BoardTable.tsx (menu skupiny „⋯”)

- Wrapper skupinového menu: přidáno `w-max max-w-[min(400px,100vw)]`, aby se panel neroztahoval na šířku rodiče.

---

## Proč to teď funguje správně

- **Šířka:** `width: max-content` (nebo Tailwind `w-max`) znamená, že panel má šířku podle obsahu; `min-width` zůstává platný. Žádné dědění 100 % šířky viewportu nebo rodiče.
- **Výška:** `align-self: flex-start` (`self-start`) u portálů znamená, že v flex layoutu se panel neroztahuje na výšku kontejneru a zůstane vysoký jen podle položek.
- **Konzistence:** Úprava `.wp-dropdown`/`.wp-popover` platí pro všechny takto označené dropdowny; portály a inline menu mají explicitně `w-max` a případně `self-start`.

---

## Komponenty, ve kterých byly změny

| Soubor | Změna |
|--------|--------|
| `weplan-monday.css` | `.wp-dropdown`: width: max-content, max-width, box-sizing |
| `weplan-components.css` | `.wp-popover`, `.wp-menu`, `.wp-dropdown`: width: max-content, max-width, box-sizing |
| `ColumnHeader.tsx` | Portálový panel: w-max, max-w, self-start |
| `CellStatus.tsx` | Oba portály (dropdown + note): w-max, max-w, self-start |
| `BoardTable.tsx` | Menu skupiny: w-max, max-w |

---

## Zachováno

- Všechny položky menu a jejich akce.
- Logika otevírání/zavírání, portály, pozicování (top/left).
- Padding, border-radius, shadow, hover stavy.
- Žádné mazání položek, žádný overflow hidden jako maskování.
