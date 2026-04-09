# Týmový přehled (Team Overview) – masterplan Fáze 0–1

**Účel dokumentu:** Kanonický audit stavu v repozitáři, informační architektura MVP, role/scope, audit interních termínů a mapa souborů. Slouží jako podklad pro další implementační prompty (Composer 2) bez domýšlení.

**Rozsah:** Platí pro modul portálu „Týmový přehled“ a těsně navázané vrstvy (actions, hierarchie, AI shrnutí týmu, týmové události/úkoly). Neřeší enterprise BI, mega-dashboard ředitele celé firmy ani redesign nesouvisejících dashboardů.

**Datum auditu:** 2026-04-09 (proti stavu kódu v `apps/web` a `packages/db`).

---

## 0. Search audit (povinné dotazy)

Níže je souhrn cílených vyhledávání v kóbu a dokumentaci – **co z nich plyne** a **kde je pravda v repu**.

| Dotaz / téma | Kde to rezonuje | Závěr (jedna věta) |
|----------------|-----------------|-------------------|
| `team-overview` | `portal/team-overview/*`, `actions/team-overview.ts`, sidebar, mobile, deep-links | Hlavní modul: stránka, view, detail člena, server actions pro KPI/metriky/alerty/nováčky. |
| `getTeamOverview` | Přesné jméno funkce v kóbu je **`getTeamOverviewKpis`** (ne `getTeamOverview`). | Hledejte a importujte `getTeamOverviewKpis`. |
| `getTeamHierarchy` | `team-overview.ts` → `getTeamTree` v `team-hierarchy.ts`. | Vrací `TeamTreeNode[]` podle scope a `parent_id`. |
| `NewcomerAdaptation` | Typ + `getNewcomerAdaptation` v `team-overview.ts`. | Nováčci &lt; 90 dní, role Advisor/Manager, checklist + skóre + status. |
| `team_overview` | `rolePermissions.ts`, `entitlements.ts`, guards ve stránkách a AI. | Permission `team_overview:read` (a write u Director/Admin); entitlement klíč `team_overview` mapuje na `ai.assistant_enabled`. |
| `team_calendar` | `rolePermissions.ts`, `team-events.ts`, `TeamCalendarModal.tsx`. | Write pro vytvoření týmové události/úkolu; read v matici rolí existuje, agregované „team calendar UI“ v přehledu chybí. |
| `rolePermissions` | `shared/rolePermissions.ts` (+ testy release gate). | Centrální matice rolí vs. akcí; client-safe import pro bundler. |
| `parentId` | `memberships.parentId`, `team-hierarchy*.ts`, `team-overview.ts`, `team.ts`. | Hierarchie reportingu v tenantu; bez vyplnění stromu padá fallback „všichni členové“ v `my_team`. |
| Mindmap | `portal/mindmap/*`, `actions/mindmap.ts`. | Doména kontaktů/domácností a canvas; **není** org chart týmu. |
| `generateTeamSummaryAction` | `ai-generations.ts` → `generateTeamSummary` v `ai-service.ts`. | Ukládá generaci `entityType: team`, `promptType: teamSummary`. |
| `createTeamActionFromAi` | `ai-actions.ts` → `executeTeamAiAction` v `action-executors.ts`. | Z uloženého team summary vytvoří úkol nebo schůzku (`events.eventType: schuzka`) pro uživatele/člena. |
| meeting / event / calendar | `team-overview.ts` (`events`), `team-events.ts`, kalendář portálu. | „Schůzky“ v metrikách = CRM `events` s `eventType === "schuzka"`; týmové hromadné = `team_events` + kopie do `events`. |
| schedule / appointment | Obecné výrazy, málo specifické v kóbu Team Overview. | Žádný samostatný entitní typ „appointment“ pro tým; používají se `events` a team modal. |
| onboarding / adaptation | `getNewcomerAdaptation`, UI filtr „Jen nováčci“, detail člena. | Adaptace = odvozená z CRM aktivit (90d okno), ne samostatný onboarding modul. |
| follow-up | Metrika `followUpsThisPeriod` (dokončené úkoly v období), AI follow-up forma. | „Follow-up“ není vlastní tabulka; úkoly = `tasks`, AI vytváří task/event. |

---

## 1. Executive summary

### Co Team Overview dnes reálně umí

