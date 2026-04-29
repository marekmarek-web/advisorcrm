# Aidvisora — Mobile redesign masterplan

**Jediný zdroj pravdy** pro mobilní UX a implementaci nad existujícím Aidvisoram. Vizualní prototypy vznikají mimo repo (např. GPT Canvas, Gemini Canvas); **produkční kód a pravda o chování aplikace** jsou výhradně v tomto repozitáři a v Cursoru.

Cílem **není** webové CRM zmenšené do telefonu. Stavíme **novou mobile-first UI vrstvu** nad stávající business logikou a službami. **Desktop web** zůstává plnohodnotným pracovním rozhraním; mobil je zaměřený na rychlou práci v terénu.

---

## 1. Product vision

- **Rychlá pracovní aplikace** pro finančního poradce **v terénu** — kontext, úkoly, klienti, obchody a klíčové AI nástroje na dosah bez „mini desktopu“.
- **Záměrně ne** kompletní desktop CRM v kapse. Omezení rozsahu je **strategická vlastnost**: méně šumu, rychlejší rozhodování, méně chyb při práci na malém displeji.
- Produktové rozhodnutí: mobil = **execution layer** (udělat věc teď), desktop = **hloubková práce, tým, administrace a složité nástroje**.

---

## 2. Mobile vs web-only scope

### Mobile (zahrnuto)

| Oblast | Poznámka |
|--------|----------|
| Přehled | Dashboard / home pro poradce |
| Úkoly | Seznam, priorita, dokončení |
| Klienti | Vyhledání, seznam, základní detail |
| Obchody | Pipeline / seznam / detail v mobilním rozsahu |
| Kalendář | Přehled událostí, základní práce s termíny |
| AI Review | Wizard / flow pro schválení kontroly dokumentů |
| AI Asistent | Konverzační asistent v interním kontextu poradce |
| Dokumenty | **Jednoduchý** list + detail (náhled / metadata), bez plné desktopové správy |

### Web-only nebo silně mobile-limited

Tyto oblasti zůstávají primárně na **desktop webu** (nebo jsou na mobilu jen odkazem / hlubokým odkazem do webu), protože vyžadují šířku obrazovky, složité formuláře, hromadné operace nebo administrátorská oprávnění:

- **Výpověď smlouvy** — složité kroky a compliance kontext
- **Týmový manažerský přehled** — reporting a hierarchie
- **Admin** — konfigurace tenantu, uživatelů, bezpečnost
- **Billing** — fakturace, plány, platební údaje
- **Integrace** — napojení na externí systémy, údržba
- **Složitá fondová knihovna** — tabulky, filtry, srovnání
- **Provizní kalkulačky** — husté vstupy a tabulková logika
- **Hromadné importy/exporty** — batch operace
- **Detailní reporting** — dashboardy a exporty pro management

**Pravidlo:** pokud use case potřebuje „tabulkový“ nebo vícesloupcový desktop layout, patří na web; na mobilu buď zjednodušený výřez, nebo odkaz „dokončit na webu“.

---

## 3. Mobile navigation

**Produkční kontrakt chrome:** Pokud je rozpor mezi tímto starším masterplanem a [mobile-chrome-contract.md](./mobile-chrome-contract.md), pro produkční mobile shell má přednost **mobile-chrome-contract.md**.

### Bottom navigation (5 slotů, střed = +)

1. **Přehled**
2. **Úkoly**
3. **Centrální +**
4. **Klienti**
5. **Obchody**

**AI není bottom tab.** AI je top action button v mobile chrome a může být dostupná také přes drawer.

**Kalendář není bottom tab.** Kalendář je dostupný přes drawer/menu nebo přes relevantní flow z centrálního `+`.

### Centrální akce „+“ (FAB / center action)

Jedna primární akce pro nejčastější práci v terénu:

- **Nový úkol**
- **Nová aktivita**
- **Nový klient**
- **Nový obchod**
- **Nahrát smlouvu**

Implementace: jedna vstupní akce otevře **action sheet / menu** s těmito volbami (ne pět samostatných tlačítek v spodní liště).

### Drawer / hamburger menu

Sekundární nebo širší přístupy:

- **Kalendář**
- **AI Asistent**
- **AI Review**
- **Dokumenty**
- **Produkce** (vybrané KPI / přehled v mobilním rozsahu)
- **Nastavení**

---

## 4. Design system direction

Směřování vizuálního jazyka — **premium fintech / productivity mobilní aplikace** (klidná, čitelná, důvěryhodná), ne vývojářský dashboard zmenšený na šířku telefonu.

