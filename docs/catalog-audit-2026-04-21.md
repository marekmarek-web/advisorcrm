# Audit katalogu: Segmenty → Partneři → Produkty (2026-04-21)

Tento dokument je kompletní inventář katalogu partnerů/produktů používaného v Aidvisora CRM
(`ProductPicker`, `ManualPaymentSetupModal`, AI Review, top-lists, BJ kalkulace).
Slouží jako podklad pro úklidový PR — všechny zde vyjmenované chyby se opravují v rámci
commitu `catalog-dedup-partners-products-2026-04-21`.

## Zdroje pravdy (před úklidem)

Katalog je rozstřelený do tří souborů, které se neshodují:

| # | Soubor | Role | Segmenty | Poznámka |
|---|--------|------|----------|----------|
| 1 | [packages/db/src/schema/contracts.ts](../packages/db/src/schema/contracts.ts) | Autoritativní TS enum `contractSegments` + `SEGMENT_LABELS` | **12** | bez `ZDRAV` |
| 2 | [apps/web/src/app/lib/segment-labels.ts](../apps/web/src/app/lib/segment-labels.ts) | Client-safe kopie `SEGMENT_LABELS` pro `"use client"` moduly | **12** | musí zůstat shodná s #1 |
| 3 | [packages/db/src/catalog.json](../packages/db/src/catalog.json) | JSON seed partnerů/produktů → DB přes `seed-catalog.mjs` | **13** | `ZDRAV` navíc (0 partnerů) |
| 4 | [packages/db/src/data/top-lists-seed-v2.json](../packages/db/src/data/top-lists-seed-v2.json) | TOP 10 pojišťoven / bank / atd. pro UI | **13** | `ZDRAV` navíc |
| 5 | [apps/web/src/app/lib/segment-hierarchy.ts](../apps/web/src/app/lib/segment-hierarchy.ts) | `segmentToCaseType` pro terminace | **13** | `ZDRAV → "pojištění"` |

Po úklidu: **všech 5 zdrojů = 12 segmentů**, `ZDRAV` odstraněno.

## Kanonický seznam segmentů (po úklidu)

| Kód | Label |
|-----|-------|
| ZP | Životní pojištění |
| MAJ | Majetek |
| ODP | Odpovědnost |
| AUTO_PR | Auto – povinné ručení |
| AUTO_HAV | Auto – havarijní pojištění |
| CEST | Cestovní pojištění |
| INV | Investice |
| DIP | Dlouhodobý investiční produkt (DIP) |
| DPS | Doplňkové penzijní spoření (DPS) |
| HYPO | Hypotéky |
| UVER | Úvěry |
| FIRMA_POJ | Pojištění firem |

## Rozhodnutí: ZDRAV (Zdraví / úraz / nemoc)

**Rozhodnutí: ODSTRANIT.**

Důvody:

1. `ZDRAV` **není** součástí `contractSegments` v DB schema → žádná nová smlouva
   nemohla být vytvořena s tímto segmentem.
2. `segment-classifier.ts` (heuristika navrhující segment) nemá žádné pravidlo
   pro `ZDRAV` — nikdy ho neprodukuje.
3. V `catalog.json` je `ZDRAV` pouze v `categories`, ale **žádný partner** ho nepoužívá
   (`catalog` pole neobsahuje jediný záznam s `category: "ZDRAV"`).
4. V `top-lists-seed-v2.json` je `ZDRAV` pouze v `segments`, ale **žádný TOP list**
   ho nepoužívá.
5. Úrazové a nemocenské pojištění se reálně evidují pod `ZP` (životní pojištění)
   jako součást hlavních produktových balíčků (`Pillow → Pojištění úrazu a nemoci`,
   `NEON`, `FLEXI`, …).

Produkční ověření před spuštěním migrace: `SELECT COUNT(*) FROM contracts WHERE segment = 'ZDRAV';`
musí vrátit `0`. Migrace obsahuje guard, který selže, pokud najde nenulový počet.

## Inventář: Segment → Partner → Produkty (STAV PŘED ÚKLIDEM)