- **Agregační dashboard** pro vybraný **scope** (Já / Můj tým / Celá struktura podle role): KPI (členové, jednotky, produkce, schůzky v týdnu, nováčci, rizikoví, pipeline, konverze, volitelně týmový cíl z `team_goals`), **tabulka členů** s metrikami za období (týden/měsíc/kvartál), **filtry** (role, top/bottom výkon, rizikoví, nováčci).
- **Seznam alertů** odvozený z pravidel na metrikách (aktivita, schůzky, konverze, leady, pokles produkce).
- **Blok adaptace nováčků** (90 dní, Advisor/Manager ve scope) s checklistem a skóre.
- **Jednoduchý graf** „Výkon v čase“ (jednotky + produkce po obdobích z `contracts`).
- **AI shrnutí týmu** (uložená generace, regenerace, zpětná vazba, ruční follow-up úkol/schůzka z AI bloku).
- **Vytvoření** týmové události nebo týmového úkolu (modal) – fan-out do per-user `events` / `tasks` přes `team_events` / `team_tasks`.
- **Detail člena** (`/portal/team-overview/[userId]`) s metrikami, alerty, adaptací (pokud splňuje kritéria nováčka) a statickým textem **„Shrnutí pro coaching“** sestaveným z existujících dat.

### Proč to zatím není dost silný prémiový manažerský modul

- **Informační hierarchie** je plochá: mnoho KPI v jedné mřížce, **chybí první fold „briefing“** (kdo potřebuje pozornost dnes / na poradu / 1:1).
- **Tón** je silně „výkon a rizika“ (CRM metriky), méně **coaching a rozvoj** – užitek je, ale produktově to snadno přečtete jako dohled, ne jako cockpit pro vedení.
- **Struktura týmu** je zobrazena jako **zkrácený textový řetězec** (max 5 kořenů), ne jako srozumitelný strom ani výrazné „přímí podřízení“.
- **Interní termíny** (porady, 1:1, školení) **nejsou v přehledu agregované** – existuje jen vytvoření týmové události, ne „nadcházející týmový kalendář“.
- **AI kontext** pro generování týmového shrnutí **nemusí odpovídat** zvolenému scope ve UI (viz sekce 8) – ředitel vidí „full“ data na stránce, ale serverový AI builder defaultuje jinak.

### Největší produktová příležitost

1. **Manažerský briefing nahoře:** sjednotit „Kdo potřebuje mou pozornost?“ (alerty + nováčci + 1–2 KPI) bez dalšího SOT – z existujících `getTeamAlerts`, `getNewcomerAdaptation`, KPI.
2. **Struktura a přímí spolupracovníci** z `getTeamHierarchy` / `parentId` – vizuálně a srozumitelně, bez přetahování celého mindmap řešení.
3. **Interní agenda:** levný reuse – dotaz na nadcházející `events`/`tasks` ve scope (a později `team_events`), pokud se přidá read API; do té doby aspoň odkaz/CTA do kalendáře a jasná mezera v produktu.

---

## 2. Current state audit

### Entrypoint a route

| Route | Soubor | Poznámka |
|-------|--------|----------|
| `/portal/team-overview` | `apps/web/src/app/portal/team-overview/page.tsx` | `force-dynamic`, guard `team_overview:read`, paralelní načtení dat, default scope podle role. |
| `/portal/team-overview/[userId]` | `apps/web/src/app/portal/team-overview/[userId]/page.tsx` | `getTeamMemberDetail`, redirect při Forbidden. |

### Hlavní komponenty

- **`TeamOverviewView.tsx`** – client; drží period, scope, refresh všech getterů; sekce KPI, výkon v čase, AI, rizika, nováčci, tabulka; hierarchie jako krátký text; napojení na `TeamCalendarModal`.
- **`TeamCalendarModal.tsx`** – create team event/task, presety příjemců (celý tým, manažeři, poradci, nováčci, rizikoví).
- **`TeamMemberDetailView.tsx`** – coaching odrážky + metriky + alerty + graf (osobní jednotky/produkce).

### Server actions a datové zdroje

- **`apps/web/src/app/actions/team-overview.ts`** – jediný hlavní agregační modul:
  - Tabulky: `contracts`, `events`, `activity_log`, `tasks`, `opportunities`, `financial_analyses`, `memberships`, `roles`, `user_profiles`, `team_goals`.
  - Funkce: `getTeamOverviewKpis`, `getTeamMemberMetrics`, `getTeamAlerts`, `getNewcomerAdaptation`, `getTeamPerformanceOverTime`, `getTeamHierarchy`, `listTeamMembersWithNames`, `getTeamMemberDetail`, `listTeamGoals` / `upsertTeamGoal` / `deleteTeamGoal` (závislé na `team_goals:*`).

### Role / scope logika