- **Světlé pozadí** jako výchozí — čitelnost venku i uvnitř.
- **Dark navy** jako primární barva brandu/interakcí (tlačítka, aktivní stavy).
- **Violet / indigo accents** — zvýraznění sekundárních akcí, AI vstupů, jemných řezů.
- **Zaoblené karty** — samostatné vizuální bloky místo ohraničených desktop panelů.
- **Bottom sheets** místo uzkých desktopových modalů uprostřed obrazovky.
- **List cards** místo tabulek — řádek = karta s hlavním a sekundárním textem, případně badge.
- **Sticky bottom action bars** pro primární CTA na obrazovkách detailu a wizardů.
- **Mobile-first typography** — větší baseline, pohodlná čitelnost, hierarchie nadpisů.
- **Žádné desktopové sidebary** na mobilu — navigace řešena bottom navem + drawerem.

---

## 5. Component system

**Konkrétní produkční kontrakt chrome (top/bottom nav, padding, +):** viz [mobile-chrome-contract.md](./mobile-chrome-contract.md).

Sdílená sada **mobilních** wrapperů a bloků nad stávajícími daty (názvy jsou konvence pro implementaci — nezávislé na konkrétním frameworku zde):

| Komponent | Účel (stručně) |
|-----------|----------------|
| **MobileShell** | Obal celé mobilní sekce — safe area, základní layout, pozadí. |
| **MobileTopBar** | Horní lišta: název screenu, zpět, kontextové akce. |
| **MobileBottomNav** | Spodní navigace podle kontraktu: Přehled / Úkoly / + / Klienti / Obchody. |
| **MobileDrawer** | Postranní / slide-over menu se sekundární navigací. |
| **MobileActionSheet** | Rychlé volby (např. výběr z FAB „+“). |
| **MobileBottomSheet** | Tvary obsahu s drag handle; náhrada modálů na plnou šířku. |
| **MobilePage** | Konzistentní padding, scroll oblast, vzdálenost od FAB / bottom baru. |
| **MobileCard** | Obecný kontejner pro obsahové bloky. |
| **MobileListItem** | Řádek seznamu s leading/trailing prvky (avatar, ikona, šipka). |
| **MobileKpiCard** | Kompaktní metrika (číslo, label, trend volitelně). |
| **MobileEmptyState** | Ikona / text / primární CTA při žádných datech. |
| **MobileLoadingState** | Skeleton / spinner podle vzoru aplikace. |
| **MobileErrorState** | Chyba síťová nebo aplikační — znovu načíst, podpora. |

---

## 6. Screen templates

Stručné **šablony** — jaké sekce má obrazovka typicky obsahovat (ne detail všech fieldů):

### Dashboard

- Pozdravení / kontext (uživatel, případně datum).
- KPI řádek (**MobileKpiCard**).
- **Úkoly** — nejbližší / přes due (krátký list → celý Tasks).
- **Kalendář** — výřez nadcházejících bloků → plný kalendář z draweru.
- Rychlé akce / FAB.

### Tasks

- Filtry jako chips nebo segmented control (ne široké panely).
- Seznam úkolů jako **MobileListItem** / karty se stavy.
- Detail úkolu: bottom sheet nebo fullscreen stránka + sticky akce.

### Calendar

- Měsíční / týdenní přepínač (kompaktní).
- Seznam událostí pod výběrem data.
- Detail události v sheetu.

### Client detail

- Hlavička (jméno, stav klienta).
- Rychlé akce (kontakt, nový úkol, nový obchod podle oprávnění).
- Sekce: souhrnné údaje, otevřené obchody, nadcházející úkoly — vždy kartami.

### Deal detail

- Název obchodu, fáze, částky v přehledné kartě.
- Timeline / aktivita jako vertikální feed.
- Dokumenty — link na jednoduchý dokumentový výpis.

### AI Review wizard

- Krokový průběh (stepper kompaktní nahoře nebo v obsahu).
- Každý krok v **MobileBottomSheet** nebo fullscreen kroku s jasným primary CTA dolů (sticky bar).
- Stavy loading / error výslovně (**MobileLoadingState**, **MobileErrorState**).

### AI Asistent

- Konverzační rozhraní, vstup dolů nad klávesnicí (bez desktopového roztaženého layoutu).
- Historie jako bubliny; případné návrhy jako chips.
- Odkazy na „otevřít v CRM“ vedou do příslušné mobilní obrazovky nebo webu podle scope.

---

## 7. Implementation strategy