Tabulka reflektuje obsah `packages/db/src/catalog.json` v revizi před úklidovým
commitem. Duplicity a chyby jsou označené `⚠`, placeholdery `⚡`.

### ZP — Životní pojištění

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Allianz pojišťovna | Allianz ŽIVOT -M-, Allianz ŽIVOT -Ž-, **Život** | ⚡ třetí položka „Život" je generický placeholder |
| ČPP | NEON | — |
| ČSOB pojišťovna | TBD - ČSOB (doplnit z dropdownu) | ⚡ jediný TBD |
| Komerční pojišťovna | Elán | — |
| Kooperativa | FLEXI | — |
| Maxima | MaxEfekt | — |
| MetLife | Garde, Garde Risk, OneGuard | — |
| NN Životní pojišťovna | Orange | — |
| Pillow | Pojištění úrazu a nemoci | ⚠ záznam pro Pillow/ZP je v catalog rozdělen na dva objekty |
| Pillow | URAN | ⚠ druhý objekt stejného (Pillow, ZP) |
| Uniqa | Život & Radost | ⚠ **duplikát** s UNIQA/ZP |
| UNIQA | Život & Radost | ⚠ **duplikát** s Uniqa/ZP |

### MAJ — Majetek

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Allianz pojišťovna | Allianz MůjDomov (domácnost/nemovitost/majetek+odpovědnost) | — |
| ČPP | TBD - ČPP Majetek (doplnit z dropdownu) | ⚡ |
| ČSOB pojišťovna | TBD - ČSOB Majetek (doplnit z dropdownu) | ⚡ |
| Direct | TBD - Direct Majetek (doplnit z dropdownu) | ⚡ |
| Kooperativa | TBD - Kooperativa Majetek (doplnit z dropdownu), Pojištění majetku (domácnost/nemovitost) – produktové řady dle webu/partnera (TBD) | ⚡ duplikát TBD placeholderu |
| Maxima | TBD - doplnit z dropdownu | ⚡ |
| Pillow | TBD - Pillow Majetek (doplnit z dropdownu) | ⚡ |
| Uniqa | TBD - UNIQA Majetek (doplnit z dropdownu) | ⚠ duplikát partnera + ⚡ TBD |
| UNIQA | Pojištění bytu a domácnosti (balíčky MINI/PLUS/EXTRA), Pojištění domu a domácnosti (balíčky MINI/PLUS/EXTRA) | ⚠ duplikát partnera (reálné produkty) |

### ODP — Odpovědnost

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Allianz pojišťovna | Allianz MůjDomov – odpovědnost (součást balíčků) | — |
| ČPP | TBD - ČPP Odpovědnost (doplnit z dropdownu) | ⚡ |
| Direct | TBD - Direct Odpovědnost (doplnit z dropdownu) | ⚡ |
| Kooperativa | TBD - Kooperativa Odpovědnost (doplnit z dropdownu), Odpovědnost – obvykle součást majetkového pojištění (TBD) | ⚡ duplikát TBD |
| Pillow | TBD - Pillow Odpovědnost (doplnit z dropdownu) | ⚡ |
| Uniqa | TBD - UNIQA Odpovědnost (doplnit z dropdownu) | ⚠ duplikát + ⚡ |
| UNIQA | Pojištění odpovědnosti (balíčky PLUS/EXTRA) | ⚠ duplikát |

### AUTO_PR — Auto povinné ručení

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Allianz pojišťovna | Povinné ručení | — |
| ČPP | TBD - ČPP POV (doplnit z dropdownu) | ⚡ |
| Direct | TBD - Direct POV (doplnit z dropdownu) | ⚡ |
| Kooperativa | TBD - Kooperativa POV (doplnit z dropdownu) | ⚡ |
| Maxima | TBD - doplnit z dropdownu | ⚡ |

### AUTO_HAV — Auto havarijní

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Allianz pojišťovna | Havarijní pojištění (balíčky PLUS/EXTRA/MAX) | — |
| ČPP | TBD - ČPP HAV (doplnit z dropdownu) | ⚡ |
| Direct | TBD - Direct HAV (doplnit z dropdownu) | ⚡ |
| Kooperativa | TBD - Kooperativa HAV (doplnit z dropdownu) | ⚡ |
| Maxima | TBD - doplnit z dropdownu | ⚡ |