- **`team-hierarchy-types.ts`:** `TeamOverviewScope = "me" | "my_team" | "full"`; `resolveScopeForRole` – Advisor/Viewer vždy `me`; Manager nemůže `full` (přemapuje se na `my_team`); Director/Admin může `full`.
- **`getVisibleUserIdsFromMembers`:** `my_team` = aktuální uživatel + potomci v grafu `parent_id`; pokud v tenantu **nikdo nemá** `parent_id`, `my_team` vrátí **všechny členy** (záměrný fallback – dokumentováno i v `docs/TEAM-OVERVIEW-HIERARCHY.md`).

### AI flow (týmové shrnutí)

- **Generování:** `generateTeamSummaryAction` → `generateTeamSummary` → `buildTeamAiContextRaw` + `renderTeamAiPromptVariables` → `runPromptGeneration` (`promptType: teamSummary`, `entityType: team`, `entityId: tenantId`).
- **Kontext:** `buildTeamAiContextRaw` volá `getTeamOverviewKpis`, `listTeamMembersWithNames`, `getTeamMemberMetrics`, `getTeamAlerts`, `getNewcomerAdaptation` **bez explicitního `scope`** → použije se default z `resolveScopeForRole(role, undefined)` = pro Director/Admin **`my_team`**, ne `full` (viz riziko v sekci 8).
- **API alternativa:** `GET /api/ai/team-summary` předává `scope` query param a defaultuje stejně jako UI stránka – konzistentnější než `buildTeamAiContextRaw`.
- **Follow-up:** `createTeamActionFromAi` validuje generaci (`team` + `teamSummary`), pak `executeTeamAiAction` → `createTask` nebo `createEvent` (typ schůzky).

### Newcomer / adaptation flow

- V `getNewcomerAdaptation`: členové ve scope, role Advisor nebo Manager, `joinedAt` v posledních 90 dnech.
- Kroky checklistu: profil (vždy true od `joinedAt`), první aktivita, první schůzka (jakýkoli event), první analýza, první smlouva, pravidelnost CRM (≥5 aktivit za 30 dní).
- **Poznámka:** „První schůzka“ bere **první event vůbec**, ne filtr `eventType === "schuzka"` – může zkreslit, pokud první záznam není klientská schůzka.

### Calendar / event / meeting flow

- **Metriky „schůzky“:** počítají se z `events` přiřazených uživateli, filtr `eventType === "schuzka"` pro počty schůzek a „dnů od schůzky“.
- **Týmové události:** `createTeamEvent` zapisuje `team_events` a duplikuje řádky do `events` s `teamEventId`. **Žádný** server action pro výpis nadcházejících týmových událostí pro Team Overview.
- Portálový **kalendář** (`/portal/calendar`) je samostatná oblast – není v tomto dokumentu detailně auditován, ale je cílem pro deep-link po vytvoření schůzky z AI.

### Mindmap reuse

- Mindmap je **klientský nástroj** (mapy u kontaktu/domácnosti). **Nepoužívat** jako zdroj org struktury – jiný model uzlů, persistence a UX. Pro strom týmu stačí **`getTeamHierarchy`** + nová lehká vizualizace.

---

## 3. Reuse-ready assets

### Lze použít beze změn (nebo s minimálním napojením)

- `getTeamOverviewKpis`, `getTeamMemberMetrics`, `getTeamAlerts`, `getNewcomerAdaptation`, `getTeamPerformanceOverTime`, `getTeamHierarchy`, `listTeamMembersWithNames` – stabilní kontrakty pro přestavbu UI.
- `TeamCalendarModal` + `team-events.ts` – pro pokračování v „hromadné akci“ (create).
- AI pipeline: `generateTeamSummaryAction`, `getLatestTeamSummaryAction`, `submitAiFeedbackAction`, `createTeamActionFromAi`.
- `team-hierarchy-types.ts` – čisté typy a `resolveScopeForRole` pro klienta i server.

### Lze použít s malou úpravou

- **`buildTeamAiContextRaw`** – přidat parametr `scope` (a period už má) a předávat z UI / volajícího; sjednotit s `TeamOverviewView`.
- **Hierarchie v UI** – stejná data (`TeamTreeNode[]`), změna pouze prezentace (strom, expand, highlight „mých“ přímých podřízených).
- **`/api/ai/team-summary`** – referenční chování scope; lze zarovnat s `generateTeamSummary` nebo dokumentovat jako kanon pro externí konzumenty.

### Lepší nepoužít / drahé nebo rizikové

- **Celý mindmap canvas** pro org chart – vysoká cena, jiná doména, riziko záměny s klientskými mapami.
- **Duplikovat metriky** do nových agregačních tabulek – porušuje pravidlo „žádný nový SOT“ bez potřeby; aktuální výpočty z CRM tabulek stačí pro MVP briefing.