1. **Desktop UI neměnit** — žádné globální refaktory kvůli mobilu; mobil je paralelní vrstva.
2. **Backend ani business logiku nepřepisovat** — znovupoužití hooks, actions, RPC a validací tam, kde to dává smysl.
3. **Mobilní trasy oddělit** — jasná URL / route skupina (`/portal/mobile/...` nebo ekvivalent v projektu), aby bylo vývojově vidět hranici.
4. **Shared services/adapters** — jedna vrstva nad API pro mapování DTO na mobilní view modely kde je to potřeba.
5. **Feature řezy** — každý screen dokončit jako vertikální řez (data + UI + stavy), ne „napůl všechny obrazovky“.

---

## 8. Design handoff workflow

1. **Gemini Canvas / GPT Canvas** — pouze **vizuální a interakční prototypy** (layout, barvy, flow). Nepřenáší se do repa jako zdroj kódu.
2. Pro každou větší obrazovku nebo flow se v `docs/mobile-redesign/` vytvoří **markdown handoff** (doporučený vzor: `handoff-<screen>.md`).
3. Handoff obsahuje: cíl obrazovky, informační hierarchii, stavy (empty/loading/error), odkazy na export z canvasu (volitelně), **verze a datum** last update.
4. **Cursor** implementuje podle handoffu a tohoto masterplanu; odchylky musí být v commit message / krátké poznánce v docs zdůvodněny (technické omezení API atd.).

---

## 9. Migration phases

### Fáze 0 — Audit

- Inventura současných mobilních rout a problémů („webview feeling“).
- Seznam závislostí na šířku / tabulkách / modálech.
- Výstup: krátký audit dokument nebo odkaz na existující audit v repu.

### Fáze 1 — Mobile foundation

- **MobileShell**, top/bottom struktura, **MobileBottomNav**, **MobileDrawer**, základní theming (barvy podle sekce Design system).
- Výstup: prázdné nebo stub screeny přepnutelné bez rozbití desktopu.

### Fáze 2 — Dashboard

- Přehledová obrazovka dle šablony dashboard.
- Výstup: reálná data na KPI + úvodní užitná hodnota.

### Fáze 3 — Tasks + Calendar

- Úplný task list/detail v mobilní paradigmě (karty, bottom sheet).
- Kalendář v mobilním rozsahu + napojení na existující data.

### Fáze 4 — Clients + Deals

- Klienti (list/detail) a obchody v rámci mobile scope.
- Výstup: core CRM pohyby v terénu bez tabulek.

### Fáze 5 — AI Review wizard

- Wizard podle šablony; všechny povinné stavy (loading/error/empty).
- Výstup: schůdný end-to-end flow na reálných datech.

### Fáze 6 — AI assistant

- Konverzační UI + napojení na existující asistent logiku.
- Výstup: konzistentní s compliance (interní podklad pro poradce).

### Fáze 7 — Mobile-only cleanup / web-only gating

- Odstranění zbytečných desktopových patternů z mobilních cest.
- Jasné **gating** nebo odkazy na web pro web-only funkce.
- Výstup: žádné „mrtvé“ desktop komponenty v mobilním stromu.

---

## 10. Acceptance criteria

Checklist pro uzavření mobilní vrstvy (iterativně po fázích):

- [ ] **Desktop** — existující webové CRM se nerozbije (regrese layoutu, rout, hlavních flow).
- [ ] **Mobil** — nepůsobí jako zmenšený webview (odlišná navigace, karty, bottom sheets).
- [ ] **Žádné tabulky** jako primární layout na mobilu — jen karty nebo řádky přizpůsobené výšce tapu.
- [ ] **Modaly** u nahrazeny **bottom sheets** tam, kde dává smysl desktopový modal.
- [ ] **Core flows** (úkoly, klient, obchod, kalendář, AI Review, asistent podle scope) jsou použitelné end-to-end.
- [ ] **Empty / loading / error** stavy existují na hlavních obrazovkách.
- [ ] **Lint, typecheck, build** projde v CI lokálně stejně jako na pipeline.

---

## Související dokumentace v repu

Tyto dokumenty doplňují kontext, ale **nemění** název ani roli tohoto masterplanu jako hlavní mapy mobilního směru:

- [MOBILE-APP.md](../MOBILE-APP.md)
- [mobile-audit.md](../mobile-audit.md)
- [CALENDAR_MOBILE_ARCHITECTURE.md](../CALENDAR_MOBILE_ARCHITECTURE.md)

---

*Verze dokumentu vytvořena jako základ mobilní roadmapy; další iterace handoff souborů v `docs/mobile-redesign/` doplňují detail jednotlivých obrazovek.*