### CEST — Cestovní pojištění

**0 partnerů.** V UI ProductPicker se při zvolení CEST zobrazí prázdný dropdown.

### INV — Investice

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Amundi | Fondy a ETF (Amundi) | — |
| ATRIS | Investiční fondy ATRIS (TBD) | ⚡ |
| Avant | SICAV / fondy AVANT (TBD) | ⚡ |
| Conseq | Active Invest - Dynamický, Active Invest - Konzervativní, Active Invest - Vyvážený, Classic Invest | ⚠ top-lists má závorky místo pomlček |
| CREIF (DRFG) | Czech Real Estate Fund (CREIF) | — |
| Cyrrus | Investiční služby (brokers/portfolia) – produktové názvy dle nabídky (TBD) | ⚡ |
| Edward | Investiční účty EDWARD | — |
| EIC | Investiční účty EIC | — |
| Ibis | iiplan | — |
| Investika | INVESTIKA realitní fond (otevřený podílový fond) | ⚠ duplikát partnera (casing) |
| INVESTIKA | EFEKTIKA, fond akciových trhů, INVESTIKA realitní fond, otevřený podílový fond | ⚠ duplikát partnera + duplikát produktu (realitní fond) napříč |
| J&T | Investiční služby / fondy J&T (TBD) | ⚡ |
| Moventum | Investiční platforma Moventum (TBD) | ⚡ |

### DIP — Dlouhodobý investiční produkt

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Amundi | DIP (Amundi) | — |

### DPS — Doplňkové penzijní spoření

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Allianz PS | Doplňkové penzijní spoření (III. pilíř) | — |
| Conseq penzijní společnost | Doplňkové penzijní spoření (DPS) | — |
| Česká spořitelna PS | Doplňkové penzijní spoření (DPS) | — |
| ČSOB PS | Doplňkové penzijní spoření (DPS) | — |
| KB Penzijní společnost | Doplňkové penzijní spoření (DPS) | — |
| NN Penzijní společnost | Doplňkové penzijní spoření (DPS) | — |

### HYPO — Hypotéky

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Česká spořitelna | Hypotéka (produktová řada) | — |
| ČSOB | Hypotéka (produktová řada) | ⚠ duplikát pokrytí s ČSOB Hypoteční banka |
| ČSOB Hypoteční banka | Hypotéky (TBD) | ⚠ duplikát pokrytí + ⚡ TBD |
| Komerční banka | Hypotéka, Hypotéka na udržitelné bydlení | — |
| mBank | mHypotéka (produktová řada – TBD) | ⚡ |
| Moneta | Hypotéka, Americká hypotéka | — |
| Oberbank | Hypotéky (produktová řada – TBD) | ⚡ |
| Raiffeisenbank | TBD - RB Hypotéka (doplnit z dropdownu), Hypotéka na bydlení (Klasik), Hypotéka naruby, Výstavba montovaného domu, Refinancování hypotéky, Hypotéka na pronájem, Hypotéka na cokoliv | ⚡ první TBD placeholder zbytečný vedle reálných |
| RSTS | TBD - RSTS Hypotéka/úvěry (doplnit z dropdownu) | ⚡ nesmí být mix HYPO/UVER v jednom TBD |
| UniCredit | U hypotéka (účelová), U hypotéka (kombinovaná), Hypotéka pro mladé | — |

### UVER — Úvěry

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Česká spořitelna | Spotřebitelský úvěr (TBD) | ⚡ |
| ČSOB | Spotřebitelský úvěr (TBD) | ⚡ |
| Komerční banka | Spotřebitelské úvěry (TBD) | ⚡ |
| mBank | TBD - doplnit z dropdownu | ⚡ |
| Oberbank | Úvěry (TBD) | ⚡ |
| Raiffeisenbank | TBD - RB Úvěr (doplnit z dropdownu) | ⚡ |
| Raiffeisen Leasing | Leasing / financování (TBD) | ⚡ |
| UniCredit | PRESTO Business (hypo pro podnikatele – dle nabídky) | — |