---

## 4. Role & visibility matrix

Oprávnění dle [`apps/web/src/shared/rolePermissions.ts`](apps/web/src/shared/rolePermissions.ts). Scope dle [`team-hierarchy-types.ts`](apps/web/src/lib/team-hierarchy-types.ts).

| Role | `team_overview:read` | Scope výchozí (UI page) | Týmová událost/úkol (`team_calendar:write`) | `team_goals` | Co vidí v Team Overview | Co skrýt / omezit | Riziko úniku |
|------|----------------------|-------------------------|---------------------------------------------|--------------|---------------------------|-------------------|--------------|
| **Advisor** | Ano | `me` – jen vlastní metriky | Ne | Jen read nepřísluší (není v roli) | Osobní „tým“ 1 člen; stejné KPI jako osobní výkon | Tlačítka týmového kalendáře; cíle týmu (pokud by se někdy zobrazily) | Nízké – vidí jen sebe. |
| **Viewer** | **Ne** | N/A (stránka redirect) | Ne | Ne | Nemá přístup k `/portal/team-overview` | Celý modul | Sidebar stále může ukazovat sekci podle `layout` – ověřit konzistenci s permission (aktuálně sekce „Vedení týmu“ závisí na `showTeamOverview`, ne na `team_overview:read`). |
| **Manager** | Ano | `my_team` | Ano (read+write) | read | Podřízení stromem + on sám; KPI za tým | Scope „Celá struktura“ UI neukáže (správně) | Střední: bez `parent_id` vidí **všechny** v tenantu v `my_team`. |
| **Director** | Ano (+ `team_overview:write`) | `full` | Ano | read+write | Všichni členové tenantu; sloupec Nadřízený v tabulce při `full` | – | **AI kontext** bez scope parametru může být užší než UI (`my_team`). |
| **Admin** | `*` | `full` | Ano | read+write | Totéž co Director + plná práva jinde | – | Stejné jako Director u AI scope. |

**Poznámka k navigaci:** `apps/web/src/app/portal/layout.tsx` nastavuje `showTeamOverview` pro Admin, Director, Manager, **Advisor** – Advisor má odkaz, ale data jsou scope `me`. To je konzistentní s „osobní přehled“, ale produktově může mást název „Týmový přehled“.

---

## 5. Internal terms / meetings / events / calendar audit

### Co repo už umí

- **CRM události (`events`):** schůzky, telefonáty atd. vázané na uživatele (`assignedTo`); použití v metrikách a v AI follow-up (vytvoření schůzky).
- **Týmové události (`team_events` + řádky v `events`):** hromadné vytvoření přes `createTeamEvent`; propagace na vybrané `userId`.
- **Týmové úkoly (`team_tasks` + `tasks`):** analogicky přes `createTeamTask`.
- **Interní úkoly / follow-up:** standardní `tasks`; metrika „follow-up“ v přehledu = **dokončené úkoly v období** (`followUpsThisPeriod`).

### Co v Team Overview chybí nebo je rozpracované

- **Agregovaný pohled** „co má tým před sebou“ (nadcházející porady / interní schůzky / úkoly) – **není** v `TeamOverviewView`.
- **Read API** pro `team_events` (filtrování podle tenantu, data, scope členů) – **neexistuje** v `actions` (kromě mutací v `team-events.ts`).
- **Typy interních událostí** v DB: `events.eventType` je string (např. `schuzka`); týmový modal defaultuje `schuzka`; **není** separátní enum „porada vs 1:1 vs školení“ – kategorizace je v názvu/poznámce a v budoucnu konvence nebo rozšíření schématu.

### Doporučené kategorie pro budoucí UI Team Overview

| Kategorie | Smysl pro managera | Stav v repu |
|-----------|-------------------|-------------|
| Porada / stand-up | Společná synchronizace | Částečně – jako **týmová událost** (libovolný název); žádný dedikovaný typ. |
| 1:1 meeting | Coaching | **Ne jako typ** – lze zadat jako osobní `events` nebo týmová událost s jedním příjemcem; žádná first-class entita. |
| Týmová akce | Team building | Stejné jako událost; žádný rozlišovač. |
| Školení | Rostoucí kompetence | Stejné; produktově jen obsah názvu / poznámky. |
| Adaptační check-in | Nováčci | **Částečně** – data v `getNewcomerAdaptation`; **není** kalendářová série check-inů. |
| Interní úkol / follow-up | Závazky z porad | **Ano** – `tasks`; AI umí vytvořit úkol ze shrnutí. |
| Důležitý termín týmu | Deadlines | Úkol s termínem nebo událost; bez samostatné entity. |

