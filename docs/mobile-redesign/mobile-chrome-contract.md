# Mobile app chrome — design contract (Aidvisora)

**Účel:** Jednotná „slupka“ mobilního portálu (horní lišta, spodní navigace, centrální +, kontejner obsahu). Tento dokument je **zdroj pravdy pro implementaci** v `MobilePortalClient`, `primitives` a sdílených layoutech. Neprováděj paralelní `PhoneShell` ani duplicitní hlavičky uvnitř screenů.

**Nevztahuje se na:** desktopový `/portal/**` webový layout.

**Související workflow:** [mock-ingestion-protocol.md](./mock-ingestion-protocol.md)

---

## A1 — Horní lišta (Top navbar)

### Chování a umístění

- **Sticky / fixed vůči scrollu obsahu:** hlavička zůstává nahoře (`position: sticky; top: 0`) v rámci mobilního shellu.
- **Bez druhé konkurenční hlavičky** na hlavních screens — žádný vlastní „page title bar“ pod globální lištou (hlavní nadpis sekce je v **obsahu** screenu).
- **Žádný desktop breadcrumb** v mobilním shellu.
- **Žádný PagePill** ani plovoucí „pill“ s názvem stránky mimo scroll obsahu.
- **Žádný fake StatusBar / iPhone frame** — safe area jen přes CSS env / tokeny shellu.

### Vizuál

- Povrch: **bílá / jemně skleněná** (`backdrop-blur`, poloprůhledná bílá).
- **Zaoblené spodní rohy** (jednotný radius v `MobileHeader`).
- **Jemný stín** pod hlavičkou (oddělení od scroll obsahu).
- **Safe area nahoře** (`padding-top` zahrnuje `--safe-area-top`).
- Akční tlačítka (menu, hledat, AI, zvoneček): **zaoblené „glass“** (~`rounded-2xl`), min. **44×44 px** tap target, bez fake zařízení.

### Oblasti (44px min. tap target)

| Pozice | Prvek |
|--------|--------|
| Vlevo | **Menu** — otevře `MobileSideDrawer` (kromě detailových tras se šipkou Zpět). |
| Střed | Na **primárních tab hub** (`/portal/today`, `/portal/tasks`, `/portal/contacts`, `/portal/pipeline` přesný list bez dynamického segmentu) vizuálně **prázdný** prostor — hlavní titul je v obsahu screenu (`isPrimaryTabHubPath` v `route-helpers.ts`). Pro přístupnost zůstává title/subtitle jako **sr-only**. Na ostatních trasách **Title** (1 řádek) + **Subtitle** (1 řádek), truncate. |
| Vpravo | **Hledat** (globální search overlay), **AI** (interní asistent — top chrome, **ne** bottom tab), **Oznámení** (klientské požadavky / inbox). |

### Texty title / subtitle podle aktivní obrazovky

**Režim „content-first“ (primární taby hub):** střed headeru neukazuje titul; screen si bere vlastní H1 (např. „Obchody“) v `MobileScreen` — viz mock Obchody.

**Režim „header titles“ (ostatní trasy v shellu):** např. Kalendář, Zprávy, sekce z `ROUTE_META` v `MobilePortalClient`, nebo detail (jméno klienta / případu).

| Screen | Title v headeru | Poznámka |
|--------|-----------------|----------|
| Přehled hub | (sr-only / skryto) | H1 v `DashboardScreen` |
| Úkoly hub | (sr-only / skryto) | H1 v `TasksScreen` |
| Klienti hub | (sr-only / skryto) | H1 v `ContactsScreen` |
| Obchody hub | (sr-only / skryto) | H1 v pipeline screenu (`PipelineScreen`) |
| Kalendář | Kalendář | Subtitle ze `ROUTE_META` |
| Ostatní | dle `ROUTE_META` nebo kontext detailu |

Ostatní trasy používají mapu metadat v `MobilePortalClient` (`ROUTE_META`) nebo kontext detailu (např. jméno klienta).

### Implementace

- **Sjednocená komponenta:** `MobileHeader` (`primitives.tsx`), skládání slotů výhradně v `MobilePortalClient` (jeden zdroj pravdy pro pravé/levé ikony).
- Režim středu: prop `titleMode="accessibilityOnly"` když `isPrimaryTabHubPath(pathname) === true`.

---

## A2 — Spodní navigace (Bottom nav)

### Položky (5 „slotů“, střed = FAB)