### FIRMA_POJ — Pojištění firem

| Partner | Produkty | Chyby |
|---------|----------|-------|
| Direct | TBD - Direct Pojištění firem (doplnit z dropdownu) | ⚡ |
| Uniqa | TBD - UNIQA Pojištění firem (doplnit z dropdownu) | ⚠ duplikát + ⚡ |

---

## Souhrn zjištěných chyb

### 1. Duplicitní partneři (case mismatch)

| Duplikát A | Duplikát B | Segmenty | Kanonický název po úklidu |
|------------|------------|----------|---------------------------|
| `Investika` | `INVESTIKA` | INV | **INVESTIKA** (oficiální branding) |
| `Uniqa` | `UNIQA` | FIRMA_POJ, MAJ, ODP, ZP | **UNIQA** (oficiální branding) |

### 2. Duplicitní produkty (stejný partner + segment)

| Partner | Segment | Duplikáty | Akce |
|---------|---------|-----------|------|
| UNIQA | ZP | `Život & Radost` (2×) | ponechat 1× |
| INVESTIKA | INV | `INVESTIKA realitní fond (otevřený podílový fond)` vs `INVESTIKA realitní fond, otevřený podílový fond` | sloučit na `INVESTIKA realitní fond (otevřený podílový fond)` |
| Kooperativa | MAJ | `TBD - Kooperativa Majetek (doplnit z dropdownu)` + `Pojištění majetku (domácnost/nemovitost) – produktové řady dle webu/partnera (TBD)` | odstranit první (TBD placeholder) |
| Kooperativa | ODP | `TBD - Kooperativa Odpovědnost (doplnit z dropdownu)` + `Odpovědnost – obvykle součást majetkového pojištění (TBD)` | odstranit druhý (generický komentář, ne produkt) |
| Allianz pojišťovna | ZP | `Allianz ŽIVOT -M-`, `Allianz ŽIVOT -Ž-`, **`Život`** | odstranit třetí (generický placeholder) |

### 3. Duplicitní pokrytí segmentu (logicky stejná funkce)

| Záznam A | Záznam B | Segment | Akce |
|----------|----------|---------|------|
| `ČSOB` / HYPO | `ČSOB Hypoteční banka` / HYPO | HYPO | ponechat pouze `ČSOB Hypoteční banka` (reálný hypoteční subjekt) |

### 4. Pillow ZP rozdělené do dvou JSON objektů

Po úklidu: jeden objekt `{ partner: "Pillow", category: "ZP", products: ["Pojištění úrazu a nemoci", "URAN"] }`.

### 5. TBD placeholdery

Celkem 25 produktů začíná prefixem `TBD`. Pravidlo úklidu:

- **Odstranit**, pokud existuje jiný reálný produkt pro stejný (partner, segment).
- **Ponechat** s flagem `is_tbd=true` (v DB) a přejmenovat na **uniformní** tvar
  `Ostatní (doplnit z dropdownu)`, pokud je to jediný produkt pro dvojici
  (partner, segment).

Konkrétně po úklidu:

| Partner | Segment | Stav |
|---------|---------|------|
| ČPP | AUTO_HAV, AUTO_PR, MAJ, ODP | jediné → unifikovat na `Ostatní (doplnit z dropdownu)` |
| ČSOB pojišťovna | MAJ, ZP | jediné → unifikovat |
| Direct | AUTO_HAV, AUTO_PR, MAJ, ODP, FIRMA_POJ | jediné → unifikovat |
| Kooperativa | AUTO_HAV, AUTO_PR | jediné → unifikovat |
| Maxima | AUTO_HAV, AUTO_PR, MAJ | jediné → unifikovat |
| mBank | UVER | jediné → unifikovat |
| Pillow | MAJ, ODP | jediné → unifikovat |
| UNIQA | FIRMA_POJ | jediné → unifikovat |
| ATRIS, Avant, Cyrrus, J&T, Moventum | INV | jediné → unifikovat na `Ostatní (doplnit z dropdownu)` |
| RSTS | HYPO | unifikovat (rozdělení HYPO/UVER ne v produktu) |
| Kooperativa MAJ | — | druhý TBD odstranit |
| Kooperativa ODP | — | druhý TBD odstranit |
| Allianz pojišťovna ZP | — | položka `Život` odstranit |
| Raiffeisenbank HYPO | — | první TBD odstranit (má 6 reálných) |