**Reuse doporučení:** Pro MVP panelu „nadcházející“ stačí dotaz na `events` a `tasks` v horizontu (např. 14 dní) pro `visibleUserIds` ve scope – **bez nové tabulky**, pokud stačí časová osa. Pro „porady z modalu“ později doplnit read přes `teamEventId` nebo filtr `events.teamEventId IS NOT NULL`.

---

## 6. MVP information architecture (první verze)

Níže bloky obrazovky v pořadí **doporučeném pro další vlna** (viz sekce 10). U každého: cíl, pro koho, data, co ukazuje, MVP vs nice-to-have, stav v repu.

### 6.1 Manažerský briefing (fold 1)

- **Cíl:** Odpovědět během 10 sekund na „Kdo potřebuje mou pozornost dnes?“
- **Pro koho:** Manager, Director, Admin (Advisor má zúžený „osobní“ briefing).
- **Data:** `getTeamAlerts`, `getNewcomerAdaptation`, zkrácené KPI z `getTeamOverviewKpis`.
- **Co ukazuje:** Top 3–5 priorit (kritické alerty, nováčci v riziku, jedna linka trendu).
- **MVP:** Kombinace existujících seznamů bez nových API.
- **Nice-to-have:** Shrnutí větou z AI nahoře (s řízeným scope).
- **Stav v repu:** Fragmentární – alerty a nováčci jsou níže na stránce; chybí sjednocený briefing nahoře.

### 6.2 Struktura týmu

- **Cíl:** „Jak vypadá moje větev?“
- **Pro koho:** Manager+ (a Advisor jen „já“ jako list).
- **Data:** `getTeamHierarchy` → `TeamTreeNode[]`.
- **MVP:** Strom nebo indentovaný seznam; zvýraznění aktuálního uživatele.
- **Nice-to-have:** Klik na uzel → detail; počty podřízených.
- **Stav v repu:** Textový řetězec max 5 kořenů – slabé.

### 6.3 Přímí spolupracovníci

- **Cíl:** Rychlý přístup k lidem, které uživatel nejvíc vede.
- **Data:** `parent_id` v `listTeamMembersWithNames` / strom – přímí potomci kořene „já“.
- **MVP:** Sekce nebo podštítek pod stromem: „Přímí podřízení“.
- **Stav v repu:** Sloupec Nadřízený jen při `scope === "full"`; přímí potomci nejsou explicitní sekcí.

### 6.4 Adaptace nováčků

- **Cíl:** Onboarding / adaptační fáze.
- **Data:** `getNewcomerAdaptation`.
- **MVP:** Stávající karty + link na detail.
- **Nice-to-have:** Fáze popsaná lidsky (mapování status → „Týden 1–2“).
- **Stav v repu:** Hotové jádro.

### 6.5 Výkon v čase

- **Cíl:** Trend, ne jen snapshot.
- **Data:** `getTeamPerformanceOverTime`, případně rozšíření o další metriky.
- **MVP:** Stávající sloupcový graf jednotek.
- **Nice-to-have:** Produkce současně, přepínač metrik.
- **Stav v repu:** Základ hotový.

### 6.6 AI copilot / AI briefing

- **Cíl:** Krátký narativ k datům; bez náhrady čísel.
- **Data:** AI proměnné z team context; uložené generace.
- **MVP:** Stávající blok + **oprava scope** v `buildTeamAiContextRaw`.
- **Nice-to-have:** Automatická regenerace při změně období; trace feedbacku do analytics.
- **Stav v repu:** Funkční, s rizikem scope.

### 6.7 Interní termíny / porady / meetingy / akce

- **Cíl:** „Co mám dnes v týmu na stole?“
- **Data:** Budoucí read na `events`/`tasks` (a volitelně `team_events`) ve scope.
- **MVP:** Odkaz na kalendář + krátký text „Nadcházející týmové události zatím neagregujeme“ **nebo** jednoduchý seznam z lehkého query.
- **Stav v repu:** Create-only modal; agregace v přehledu chybí.

---

## 7. UX risks