1. **Přehled**
2. **Úkoly** (badge = počet úkolů **po termínu**, kap `9+`)
3. **Centrální +** (viz A4)
4. **Klienti**
5. **Obchody**

### Pravidla produktu

- **AI není** samostatný spodní tab — AI je **horní akce** (nebo položka draweru).
- **Kalendář není** spodní tab — kalendář je **drawer / odkaz** z menu nebo z flow **+**.
- **Aktivní tab:** zaoblený **pill** pozadí (ne celý obdélník navigace).
- Centrální **+**: větší **kruh**, navy/violet gradient (token `--aidv-mobile-fab-gradient`).

### Odsazení obsahu

- Spodní nav je `position: fixed` — obsah v `MobileScreen` musí končit **nad** navigační výškou. Shell rezervuje výšku přes `--aidv-mobile-tabbar-inner-h-phone` + safe area.
- Poslední karty nesmí být „podťaté“ — dostatečný **dolní padding** scroll oblasti.

### Implementace

- **Sjednocená komponenta:** `MobileBottomNav` + `centerFab` v `MobilePortalClient`.
- **Žádné duplicitní FAB** u hlavních tabů (úkol/klient/obchod) — stejná funkce řeší centrální +.
- Na telefonech vizuálně **„plovoucí“ pilulka**: `max-w-lg mx-auto`, vnitřek **zaoblený** (`rounded-[2rem]` řád), glass border + stín odpovídající mockům; safe area **dole** zůstává vždy započtená.

---

## A3 — Kontejner obsahu (screen)

### Pozadí

- Plátno: **`#f6f8fb`** (token `--aidv-mobile-canvas-bg`).

### Horizontální padding

- cca **24–30 px** podle šířky: prakticky `px-5` (20px) na nejužších, **`px-6` (24px)** výchozí, volitelně větší breakpoint pro širší telefon.

### Vertikální rytmus

- Jednotný **`space-y`** v rámci screenu; sekce přes `MobileSection` / `MobileSectionHeader`.

### Karty

- Radius cca **24–36 px** (tokeny `--aidv-mobile-card-radius-lg` / karty).
- **Měkký stín** (`--aidv-mobile-shadow-card-premium`).
- **Žádný povinný horizontální scroll** celé stránky na 390–430 px (výjimka: záměrné stripy s `overflow-x-auto` uvnitř komponenty, ne celá page).

### Výjimky

- Kalendář: **časová mřížka** může být full-bleed (`-mx` + `calc` šířka) v rámci svého bloku; okolní chrome (toolbar, bannery) drží padding shellu.

---

## A4 — Centrální akce „+“

- Otevře **jednotný** panel (`BottomSheet` / `MobileActionSheet`).
- **Povolené položky (produktová sada):**
  - Nový úkol
  - Nová aktivita
  - Nový klient
  - Nový obchod
  - Nahrát smlouvu
- **Žádné fake save** — každá položka buď volá **existující flow** (router / otevření sheetu s reálnou mutací), nebo je **disabled / odkaz na web** podle oprávnění.
- Technická dokumentace skutečných handlerů v kódu: `QuickNewMobileSheet` + `MobilePortalClient`.

---

## Kontrolní checklist (regrese)

- [ ] Jedna instance `MobileHeader` na obrazovku v shellu.
- [ ] Žádný PagePill overlay.
- [ ] Bottom nav + centrální + na hlavních tabs bez druhého FAB.
- [ ] Kalendář bez duplicitního nadpisu „Můj kalendář“ v toolbaru (globální title zůstává „Kalendář“).
- [ ] Přehled na telefonu drží hierarchii: datum → pozdrav → hero → 3 signály → metriky → klienti → priority.
- [ ] Desktop `/portal/**` beze změny mobilními soubory layoutu webu.

---

**Související soubory**

- `apps/web/src/app/shared/mobile-ui/primitives.tsx`
- `apps/web/src/app/shared/mobile-ui/MobileLayouts.tsx`
- `apps/web/src/app/shared/mobile-ui/MobileSideDrawer.tsx`
- `apps/web/src/app/portal/mobile/MobilePortalClient.tsx`
- `apps/web/src/app/portal/mobile/QuickNewMobileSheet.tsx`
- `apps/web/src/app/portal/mobile/route-helpers.ts` (`isPrimaryTabHubPath`, `pathnameToBottomTab`)
- `docs/mobile-redesign/mock-ingestion-protocol.md`
- `apps/web/src/app/globals.css` (tokeny mobilního shellu)