### 6. Nekonzistence mezi catalog.json a top-lists-seed-v2.json

| Partner | Segment | catalog.json | top-lists-seed-v2.json | Kanonický tvar |
|---------|---------|-------------|------------------------|----------------|
| Conseq | INV | `Active Invest - Dynamický` atd. | `Active Invest (Dynamický)` atd. | **`Active Invest (Dynamický)`** (závorky, jednotné formátování) |
| Pillow | ZP | 2 záznamy | 1 záznam (jen úraz/nemoc) | sloučit catalog + přidat URAN do top-lists |

### 7. Excluded partneři

`catalog.json.rules.excludePartners: ["Halali", "test", "test partneři", "Slavia"]`.

- **Slavia**: je v `excludePartners`, ale figuruje v `top-lists-seed-v2.json` s flagem `excluded: true`.
  Odstranit z top-lists úplně (jeden zdroj pravdy = `excludePartners`).
- **Halali**, **test**, **test partneři**: žádné změny.

## Přepočítaný katalog po úklidu

Po aplikaci výše uvedených pravidel:

- **Partneři**: z ~40 unikátních řádků zůstává **~37** (merge Uniqa + Investika, odstranění duplicitního `ČSOB` HYPO).
- **Produkty**: z ~90 řádků zůstává **~75** (deduplikace + odstranění 1 generického placeholderu u Allianz, odstranění duplicitních TBD).
- **Segmenty**: 12 (beze změn — ZDRAV odstraněn z JSONů, které ho měly navíc).

## Dopad na DB (migrace)

Před úklidem může v produkční DB existovat:

- 2 řádky v `partners` pro `Uniqa` / `UNIQA` (každá kombinace segmentu).
- 2 řádky pro `Investika` / `INVESTIKA` v segmentu INV.
- Smlouvy (`contracts.partner_id`, `contracts.product_id`) a `payment_accounts.partner_id`
  mohou ukazovat na oba varianty.

Migrace `catalog-dedup-partners-products-2026-04-21.sql`:

1. Pro každou skupinu `(LOWER(name), segment)` v `partners` WHERE `tenant_id IS NULL` najde kanonický řádek.
2. `UPDATE contracts SET partner_id = canonical` pro všechny FK mířící na duplikáty.
3. `UPDATE payment_accounts SET partner_id = canonical`.
4. Přesune `products` pod kanonického partnera a merge-ne duplicitní produkty
   (přepis `contracts.product_id` + DELETE duplicit).
5. DELETE duplicitních `partners` řádků.
6. `UPDATE partners SET name = 'UNIQA'` atd. (kanonický casing).
7. Guard: `SELECT COUNT(*) FROM contracts WHERE segment = 'ZDRAV'` musí být 0, jinak RAISE EXCEPTION.
8. DELETE partnerů/produktů s `segment = 'ZDRAV'` (pokud existují, což by neměly).

Po migraci spustit `pnpm run db:seed-catalog` pro doplnění nových kanonických partnerů
(pokud bylo odstraněno vše jako u `Investika` → po merge byl kanonický `INVESTIKA` ponechán,
takže seed je pouze no-op krok).

## Regresní testy

`apps/web/src/lib/__tests__/catalog-consistency.test.ts` assertuje:

- Neexistují duplicitní partneři case-insensitive v rámci (segment).
- Neexistují duplicitní produkty case-insensitive v rámci (partner, segment).
- `catalog.json.categories` == `Object.keys(SEGMENT_LABELS)` == `topLists.segments.map(s => s.code)`.
- Žádný partner v top-lists chybí v catalog.
- Žádný (partner, segment) nemá zároveň TBD placeholder a reálný produkt.
- `rules.excludePartners` neobsahuje žádný z partnerů v top-lists.

Po těchto testech by žádný PR neměl znovu rozbít katalog tímto způsobem.