- **Generický dashboard:** Velká mřížka KPI bez příběhu a bez priority řazení problémů nahoře.
- **Málo „manažersky“:** Chybí explicitní narrative „na poradu / 1:1 / s nováčkem“ – uživatel si to musí odvodit z tabulky.
- **Zanoření důležitého:** AI a struktura nejsou v prvním foldu; řada uživatelů scrolluje jen KPI + tabulku.
- **Vizuální slabina:** Hierarchie jako řetězec jmen; strom týmu vypadá jako debug výpis.
- **Produktová nečitelnost:** „Rizikoví“ a „Bottom výkon“ může působit trestajícím dojmem bez rámcování „co s tím“ (coaching).
- **Upsell Team plánu:** Entitlement `team_overview` vázaný na `ai.assistant_enabled` může mást (přehled není čistě „AI feature“).

---

## 8. Data / architecture risks

| Riziko | Popis |
|--------|--------|
| **Source of truth** | Metriky jsou odvozené z více tabulek; duplicitní ukládání se nepoužívá – dobré. Riziko je v **interpretaci** (např. první event ≠ první schůzka u nováčka). |
| **Role / scope** | Fallback `my_team` bez hierarchie = celý tenant. Director: UI `full` vs AI context default `my_team`. Detail člena používá `getVisibleUserIds(..., "full")` pro Manager → interně přemapováno na `my_team` – konzistentní. |
| **Performance** | `getTeamMemberMetrics` volá `collectUserStats` pro každého člena (paralelně, ale N× sady dotazů). `getNewcomerAdaptation` cyklus s dotazy na nováčka – při velkém týmu riziko latence a zátěže DB poolu. |
| **Reuse** | Záměna mindmap vs team tree. |
| **AI flow** | `buildTeamAiContextRaw` bez `scope` ≠ výchozí scope na stránce pro Director/Admin. |
| **Team events** | Jen zápis; žádný centralizovaný read – riziko divergentních zobrazení napříč obrazovkami, až se panel přidá. |

### Dokumentační drift: `docs/team-overview-phase2-summary.md` vs kód

Soubor **Phase 2** v sekci „Risk scoring“ popisuje rozšíření alertů (**slabá CRM disciplína**, **případy bez další akce**, **slabý follow-up** s prahy na otevřené úkoly + schůzky), která **v aktuální implementaci `buildAlertsFromMetric` v `team-overview.ts` nejsou**.

**Skutečně implementované typy alertů** (pole `type`): `no_activity`, `meeting_drop`, `low_activity`, `weak_conversion`, `no_new_leads`, `production_drop`.

**Částečná shoda:** „Pokles výkonu“ z dokumentu je blízko `production_drop`, ale prahy a logika se mají ověřovat v kódu, ne podle Phase 2 textu.

**Co z toho plyne:** Phase 2 dokument je **částečně zastaralý / aspirational** v části risk scoring; při plánování vylepšení alertů brát za pravdu **zdrojový kód** nebo dokument aktualizovat.

---

## 9. Recommended MVP scope

### IN (první implementační vlna – produktově)

- Přeskupení layoutu: **Manažerský briefing** nahoře z existujících dat.
- **Struktura týmu** z `getTeamHierarchy` jako strom / přehledný panel (bez mindmap).
- **Sjednocení AI kontextu** se zvoleným `scope` (a ideálně s period) v `buildTeamAiContextRaw` / volání z `generateTeamSummary`.
- Drobné copy / rámce „coaching vs dohled“ (texty, ne nová data).

### OUT (odložit)

- Nové tabulky pro agregace metrik.
- Director mega-dashboard napříč více tenanty.
- Plný týmový kalendář s vlastním SOT.
- Enterprise reporting, exporty BI.

### Připraveno pro další fázi (director view)

- Panel interních termínů (read `events`/`tasks`/`team_events` ve scope).
- UI pro správu `team_goals` přímo z přehledu (data už v DB).
- Jemné doladění prahů alertů (po shodě s produktem – a aktualizaci dokumentace).

### Co nedělat v první iteraci

- Přepis všech metrik na materiální view.
- Integrace mindmap.
- Nové závislosti a background joby pro agregace.

---

## 10. Recommended implementation order (pro Composer 2)

Realistické pořadí samostatných promptů / PR:

1. **Layout + fold 1** – sekce Manažerský briefing (alerty + nováčci + 3 KPI); bez nových API.
2. **Struktura týmu** – komponenta stromu z `getTeamHierarchy`; odstranit / zúžit textový řetězec.
3. **Member table / karty** – drobné UX (priorita sloupců, linky) podle briefing sekce.
4. **Newcomer panel** – případně přesun pod briefing; copy pro coaching.
5. **Detail člena** – sladit s novým briefing tone (volitelné v téže vlně).
6. **AI scope fix** – parametr `scope` do `buildTeamAiContextRaw` a propagace z `generateTeamSummary` / UI.
7. **AI polish** – loading stavy, chybové hlášky, konzistence s `AdvisorAiOutputNotice`.
8. **Interní termíny / calendar panel** – lehký read model (nejdřív events/tasks v okně 14 dní).
9. **QA pass** – role (Manager bez parent_id, Director full), mobilní `TeamOverviewScreen`, rate limity API.

