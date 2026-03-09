# WePlan UI systém

Jednotný design systém aplikace WePlan (dashboard-inspired). Všechny styly jsou centralizované; nepoužívejte náhodné inline styly ani ad-hoc Tailwind třídy pro barvy/spacing/radius.

---

## 1. Design tokeny

Zdroj: `apps/web/src/styles/weplan-theme.css` (`:root`).

### Barvy
| Token | Popis | Výchozí |
|-------|--------|--------|
| `--wp-bg` | Pozadí aplikace | `#f3f6fd` |
| `--wp-surface` | Karty, panely | `#ffffff` |
| `--wp-border` | Ohraničení | `#e9ebf0` |
| `--wp-text` | Hlavní text | `#1f1c2e` |
| `--wp-text-muted` | Vedlejší text | `#4a4a4a` |
| `--wp-primary` | Primární (sidebar logo) | `#1f1c2e` |
| `--wp-link-hover-bg` | Hover pozadí odkazů/tlačítek | `#e9ecf7` |
| `--wp-link-active-bg` | Aktivní položka (sidebar) | `#1f1c2e` |
| `--wp-link-active` | Text na aktivní položce | `#ffffff` |
| `--wp-accent` | CTA tlačítka | `#0073ea` |
| `--wp-accent-hover` | Hover CTA | `#0060c0` |
| `--wp-success` / `--wp-warning` / `--wp-danger` | Sémantické barvy | — |

### Spacing (scale 4/8/12/16/24)
- `--wp-space-0` … `--wp-space-8` (0, 4px, 8px, 12px, 16px, 20px, 24px, 32px)

### Radius
- `--wp-radius-sm`: 8px  
- `--wp-radius`: 10px  
- `--wp-radius-lg`: 12px  
- `--wp-pill-radius`: 8px (pills/badges – snížené zaoblení)

### Shadow
- `--wp-shadow`: jeden jemný stín (`0 2px 6px rgba(...)`)

### Typografie
- `--wp-font`: Inter (nebo systém)
- `--wp-fs-xs` … `--wp-fs-2xl`: velikosti (12px–24px)
- `--wp-fw-normal` … `--wp-fw-bold`: váhy

### Zpětná kompatibilita
Staré tokeny `--monday-*` jsou aliasy na `--wp-*` (např. `--monday-bg`, `--monday-border`, `--monday-radius`). Board a existující komponenty je dál používají.

---

## 2. Komponentní primitives

Zdroj: `apps/web/src/styles/weplan-components.css`. Cíl: ~80 % UI sjednotit těmito třídami.

| Třída | Použití |
|-------|--------|
| **.wp-card** | Karty (Nástěnka, Nastavení, Obchody sloupce, Produkce boxy) |
| **.wp-table** | Tabulky (Kontakty, Domácnosti, Úkoly, Produkce) – border, thead, hover |
| **.wp-toolbar** | Horní lišty, filtry, akce nad tabulkou |
| **.wp-btn** | Základ tlačítka |
| **.wp-btn-primary** | Primární akce (modré) |
| **.wp-btn-ghost** | Sekundární / odkazový vzhled |
| **.wp-btn.active** | Aktivní stav (např. filtr „Dnes“ v Úkolech) |
| **.wp-input** | Textové inputy |
| **.wp-select** | Selecty |
| **.wp-pill** | Status/label pills (sjednocený radius, výška, padding) – Board status, Nastavení badge |
| **.wp-popover** / **.wp-menu** | Rozbalovací menu, dropdowny (Board sloupce, status menu) |
| **.wp-empty-state** | Kontejner pro prázdný stav (EmptyState komponenta) |
| **.wp-skeleton** | Placeholder při načítání |

### Layout
| Třída | Použití |
|-------|--------|
| **.wp-app-container** | Kořen portálu (pozadí, font) |
| **.wp-app-header** | Horní lišta portálu |
| **.wp-app-content** | Oblast obsahu pod headerem |
| **.wp-sidebar** | Boční navigace |
| **.wp-sidebar-link** / **.wp-sidebar-link.active** | Položky sidebaru |
| **.wp-page** | Stránkový kontejner (padding, max-width) |

---

## 3. Pravidla

- **Radius:** Používej pouze `--wp-radius-sm`, `--wp-radius`, `--wp-radius-lg`, `--wp-pill-radius`. Žádné `rounded-2xl` / `rounded-full` pro karty a pills.
- **Shadow:** Jedna jemná `--wp-shadow`; nepřidávej další stíny k běžným kartám.
- **Spacing:** Scale 4/8/12/16/24; mezi sekcemi raději `var(--wp-space-4)` / `var(--wp-space-6)`.
- **Barvy:** Text a pozadí vždy z tokenů (`--wp-text`, `--wp-text-muted`, `--wp-surface`, `--wp-border`).
- **Komponenty:** Preferuj `.wp-card`, `.wp-table`, `.wp-btn`, `.wp-input`, `.wp-pill`, `.wp-popover` před vlastními kombinacemi Tailwind.

---

## 4. Výjimky

- **AI asistent** (floating tlačítko a search bar v pravém dolním rohu) může mít vlastní vizuální styl pro odlišení od hlavní aplikace; nemusí striktně používat `.wp-btn` / tokeny.
- **Board** zůstává „dense grid“ (Monday-like): sticky header, první sloupec, malé fonty. Používá `weplan-monday.css` a tokeny `--monday-*` (aliasy na `--wp-*`). Status buňky a dropdowny jsou sjednoceny s design systémem (`.wp-pill`, `.wp-popover`).

---

## 5. Pořadí importů (layout)

V root layoutu (`apps/web/src/app/layout.tsx`):

1. `globals.css`  
2. `monday.css`  
3. `weplan-theme.css`  
4. `weplan-components.css`  

Tím se tokeny a komponenty aplikují globálně a přepíší staré monday tokeny tam, kde jsou aliasy.