---

## 11. File map

| Soubor | Proč je důležitý |
|--------|------------------|
| `apps/web/src/app/portal/team-overview/page.tsx` | SSR entry, default scope, paralelní fetch. |
| `apps/web/src/app/portal/team-overview/TeamOverviewView.tsx` | Hlavní UI a AI/follow-up/chování scope. |
| `apps/web/src/app/portal/team-overview/TeamCalendarModal.tsx` | Vytvoření týmové události/úkolu. |
| `apps/web/src/app/portal/team-overview/[userId]/page.tsx` | Detail route guard. |
| `apps/web/src/app/portal/team-overview/[userId]/TeamMemberDetailView.tsx` | Coaching UI + metriky. |
| `apps/web/src/app/actions/team-overview.ts` | Všechny team overview gettery a team goals mutace. |
| `apps/web/src/app/actions/team-events.ts` | Mutace `team_events` / `team_tasks` + fan-out. |
| `apps/web/src/app/actions/team.ts` | Správa členů a `parentId` v nastavení (Settings). |
| `apps/web/src/lib/team-hierarchy.ts` | DB načtení členů, viditelnost, strom. |
| `apps/web/src/lib/team-hierarchy-types.ts` | Scope pravidla bez DB (client-safe). |
| `apps/web/src/shared/rolePermissions.ts` | Matice oprávnění. |
| `apps/web/src/app/actions/ai-generations.ts` | `generateTeamSummaryAction`, `getLatestTeamSummaryAction`, feedback. |
| `apps/web/src/app/actions/ai-actions.ts` | `createTeamActionFromAi`. |
| `apps/web/src/lib/ai/ai-service.ts` | `generateTeamSummary`. |
| `apps/web/src/lib/ai/context/team-context.ts` | Sestavení raw kontextu pro AI (scope bug). |
| `apps/web/src/lib/ai/context/team-context-render.ts` | Render proměnných pro prompt. |
| `apps/web/src/lib/ai/actions/action-executors.ts` | `executeTeamAiAction`. |
| `apps/web/src/app/api/ai/team-summary/route.ts` | REST shrnutí s korektním scope parametrem. |
| `apps/web/src/app/portal/mobile/screens/TeamOverviewScreen.tsx` | Mobilní varianta přehledu. |
| `apps/web/src/app/portal/layout.tsx` | `showTeamOverview` pro sidebar. |
| `apps/web/src/lib/entitlements.ts` | Mapování `team_overview` → tenant setting. |
| `apps/web/src/app/actions/mindmap.ts` | Kontext – není team org chart. |
| `packages/db/src/schema/team-events.ts` | Schéma `team_events`. |
| `packages/db/src/schema/tasks-events.ts` | `events`, `tasks`, vazby na team entity. |
| `docs/TEAM-OVERVIEW-HIERARCHY.md` | Existující architektonický popis hierarchie. |
| `docs/team-overview-phase2-summary.md` | Historický / částečně divergentní popis Phase 2 (viz sekce 8). |
| `docs/SOURCES-OF-TRUTH.md` | Obecný SOT CRM (events, tasks, …). |

---

## 12. Acceptance criteria pro další fázi

Další implementační prompt považujte za splněný, pokud:

1. **Briefing fold** je první výrazná sekce pod hlavičkou a obsahuje alespoň: agregované KPI (≤3 čísla), top kritické alerty (nebo prázdný stav), 1 řádek k nováčkům v riziku.
2. **Struktura týmu** používá `getTeamHierarchy` ve **stromové nebo jasně hierarchické** podobě (ne jen join jmen kořenů).
3. **`buildTeamAiContextRaw`** přijímá **`scope` shodný** s aktuálním výběrem ve `TeamOverviewView` (nebo s explicitně dokumentovaným defaultem totožným s `page.tsx`).
4. **Žádný nový persistentní SOT** pro metriky (žádné nové agregační tabulky) bez výslovného produktového schválení.
5. **Role test:** Manager nevidí cizí větev při správně vyplněném `parent_id`; Advisor vidí jen sebe; Director vidí tenant při `full`.
6. Dokumentace: jedna věta v changelog nebo v tomto souboru (verze / datum) že AI scope byl sjednocen – volitelné, ale doporučené.

---

## Další prompt po tomto kroku (doporučený text pro Composer 2)

**„Team Overview – vlna 1 implementace:** (1) Sjednotit `buildTeamAiContextRaw` s parametrem `scope` shodným s výběrem ve `TeamOverviewView` / defaultem z `page.tsx`. (2) Přeskupit `TeamOverviewView` do IA z `docs/team-overview-masterplan.md`: horní fold ‚Manažerský briefing‘ (priorita: alerty + nováčci + 3 KPI), panel struktury týmu z `getTeamHierarchy` (strom, ne řetězec). (3) Bez nových DB tabulek.“**

---

## 13. Fáze 5 – Týmový rytmus (interní termíny, cadence, follow-up)

**Cíl:** Operační vrstva v Team Overview bez nového kalendářového enginu — read model nad existujícími `team_events` / `team_tasks`, doporučující cadence a CTA do stávajícího `TeamCalendarModal`.

### 1) Read model interních termínů

- **Server:** `getTeamRhythmCalendarData(scope)` v `apps/web/src/app/actions/team-overview.ts` — 2 lehké dotazy (události v okně −45 až +14 dní od „teď“, úkoly s `due_date` v rozsahu „od dnes do +14“ nebo po termínu v posledních 90 dnech), **filtrované průnikem `target_user_ids` se `visibleUserIds`** (stejný scope jako přehled).
- **Typ události není v DB:** kategorie (`one_on_one_hint`, `adaptation_checkin_hint`, …) se odvozují z **názvu** v `apps/web/src/lib/team-rhythm/internal-classification.ts` — v payloadu je `disclaimerCs`.

### 2) Co se považuje za interní termín / follow-up / cadence položku

- **Interní termín (UI):** řádek z `team_events` v časovém okně, po přefiltrování scope.
- **Follow-up úkol:** řádek z `team_tasks` s termínem (po termínu nebo v horizontu).
- **Cadence položka:** odvozený řádek z `buildTeamCadenceRows` (`apps/web/src/lib/team-rhythm/build-cadence.ts`) — kombinace `deriveRecommendedCareerAction`, adaptace, a **posledního „osobního“ doteku** z týmových událostí (`lastPersonalTouchByUser`).

### 3) Doporučený rytmus 1:1 / check-inů / follow-upů

- **Doporučení, ne pravidlo firmy:** texty používají formulace „vhodné“, „doporučeno“.
- **Pravidla (zjednodušeně):** aktivní adaptace + dlouho bez osobního doteku → adaptační check-in; `data_completion` → doplnění údajů; doporučené 1:1 / coaching bez nedávného doteku (21 dní, heuristika z názvů událostí) → 1:1 due; jinak follow-up nebo `monitor_only` (v panelu cadence se `monitor_only` nezobrazuje jako „vyžaduje navázání“).

### 4) Propojení s career insights a coachingem

- **Klient:** `computeTeamRhythmView` (`apps/web/src/lib/team-rhythm/compute-view.ts`) dostane stejná data jako `buildTeamCoachingAttentionList` a počítá **`coachingCadenceAlignedCount`** (průnik uživatelů v coaching attention a v cadence „attention“).
- Panel odkazuje na **detail člena**, kde zůstávají **coaching** a **kariéra** (fáze 3–4).

### 5) CTA a prefills

- **`TeamCalendarModal`:** nový optional prop `prefill` (`title`, `description`, `notes`, `dueDate`, `startAt`, `memberUserIds`) — při otevření z panelu rytmu se předvyplní název, poznámka a výběr člena.
- Tlačítka „Porada / follow-up úkol“ v panelu volají totéž modal bez konkrétního člena.

### 6) Role a scope

- Stejný **`getScopeContext`** jako ostatní gettery — žádný leak mimo hierarchii.
- Rozsah **„Já“:** cadence sekce je zkrácená (vysvětlení v UI); data kalendáře jsou jen pro viditelné členy (typicky uživatel sám).

### 7) Future phase (záměrně mimo scope)

- Push notifikace, background reminders, enterprise workflow, plný kalendářový modul, mobilní Team Overview screen s rytmem, first-class `event_type` enum v DB.

**Soubory:** `TeamRhythmPanel.tsx`, `compute-view.ts`, `build-cadence.ts`, `internal-classification.ts`, `last-touch.ts`, `team-overview.ts` (getter), `TeamCalendarModal.tsx`, `page.tsx`.

---

## Migrace SQL

Pro Fázi 5 **nejsou potřeba žádné nové SQL migrace** — read model čte existující tabulky `team_events` a `team_tasks` (schéma v `packages/db/src/schema/team-events.ts`).
