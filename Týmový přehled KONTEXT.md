# Team Overview implementation plan
_Exported on 11/04/2026 at 18:28:41 CEST from Cursor (3.0.13)_

---

**User**

Jsi senior full-stack engineer a product-minded implementer v repo Aidvisora.

Pracuješ v existujícím monorepu Aidvisora.
Cíl není dělat experimentální mock.
Cíl je udělat první skutečnou implementační vlnu Team Overview na základě již připraveného směru, preview a produktové logiky.

======================================================================
HLAVNÍ CÍL TOHOTO KROKU
======================================================================

Implementuj první reálnou production-oriented verzi Team Overview tak, aby:

1) byla viditelně lepší než současný Team Overview
2) zachovala reuse existujících dat a actions
3) promítla klíčové produktové vrstvy:
   - manažerský briefing
   - attention / needs support
   - kariérní kontext
   - pool split Beplan / Premium Brokers
   - struktura týmu / pyramida
   - týmový rytmus / interní termíny
   - people area
   - detail člena
4) neudělala broad refactor celého portálu
5) šla bezpečně udělat primárně přes Composer 2

======================================================================
ZDROJ PRAVDY
======================================================================

Řiď se:
- existujícím Team Overview v repo
- docs/team-overview-masterplan.md
- docs/team-overview-career-ladders.md
- aktuální hierarchií / role / scope logikou v repo
- již připraveným premium preview směrem Team Overview

DŮLEŽITÉ:
Nepřepisuj produkt od nuly.
Nejdi greenfield.
Maximálně reuseuj to, co už v Aidvisoře je:
- team overview actions
- hierarchy
- role permissions
- AI summary flow
- newcomer adaptation
- team event / task create flow
- team detail
- career layer, pokud už je v repu rozdělaná

======================================================================
CO JE IN SCOPE PRO TUTO PRVNÍ IMPLEMENTACI
======================================================================

Toto je PRVNÍ IMPLEMENTAČNÍ VLNA, ne finální polish.

Implementuj:

A) Nový Team Overview layout shell
- lepší hierarchy of value
- first fold manažerský briefing
- rozumné sekce
- čitelnější desktop layout
- bez přestřeleného redesignu unrelated částí

B) Manažerský briefing
- horní priorita stránky
- odpoví během pár sekund:
  - kdo vyžaduje pozornost
  - kolik nováčků je v adaptaci
  - jak si tým stojí
  - co je tento týden důležité
- reuse existující KPI + alerts + adaptation data

C) Attention / needs support blok
- top lidé vyžadující pozornost
- manažerský tone of voice
- důvod + doporučený další krok
- ne represivní copy

D) Kariérní přehled týmu
- pokud je career layer již k dispozici, ukaž:
  - program
  - větev
  - pozici
  - stav evaluace
  - missing/manual stavy
- nehalucinuj tvrdé promotion readiness

E) Pool split Beplan / Premium Brokers
- kompaktní, ale jasně čitelné
- ne jako další zbytečný widget
- musí dávat smysl produktově

F) Struktura týmu / pyramida
- využij existující hierarchy source
- neintegruj celou klientskou mindmap doménu
- může to vizuálně připomínat mindmap princip, ale doménově to musí zůstat team hierarchy
- klik na člena má být napojený na selection / detail

G) Týmový rytmus / interní termíny
- lehká operační vrstva
- upcoming + overdue + doporučené navázání
- reuse existující events/tasks/team-events logiku, pokud je dostupná
- nebuduj nový kalendářový engine

H) People area
- přehled členů týmu
- filtr / search
- kompaktní career context
- selection do detailu

I) Detail člena
- v rámci stejné obrazovky nebo navázaného panelu
- zobraz:
  - základní kariérní kontext
  - coaching summary
  - 1:1 agenda
  - readiness / activity progress
  - doporučený další krok
- kde chybí data, přiznej je

======================================================================
CO JE OUT OF SCOPE
======================================================================

- broad redesign celého portálu
- nový kalendářový engine
- nový promotion engine
- přesné kariérní výpočty z PDF bez datových zdrojů
- enterprise BI
- director mega-dashboard navíc
- nové velké dependencies
- mindmap domain rewrite
- unrelated refactor jiných modulů

======================================================================
POVINNÉ PRODUKTOVÉ PRINCIPY
======================================================================

1. Team Overview se nesmí chovat jako dozor nad lidmi.
Má působit jako:
- zdravý přehled
- coaching cockpit
- přehled růstu
- přehled adaptace
- přehled navázání a vedení týmu

2. Musí být oddělené:
- system role
- career program
- career track
- career position

3. Beplan a Premium Brokers se nesmí slévat do jednoho nesmyslného modelu.
Pool split musí být čitelný.

4. BJ vs BJS musí být konzistentní podle poolu.
Nikde nechci nahodilé míchání jednotek.

5. Mindmap lze použít jen jako inspirační vizuální princip.
Ne jako přímý source of truth pro team hierarchy.

======================================================================
SOUBORY, NA KTERÉ SE SOUSTŘEĎ
======================================================================

Primárně audituj a upravuj jen relevantní scope:

- apps/web/src/app/portal/team-overview/page.tsx
- apps/web/src/app/portal/team-overview/TeamOverviewView.tsx
- apps/web/src/app/portal/team-overview/[userId]/TeamMemberDetailView.tsx
- apps/web/src/app/portal/team-overview/TeamCalendarModal.tsx
- apps/web/src/app/actions/team-overview.ts
- apps/web/src/app/actions/team-events.ts
- apps/web/src/lib/team-hierarchy.ts
- apps/web/src/lib/team-hierarchy-types.ts
- apps/web/src/shared/rolePermissions.ts

A pokud už v repu existuje career layer:
- career config
- career evaluator
- team-overview-career-ladders docs
- related helpers/selectors/types

Nepřelézej do unrelated částí repo, pokud to není nutné.

======================================================================
POVINNÝ IMPLEMENTAČNÍ PŘÍSTUP
======================================================================

Postupuj takto:

1) Nejdřív auditni aktuální Team Overview a najdi nejlepší reuse body.
2) Pak implementuj layout shell a hierarchy of value.
3) Potom přepoj jednotlivé bloky na existující data.
4) Až pak dělej lehké UI sjednocení.
5) Nakonec udělej typecheck / lint relevantního scope.

DŮLEŽITÉ:
- žádný greenfield page dump
- žádné vymýšlení fiktivních API
- žádné duplikování source of truth
- žádné fake hardcoded business výpočty, které nejsou v datech
- tam, kde data nejsou, ukaž neutral / missing / manual state

======================================================================
CO CHCI V UI V TÉTO VLNĚ
======================================================================

Pořadí sekcí musí být přibližně:

1. Manažerský briefing
2. Kdo vyžaduje pozornost
3. Kariérní přehled týmu
4. Role vs kariéra / pool kontext
5. Adaptace a rozvoj
6. Struktura týmu / pyramida
7. Týmový rytmus / interní termíny
8. Lidé v týmu
9. Detail člena

Nemusí to být pixel-final.
Ale musí to být už produkčně rozumné a produktově silné.

======================================================================
COPY PRAVIDLA
======================================================================

Používej manažerský tone:
- Potřebuje pozornost
- Vyžaduje doplnění
- Na dobré cestě
- V adaptaci
- Stabilní
- Doporučené navázání
- Chybí data
- Ruční ověření

Nepoužívej:
- slabý člověk
- problémový člen
- neúspěšný poradce
- rizikový člověk

======================================================================
DATA / EDGE CASE PRAVIDLA
======================================================================

- BJ/BJS vždy podle poolu
- pokud career data chybí, ukaž to explicitně
- pokud hierarchy není kompletní, neschovávej to tichým faily
- pokud interní termíny nejdou plně dohledat, ukaž rozumný partial state
- pokud Manager scope neobsahuje full data, respektuj to
- nic nesmí leaknout mimo role/scope

======================================================================
EXPECTED OUTPUT
======================================================================

1) Implementované změny v relevantních souborech
2) Krátké shrnutí v chatu:
- co bylo reuseováno
- co bylo nově postaveno
- co zůstává partial / manual / future phase
- jaké jsou případné blokery

======================================================================
ACCEPTANCE CRITERIA
======================================================================

Ber tento krok jako hotový jen pokud:

1. Team Overview má nový layout shell a hierarchy of value.
2. Existuje first fold manažerský briefing.
3. Attention blok funguje nad reálnými daty nebo poctivým reuse.
4. Kariérní vrstva je vidět tam, kde data existují.
5. Pool split Beplan / PB je čitelný.
6. Struktura týmu / pyramida je napojená na hierarchy source.
7. Týmový rytmus / interní termíny mají aspoň první praktickou vrstvu.
8. People area a detail člena jsou provázané.
9. BJ/BJS jsou sjednocené podle poolu.
10. Typecheck relevantního scope projde nebo jsou jasně vypsané blokery.

======================================================================
VÝSTUP DO CHATU
======================================================================

Na konci napiš stručně:
- které soubory jsi upravil
- co je hotové ve vlně 1
- co je záměrně odložené
- jaký má být další prompt@Downloads/TeamOverviewPremiumPreview.tsx @Developer/Aidvisora/docs/team-overview-masterplan.md @Downloads/TeamOverviewPremiumPreview.helpers.test.ts 

---

**Cursor**

Provádíme audit Aidvisora repa a implementujeme první vlnu Team Overview podle masterplanu. Prohlížíme klíčové soubory.



Prohlížíme strukturu: rozdělíme kariéru a adaptaci, přidáme pool split (Beplan / Premium Brokers), přesuneme pyramidu před rytmus, přidáme vyhledávání v sekci Lidé a sjednotíme popisky BJ/BJS.



Provádíme strukturální úpravy: přidáváme `poolSplit`, vyhledávání, rozdělení sekcí a přeuspořádání panelů.



Provádíme velkou náhradu: kariérní sekce bez adaptace, nový pool blok, samostatná adaptace, prohození panelů.



## Shrnutí

Repozitář už měl silný základ (briefing, pozornost, kariérní agregáty, rytmus, struktura). Doplnil jsem **produkční pořadí sekcí podle masterplanu**, **oddělený pool Beplan / Premium Brokers** ze stejných dat jako kariérní vrstva (`careerProgramId` v metrikách), **rozdělení kariéry a adaptace**, **strukturu před rytmem**, **vyhledávání lidí** a **sjednocení BJ/BJS v copy** (tabulka + detail člena).

### Co bylo reuseované
- `getTeamOverviewKpis`, `getTeamMemberMetrics`, `buildTeamAlertsFromMemberMetrics`, `getNewcomerAdaptation`, `getTeamHierarchy`, `getTeamRhythmCalendarData`, `buildTeamCareerSummaryBlock`, `buildTeamCoachingAttentionList`, `computeTeamRhythmView`
- `TeamStructurePanel`, `TeamRhythmPanel`, `TeamCalendarModal`, AI shrnutí a zbytek stránky beze změny logiky dat

### Co je nově / upraveně ve vrstvě UI
- Sekce **Kariérní přehled týmu** (jen kariéra) → **Role vs kariéra · rozdělení poolů** (počty + součet jednotek CRM per pool + nevyplněný program) → **Adaptace a rozvoj** → **Struktura týmu** → **Týmový rytmus** → **Lidé v týmu** s vyhledáváním
- **Manažerský briefing**: doplněn řádek „Jak si tým stojí“ (trend produkce / týmový cíl)
- **Detail člena**: pod metrikami krátká poznámka podle `careerProgramId` (BJ vs BJS vs obecně)

### Záměrně částečné / další fáze
- Inline **výběr řádku** (highlight) bez změny URL — zatím jen odkazy do detailu
- **Plná pyramida** jako samostatná vizualizace** — stále strom z `getTeamHierarchy`; jen pořadí a copy
- **Uložené AI shrnutí vs scope** — stávající disclaimer beze změny (viz release checklist)

### Blokery
- Žádné; `pnpm exec tsc --noEmit` v `apps/web` proběhl v pořádku.

### Upravené soubory
- `apps/web/src/app/portal/team-overview/TeamOverviewView.tsx`
- `apps/web/src/app/portal/team-overview/[userId]/TeamMemberDetailView.tsx`

**Git:** commit `370eb27e` na `main` (push proběhl). Pokud se název vlákna v Cursoru liší od předmětu commitu, uprav ho u sebe `git commit --amend` podle vašeho pravidla.

### Další prompt (návrh)
Pro **vlnu 2** můžete napsat např.: *„Zarovnej Team Overview s `TeamOverviewPremiumPreview.tsx` jen v desktop gridu a typografii; nezasahuj do `team-overview.ts`; přidej volitelný compact režim pro KPI spodní části.“* A přiložit konkrétní výřez z `Downloads/TeamOverviewPremiumPreview.tsx` pro sekce, které chcete vizuálně dorovnat.

---

**Migrace SQL:** Žádné SQL migrace nejsou potřeba.

---

**User**

Jsi senior full-stack engineer a product-minded implementer v repo Aidvisora.

Navazuješ na první implementační vlnu Team Overview.
Teď nechci další mock ani další izolovaný preview screen.
Teď chci skutečný data wiring a production-oriented integraci do existujícího Team Overview.

======================================================================
HLAVNÍ CÍL TOHOTO KROKU
======================================================================

Napoj Team Overview na reálné existující zdroje dat v repu tak, aby nová struktura stránky nebyla jen hezká kostra, ale reálně fungující modul.

Tento krok má dodat:

1) skutečné napojení hlavních bloků na existující server actions / selectors / helpers
2) sjednocení derived dat pro page-level rendering
3) odstranění zbytečných duplikací logiky mezi Team Overview a detailem člena
4) první stabilní production-grade read model pro Team Overview
5) správné role / scope chování
6) poctivé partial / manual / missing states tam, kde data nejsou kompletní

======================================================================
CO JE CÍL V PRAXI
======================================================================

Chci, aby Team Overview nebyl:
- mock
- ručně seskládaný screen
- sada nesourodých fetchů a výpočtů v komponentách

Chci, aby byl:
- data-driven
- role-safe
- reuse-friendly
- přehledný
- rozumně výkonný
- dobře rozšiřitelný pro další polish a QA

======================================================================
POVINNÝ PŘÍSTUP
======================================================================

Nejdřív auditni současné Team Overview data flow a identifikuj:
- odkud se berou KPI
- odkud se berou alerts
- odkud se bere hierarchy
- odkud se bere adaptation
- odkud se bere career context, pokud už je v repu
- odkud se berou team events / tasks / interní termíny
- jak je dnes řešen detail člena
- jak je řešen AI summary / insight vrstva
- kde dnes vzniká duplicitní shaping dat

Potom navrhni a implementuj JEDEN rozumný page-level data shaping flow.

======================================================================
CO MÁŠ IMPLEMENTOVAT
======================================================================

A) Page-level Team Overview data model

Vytvoř nebo sjednoť derived model pro Team Overview stránku tak, aby z něj šly renderovat hlavní sekce:

- briefing
- attention list
- career summary
- pool split
- adaptation / learning block
- hierarchy tree
- team rhythm / internal terms
- people list
- selected member summary / detail

Nechci, aby každá sekce tahala vlastní malý svět logiky.
Chci co nejvíc centralizovaný, ale stále čitelný page model.

Pokud to dává smysl, vytvoř něco jako:
- buildTeamOverviewPageModel(...)
nebo obdobný selector / server helper

Tento model musí být poctivě složený z existujících datových zdrojů.

======================================================================
B) Briefing + attention wiring

Napoj briefing a attention sekci na reálné zdroje:
- existing KPIs
- alerts
- newcomer adaptation
- career evaluation / context, pokud existuje
- scope

Chci:
- briefing counts z reálných dat
- attention list z reálných signálů
- reason / action text z odvoditelné logiky, ne jen ruční placeholder

Kde data nestačí:
- ukaž neutral / partial state
- nehalucinuj falešnou přesnost

======================================================================
C) Pool split + BJ/BJS consistency

Pool split musí být z reálných dat.
Nepředpokládej mock.
Zjisti, kde je v repu zdroj pro členství / typ spolupráce / tenant / pool rozlišení.

Zajisti:
- konzistentní zobrazení Beplan vs Premium Brokers
- konzistentní jednotky BJ / BJS podle poolu
- žádné nahodilé míchání jednotek napříč UI

Pokud není pool u všech lidí dostupný:
- zaveď partial state
- případně fallback label
- ale nevymýšlej si

======================================================================
D) Career layer integration

Pokud už je v repu career program / track / position vrstva:
- připoj ji do Team Overview page modelu
- nepřepočítávej ji separátně v několika komponentách
- reuseuj shared evaluator / selector

Chci pro Team Overview:
- current program
- current track
- current position
- next step
- evaluation state
- completeness
- missing/manual markers

Pro people list:
- kompaktní summary line nebo badge set
Pro detail:
- rozšířenější breakdown

Kde career vrstva v datech chybí:
- explicitní neutral state
- ne fake readiness

======================================================================
E) Hierarchy / structure integration

Napoj strukturu týmu na skutečnou hierarchy logiku v repu.
Nechci nový fake tree builder mimo doménu.

Požadavky:
- reuse existující hierarchy source
- respektuj parent relationships a role scope
- klik na člověka musí měnit selected member state
- selected member musí být použitelný v detail panelu
- pokud hierarchy není kompletní, ukaž rozumné warning / info state

Neintegruj klientskou mindmap doménu.
Pouze vizuálně se jí může layoutově inspirovat.

======================================================================
F) Team rhythm / internal terms wiring

Teď už chci první skutečné napojení na interní termíny / follow-upy.

Prověř existující source of truth pro:
- tasks
- events
- team events
- internal appointments
- create flows
- AI-created follow-up actions

Implementuj lehký read model pro Team Overview:
- nadcházející relevantní interní položky
- overdue / delayed položky
- doporučené navázání, pokud lze odvodit z existujících dat

Nechci nový kalendářový engine.
Chci reuse existujících entit a jen rozumný Team Overview read layer.

======================================================================
G) People list + search + filtering wiring

People area musí jet nad skutečnými lidmi ve scope.

Napoj:
- list členů
- selected member
- tabs / filtery
- search

Filtry mají fungovat aspoň pro:
- all
- attention
- adaptation
- managers
- healthy

Pokud některé filtry nejdou přesně spočítat z reálných dat:
- použij poctivý proxy / partial logic
- zdokumentuj to
- nepředstírej přesnost

======================================================================
H) Selected member panel / detail wiring

Napoj pravý detail panel nebo selected member summary na reálná data.

Chci:
- member identity + role
- pool / program / track / position
- production / meetings / activity
- coaching summary nebo derived explanation
- agenda / recommended next step
- cadence / last touchpoint, pokud jde zjistit
- missing / blockers / manual items

Pokud se část dat bere z member detail view:
- reuseuj existující shaping
- nesepisuj úplně jinou logiku zvlášť pro Team Overview

======================================================================
I) Shared helpers a cleanup

Po wiring kroku očekávám cleanup:
- odstranit duplicity helperů
- sjednotit formatting BJ/BJS
- sjednotit summary line logiku
- sjednotit tone labels
- přesunout derived helpers tam, kde dávají smysl
- neudělat broad refactor unrelated částí

======================================================================
SCOPE SOUBORŮ
======================================================================

Primárně pracuj v těchto souborech nebo jejich bezprostředním okolí:

- apps/web/src/app/portal/team-overview/page.tsx
- apps/web/src/app/portal/team-overview/TeamOverviewView.tsx
- apps/web/src/app/portal/team-overview/[userId]/TeamMemberDetailView.tsx
- apps/web/src/app/actions/team-overview.ts
- apps/web/src/app/actions/team.ts
- apps/web/src/app/actions/team-events.ts
- apps/web/src/lib/team-hierarchy.ts
- apps/web/src/lib/team-hierarchy-types.ts
- apps/web/src/shared/rolePermissions.ts

A pokud existují:
- team overview selectors
- career evaluators
- shared team detail helpers
- related docs

======================================================================
CO NEDĚLAT
======================================================================

- nedělej broad redesign znovu
- nedělej nový kalendářový engine
- nedělej nový promotion engine
- nebuduj separátní mock data vrstvu
- neduplikuj hierarchy source
- neduplikuj career evaluator
- nepiš fake business výpočty tam, kde nejsou data
- nechoď do unrelated modulů
- neřeš finální pixel polish
- neřeš marketingové copy bannery

======================================================================
POVINNÁ KVALITA VÝSTUPU
======================================================================

Po tomto kroku chci, aby šlo říct:
- Team Overview už stojí na skutečných datech
- hlavní bloky jsou napojené
- selected member funguje
- filtry a search fungují
- role/scope drží
- partial states jsou poctivé
- kód je čistší než před tímto krokem

======================================================================
ACCEPTANCE CRITERIA
======================================================================

Ber tento krok jako hotový jen pokud:

1. Existuje sjednocený page-level data shaping flow pro Team Overview.
2. Briefing používá reálná data.
3. Attention blok používá reálné signály nebo poctivě odvozené partial signály.
4. Pool split je napojený na reálná data nebo jasně fallbackuje.
5. BJ/BJS jsou jednotné a konzistentní.
6. Career data jsou připojená tam, kde existují.
7. Hierarchy tree je napojený na reálnou hierarchy logiku.
8. Team rhythm používá aspoň první reálný read model.
9. People list, search, tabs a selected member fungují nad reálným datasetem.
10. Kód neobsahuje zbytečně duplikovanou shaping logiku napříč komponentami.
11. Typecheck relevantního scope projde nebo jsou jasně vypsané blokery.

======================================================================
VÝSTUP DO CHATU
======================================================================

Na konci napiš stručně:
- jaký page-level data model / shaping flow jsi zavedl
- co je už skutečně napojené na repo data
- co je pořád partial / manual / fallback
- jaké soubory jsi upravil
- jaký má být další prompt

---

**Cursor**

Provádíme audit datového toku a implementujeme sjednocený page model včetně výběru člena a panelu detailu.



Implementujeme centrální `buildTeamOverviewPageModel`, serverový snapshot pro jeden fetch, sdílené coaching bullets a panel vybraného člena včetně úprav struktury týmu.



Provádíme implementaci: přidáváme soubory a postupně refaktorujeme view.



Provádíme postupné úpravy `TeamOverviewView.tsx`: nejdřív importy, props, state, `refresh` a `pageModel`.



## Page-level data shaping

**`buildTeamOverviewPageModel`** (`apps/web/src/lib/team-overview-page-model.ts`)  
Jeden vstup: `kpis`, `members`, `metrics`, `newcomers`, `alerts`, `rhythmCalendar`, `scope`. Vrací:

- **`briefing`** – copy + **`attentionCount`** z KPI / alertů  
- **`careerTeamSummary`** – přes existující `buildTeamCareerSummaryBlock`  
- **`coachingAttention`** – přes `buildTeamCoachingAttentionList`  
- **`poolSplit`** – podle `careerEvaluation.careerProgramId` v metrikách  
- **`rhythmComputed`** – přes existující `computeTeamRhythmView` + data z `getTeamRhythmCalendarData`  
- **`attentionUserIds`** – sjednocení CRM alertů a coaching výběru (pro filtr „pozornost“)

**`getTeamOverviewPageSnapshot`** (`team-overview.ts`)  
Jeden paralelní read (stejné zdroje jako dřív stránka) + `alerts` z `buildTeamAlertsFromMemberMetrics`. Obnovení v klientovi volá jen tuto akci.

**Sdílená logika s detailem**

- **`buildTeamMemberCoachingSummaryBullets`** – dřívější `buildCoachingSummary` z detailu  
- **`crmUnitsFootnoteForProgram`** – jednotná BJ / BJS copy podle poolu  

---

## Co je napojené na reálná data

- Briefing, KPI karty, pozornost, kariérní blok, pool, adaptace, hierarchie (`getTeamHierarchy`), rytmus (`getTeamRhythmCalendarData` → `computeTeamRhythmView`), tabulka lidí, AI blok (beze změny)  
- **Výběr člena**: `getTeamMemberDetail(userId, { period, scope })` – stejný serverový shaping jako `/team-overview/[userId]`  
- **URL**: `?period=` a `?member=` + `router.replace` při výběru / období  
- **Filtry**: `PeopleSegmentFilter` + výkon (top/bottom) + vyhledávání  

---

## Co zůstává partial / proxy

- **„Stabilní“** – `riskLevel === "ok"` a není v adaptačním okně (zjednodušený proxy; popsáno u filtrů)  
- **Rytmus / interní typy** – stále heuristiky v `team-rhythm` (disclaimer v datech)  
- **KPI duplicitní dotaz** uvnitř `getTeamOverviewKpis` – předchozí chování, záměrně bez velkého refaktoru DB  

---

## Upravené / nové soubory

| Soubor | Role |
|--------|------|
| `lib/team-overview-page-model.ts` | **nový** – centrální model + segment filtr |
| `lib/team-member-coaching-bullets.ts` | **nový** – sdílené coaching odrážky |
| `lib/career/crm-units-copy.ts` | **nový** – BJ/BJS footnote |
| `app/actions/team-overview.ts` | `getTeamOverviewPageSnapshot` + typ |
| `portal/team-overview/page.tsx` | snapshot + `member` + `canEditTeamCareer` |
| `TeamOverviewView.tsx` | model, snapshot refresh, segment, výběr, grid + panel |
| `TeamOverviewSelectedMemberPanel.tsx` | **nový** – panel z `TeamMemberDetail` |
| `TeamStructurePanel.tsx` | výběr vs odkaz Detail |
| `[userId]/TeamMemberDetailView.tsx` | importy z nových helperů |

**Git:** `f3679181` na `main`.

---

## Další prompt (návrh)

*Např.:* „Sjednoť zpětný odkaz z `/portal/team-overview/[userId]` na přehled s `?member=` a `period=`, přidej shallow sync `initialSelectedMemberId` při změně searchParams bez full reload, a případně optimalizuj dvojí volání metrik uvnitř `getTeamOverviewKpis`.“*

---

**Migrace SQL:** Žádné SQL migrace nejsou potřeba.

---

**User**

Jsi senior full-stack engineer a product-minded implementer v repo Aidvisora.

Navazuješ na předchozí implementační kroky Team Overview.
Teď nechci další mock ani další broad feature wave.
Teď chci STABILIZAČNÍ A CLEANUP FÁZI, která připraví Team Overview na kvalitní UX/UI polish a finální demo.

======================================================================
HLAVNÍ CÍL TOHOTO KROKU
======================================================================

Dotáhni Team Overview do technicky čistšího, stabilnějšího a lépe udržovatelného stavu tak, aby:

1) role / scope byly korektní
2) selected member flow byl konzistentní
3) hierarchy / people / detail používaly sdílenou logiku
4) kód nebyl přerostlý v jednom souboru
5) preview-like struktura byla rozumně rozdělená do menších produkčních komponent
6) edge cases nerozbíjely UI
7) modul byl připravený na finální UX/UI polish v dalším promptu

======================================================================
PRIORITA TOHOTO KROKU
======================================================================

Tohle je engineering + stabilization krok.

Neřeš ještě:
- finální pixel polish
- finální spacing pass
- finální copy pass
- velké vizuální ladění

Teď řeš:
- architekturu komponent
- role/scope
- state flow
- derived helpers
- edge cases
- runtime consistency
- cleanup

======================================================================
CO JE IN SCOPE
======================================================================

A) Rozdělení Team Overview na menší komponenty

Rozsekej přerostlý Team Overview na logické komponenty, například podle toho, co reálně dává smysl v repo:

- TeamOverviewBriefing
- TeamOverviewAttentionList
- TeamOverviewCareerSummary
- TeamOverviewPoolSplit
- TeamOverviewQuestionsBlock nebo obdobný helper/info block, jen pokud dává smysl ponechat
- TeamOverviewLearningBlock
- TeamOverviewHierarchyPanel
- TeamOverviewRhythmPanel
- TeamOverviewPeopleList
- TeamOverviewMemberPanel
- shared pills / metric cards / toggle group / progress bar helpers

Neber názvy dogmaticky.
Vyber takovou strukturu, která sedí na repo.

PRAVIDLO:
- nerozpadnout to na 20 mikro komponent bez hodnoty
- ale také nenechat vše v jednom obřím souboru

======================================================================
B) Shared helpers a derived logic cleanup

Zkontroluj a sjednoť helpery jako:
- getUnitByPool
- formatProduction
- getFilteredMembers
- getStats
- getPoolSplit
- buildTree
- collectDescendants
- getAttentionReason
- tone mapping helpers
- state label helpers

Cíl:
- žádné zbytečné duplicity
- helpery přesunout tam, kde dávají smysl
- neudělat utility chaos
- zachovat čitelnost

======================================================================
C) Role / scope consistency

Ověř a případně oprav:
- Manager scope
- Director scope
- Admin scope
- Advisor self scope
- Viewer behavior, pokud je relevantní

Speciálně zkontroluj:
- kdo vidí koho v people listu
- kdo může otevřít detail člena
- kdo vidí career summary
- kdo vidí hierarchy
- kdo vidí rhythm / internal items
- kdo může použít create / follow-up CTA, pokud jsou napojené

Nechci žádný role leak.
Nechci ani zbytečně rozbitý self-scope.

======================================================================
D) Selected member flow

Teď chci důsledně vyřešit selected member flow.

Zajisti:
- klik v people listu vybere člena
- klik ve struktuře týmu vybere člena
- selected member panel je vždy konzistentní
- při filtrování / search se selected state nerozbije
- když selected member odpadne z filtru, nastav rozumný fallback
- při prázdném výsledku filtru nepadá detail panel

Tohle musí být robustní.

======================================================================
E) Hierarchy edge cases

Prověř a ošetři:
- missing parentId
- sirotky ve stromu
- nulový tým
- malý tým
- větší větev
- selected member mimo aktuální scope
- current user bez dobře zadané hierarchie

Kde to dává smysl:
- ukaž warning / info state
- ne maskovat chybu tichým fail
- ale nepřehltit UI zbytečnými alerts

======================================================================
F) People filters + search cleanup

Dotahej people list tak, aby:
- filtry byly konzistentní
- search byl stabilní
- count odpovídal
- tabs nevracely nesmysly
- healthy / attention / adaptation / managers logika byla jasná

Kde je logika jen proxy:
- jasně to přiznej v kódu a případně v helper názvu
- nepředstírej exaktní business logiku, pokud není datový source of truth

======================================================================
G) Pool / unit consistency

Udělěj tvrdý cleanup:
- nikde se nesmí nahodile střídat BJ a BJS
- vše musí jít přes sdílený formatter
- pool label / tone / units musí být konzistentní
- Beplan vs Premium Brokers musí být ve všech blocích stejné

Tohle je povinné.
Žádné ruční stringy rozházené po komponentách.

======================================================================
H) Runtime / fallback / empty states cleanup

Zkontroluj hlavní bloky:
- briefing
- attention list
- career summary
- hierarchy
- rhythm panel
- people list
- member detail panel

U každého ošetři:
- empty state
- partial state
- missing state
- fallback state
- invalid selected state

Nechci, aby to fungovalo jen na ideálních datech.

======================================================================
I) Performance sanity pass

Nechci velký performance refactor.
Chci lehký sanity pass:

- zbytečné re-rendery
- zbytečné derived výpočty v renderu
- useMemo tam, kde dává smysl
- žádné zbytečné těžké operace v child komponentách
- tree / filters / stats a podobné věci držet rozumně centralizované

Když uvidíš větší performance problém:
- zdokumentuj ho
- neopravuj za cenu broad refactoru

======================================================================
J) Test / checks vrstva

Pokud už existuje test file nebo helper testy, rozšiř je.

Minimálně chci testovat helpery typu:
- getUnitByPool
- formatProduction
- getFilteredMembers
- buildTree
- getStats
- getPoolSplit

Pokud v projektu není jednoduché unit test setup místo, napiš aspoň čisté helpery tak, aby testovatelnost byla dobrá.

NEPŘEPISUJ EXISTUJÍCÍ TESTY, pokud nejsou jasně špatně.

======================================================================
K) Dokumentace

Aktualizuj příslušný doc nebo vytvoř krátký technický doplněk, například:
docs/team-overview-implementation-notes.md

Sepiš:
- jak je Team Overview rozdělený do komponent
- kde jsou shared helpers
- jak funguje selected member flow
- jak fungují people filters
- jak je sjednocený pool/unit formatting
- jaké edge cases jsou ošetřené
- co ještě zůstává na finální polish

======================================================================
CO NEDĚLAT
======================================================================

- nedělej finální UX/UI polish
- nedělej marketingový copy pass
- nedělej broad redesign
- nedělej nový kalendářový engine
- nedělej nový promotion engine
- nepřepisuj unrelated moduly
- nerozděluj kód do absurdního množství mini souborů
- neřeš věci mimo Team Overview scope

======================================================================
KVALITATIVNÍ PRAVIDLA
======================================================================

Kód musí být po tomto kroku:
- čistší
- kratší na jednotlivé soubory
- méně křehký
- lépe čitelný
- lépe připravený na finální polish
- stále funkční

Nesmí vzniknout:
- utility džungle
- prop drilling chaos bez důvodu
- přehnané abstraction theatre
- broad refactor půlky repa

======================================================================
ACCEPTANCE CRITERIA
======================================================================

Ber tento krok jako hotový jen pokud:

1. Team Overview už není jeden přerostlý soubor bez struktury.
2. Hlavní bloky jsou rozdělené do rozumných komponent.
3. Shared helpery jsou sjednocené a čitelné.
4. Role / scope neobsahují zjevný leak.
5. Selected member flow je robustní.
6. People filters + search fungují konzistentně.
7. BJ/BJS a pool logika jsou všude jednotné.
8. Empty / partial / fallback states jsou rozumně ošetřené.
9. Helper logika je testovatelnější a případně rozšířená o testy.
10. Dokumentace je aktualizovaná.
11. Kód je připravený na finální UX/UI polish prompt.

======================================================================
VÝSTUP DO CHATU
======================================================================

Na konci napiš stručně:
- jak jsi rozsekal Team Overview do komponent
- které shared helpery jsi sjednotil
- co jsi opravil ve selected member flow
- co jsi opravil v role/scope nebo edge cases
- co jsi přidal za testy / checks
- jaký má být další prompt po tomto kroku

---

**Cursor**

Provádíme stabilizační fázi: prohlížíme stav `TeamOverviewView` a existující helpery, poté rozdělíme komponenty a sjednotíme logiku.



Implementujeme: přidáme sdílené helpery, logiku členů a vyextrahujeme komponenty.



Vytváříme komponenty a upravujeme hlavní view: přidáváme validaci výběru a aktualizujeme panel.



Přidávám komponenty a zjednodušuji `TeamOverviewView`. Nejdřív sjednotím `formatNumber` v `page-model` a panelu.



Dokončujeme integraci: vytváříme komponenty a upravujeme `TeamOverviewView.tsx`.



Vytvářím komponenty a upravuji hlavní view.



Provádíme rozsáhlou úpravu `TeamOverviewView.tsx`: nahrazujeme úvodní blok a tělo komponent.



Spouštím skript, který nahradí velký blok JSX (soubor stále odkazuje na odstraněné symboly).



## Shrnutí dokončené stabilizace

### Rozdělení Team Overview
Logika zůstává v `TeamOverviewView.tsx` (~590 řádků); sekce jsou v `apps/web/src/app/portal/team-overview/components/`:

- **Briefing** → `TeamOverviewBriefing`
- **Pozornost / coaching** → `TeamOverviewAttentionSection` (včetně režimu „Já“)
- **Kariéra** → `TeamOverviewCareerSummarySection`
- **Pool Beplan / PB** → `TeamOverviewPoolSplitSection`
- **Adaptace** → `TeamOverviewAdaptationSection`
- **Filtry + počet** → `TeamOverviewPeopleFiltersBar`
- **Tabulka / mobil** → `TeamOverviewMembersTable`
- **CRM KPI mřížka** → `TeamOverviewKpiDetailSection` + `TeamOverviewTrendIndicator`
- **Trend výkonu** → `TeamOverviewPerformanceTrendSection`
- **AI shrnutí** → `TeamOverviewAiTeamSummarySection` + `TeamOverviewAiFeedbackBlocks`
- **Plný výpis alertů** → `TeamOverviewFullAlertsSection`

### Sdílené helpery
- `team-overview-format.ts` — čísla, podtitulek jednotek, `poolCardUnitsFootnote` / `poolProgramLabel` / `poolUnitsLineLabel`
- `team-overview-members.ts` — řazení, `getVisibleTeamMembers`, `isSelectedMemberInScope`, `isSelectedInFilteredList`
- `team-overview-career-badges.ts` — třídy štítků v tabulce
- `team-overview-page-model.ts` — briefing už používá `formatTeamOverviewProduction` místo lokálního formátu

### Selected member flow
- Po refreshi scope: pokud `?member=` už není v `members`, výběr se **vymaže** (URL přes `selectMember(null)`).
- Pokud je člen v rozsahu, ale **neprojde filtrem tabulky**, panel dostane **`outsideFilter`** (info pruh), výběr se nemusí rušit.
- Prázdný filtr: tabulka má empty state, panel zůstane v konzistentním stavu.

### Role / scope
- Rozsahy v hlavičce beze změny (Advisor/Viewer jen „Já“, Manager + „Můj tým“, Director/Admin + „Celá struktura“).
- Signály pro výběr zůstávají v rámci načtených `members` / server actions.

### Testy
- `team-overview-format.test.ts`, `team-overview-members.test.ts`, `team-overview-page-model.test.ts` (pool split přes `buildTeamOverviewPageModel`) — **13 testů**, `vitest run` prošel.

### Dokumentace
- `docs/team-overview-implementation-notes.md` — struktura, helpery, flow, filtry, edge cases, co zbývá na polish.

### Git
- Commit a push na `main`: `92a7310e` (název vlákna v Cursoru prosím případně sladit s pravidlem pro přesný subject — použitý subject je popisný).

---

**Další prompt (doporučení):** zaměřit se výhradně na **finální UX/UI polish** Team Overview podle `docs/team-overview-masterplan.md` a `team-overview-implementation-notes.md` — spacing, typografie, copy, konzistence stavů (bez měnění datových akcí a architektury komponent).

---

**Migrace SQL:** Žádné SQL migrace nejsou potřeba.

---

**User**

Jsi senior full-stack engineer a release-minded product implementer v repo Aidvisora.

Navazuješ na předchozí implementační, integrační, cleanup a UX/UI polish fáze Team Overview.
Teď nechci další feature wave.
Teď chci FINÁLNÍ QA / DEMO READINESS / RELEASE CHECKLIST PASS.

======================================================================
HLAVNÍ CÍL TOHOTO KROKU
======================================================================

Dotáhni Team Overview do stavu, kdy bude:

1) stabilní
2) role-safe
3) konzistentní
4) použitelný na demo
5) připravený na release nebo bude mít jasně sepsané poslední blokery

Toto není feature prompt.
Toto je finální produkční sanity pass.

======================================================================
PRODUKTOVÝ CÍL
======================================================================

Po tomto kroku chci mít jistotu, že Team Overview:

- nepůsobí rozbitě
- neukazuje nesmyslná data
- neleakuje data mimo scope
- drží pohromadě mezi briefingem, attention, kariérou, strukturou, rytmem a detailem člena
- je připravený k ukázce managerům / ředitelům / Beplanu / Premium Brokers

Pokud něco pořád není hotové:
- musí to být poctivě zdokumentované
- nesmí to rozbíjet UX
- musí to být uvedené jako known limitation nebo blocker

======================================================================
SCOPE TOHOTO KROKU
======================================================================

IN SCOPE:
- role / scope audit
- hierarchy edge cases
- selected member flow QA
- people filters/search QA
- pool / unit consistency QA
- career edge cases
- team rhythm / internal terms sanity pass
- empty / partial / fallback states audit
- performance sanity pass
- lint / typecheck relevantního scope
- release checklist
- known limitations
- lehké bezpečné fixy nalezených problémů

OUT OF SCOPE:
- nové feature
- broad redesign
- nový backend engine
- nový reporting modul
- nový kalendářový engine
- nový career engine
- unrelated refactors mimo Team Overview

======================================================================
ČÁST 1 — ROLE / SCOPE AUDIT
======================================================================

Proveď tvrdý audit pro:
- Advisor
- Viewer
- Manager
- Director
- Admin

Ověř:
- kdo vidí koho v Team Overview
- kdo může otevřít detail člena
- kdo vidí career summary
- kdo vidí pool split
- kdo vidí hierarchy / pyramidu
- kdo vidí team rhythm / interní termíny
- kdo může spustit create / follow-up CTA, pokud jsou napojené

Speciálně:
- Manager nesmí vidět cizí větev
- Advisor nesmí získat týmová data mimo self-scope
- Director/Admin musí mít správný širší scope
- Viewer se nesmí chovat nekonzistentně

Kde najdeš problém:
- oprav ho co nejlehčeji
- nebo ho zapiš jako blocker / known limitation

======================================================================
ČÁST 2 — HIERARCHY / TREE EDGE CASES
======================================================================

Prověř:
- chybějící parentId
- sirotky ve stromu
- nulový tým
- malý tým
- selected member mimo scope
- selected member mimo aktuální filtr
- current user bez dobře nastavené hierarchie
- collapse/expand chování
- selected state po změně scope nebo tabů

Očekávání:
- žádný tichý fail
- žádný rozbitý panel
- žádný nekonzistentní selected detail

Kde je to vhodné:
- přidej info / warning state
- ale nepřehlcuj UX

======================================================================
ČÁST 3 — PEOPLE AREA QA
======================================================================

Ověř a případně oprav:
- all filter
- attention filter
- adaptation filter
- managers filter
- healthy filter
- search
- kombinace filter + search
- count zobrazených lidí
- selected member fallback
- active row state

Chci mít jistotu, že people area je:
- stabilní
- scanovatelná
- konzistentní
- nepůsobí rozbitě při prázdném výsledku

======================================================================
ČÁST 4 — CAREER / POOL / UNIT CONSISTENCY QA
======================================================================

Zkontroluj a případně oprav:
- Beplan vs Premium Brokers labely
- BJ vs BJS jednotky
- pool tone / badge consistency
- track tone / badge consistency
- missing/manual states
- readiness / activity progress vizualizaci
- selected detail vs people row konzistenci

Nechci už nikde:
- náhodné BJ u PB
- náhodné BJS u Beplanu
- nekonzistentní labely
- konflikt mezi summary a detailem

======================================================================
ČÁST 5 — BRIEFING / ATTENTION / RHYTHM CONSISTENCY
======================================================================

Ověř:
- briefing counts
- attention list
- healthy list
- rhythm metrics
- recommended action copy
- next step copy
- selected detail copy

Chci mít jistotu, že:
- různé bloky si neprotiřečí
- attention důvody dávají smysl
- recommended next step sedí na member state
- rhythm panel nepůsobí jako odpojený widget
- healthy block opravdu ukazuje zdravé stavy

======================================================================
ČÁST 6 — EMPTY / PARTIAL / FALLBACK STATES AUDIT
======================================================================

Projdi hlavní bloky:
- briefing
- attention
- career summary
- role vs kariéra
- learning / adaptation
- structure tree
- rhythm panel
- people list
- detail člena

Ověř:
- co se stane při prázdných datech
- co se stane při partial datech
- co se stane při chybějících career datech
- co se stane při nulových interních termínech
- co se stane při malém týmu
- co se stane při search bez výsledků

Cíl:
- žádný mrtvý widget
- žádné prázdné bílé místo bez vysvětlení
- žádný rozbitý layout
- žádný silent nothing

======================================================================
ČÁST 7 — RESPONSIVE / DENSITY SANITY PASS
======================================================================

Udělej poslední sanity pass pro:
- desktop
- tablet
- menší viewport
- zalamování badge
- přetékání dlouhých textů
- selected panel flow
- tree čitelnost
- people row density
- CTA rozmístění

Nechci nový redesign.
Chci jen odstranit hlavní vizuální bugy a demo-breakery.

======================================================================
ČÁST 8 — PERFORMANCE SANITY PASS
======================================================================

Nechci velký refactor.
Chci pragmatický performance pass:

Ověř:
- zbytečné derived výpočty v renderu
- zbytečné re-rendery
- těžké výpočty bez memoizace
- tree build frequency
- filter/search derived calculations
- selected member recalculations
- duplicity helper calls

Kde je snadný win:
- oprav
Kde je větší problém:
- zdokumentuj jako future optimization

======================================================================
ČÁST 9 — TESTS / CHECKS
======================================================================

Pokud už jsou helper testy nebo runtime checks, rozšiř je.

Minimálně pokryj helpery typu:
- getUnitByPool
- formatProduction
- getFilteredMembers
- buildTree
- getStats
- getPoolSplit
- getAttentionReason
- případně selected member fallback logic

Neodstraňuj existující testy bez důvodu.
Doplň jen to, co zvyšuje důvěryhodnost.

======================================================================
ČÁST 10 — RELEASE CHECKLIST
======================================================================

Vytvoř nebo aktualizuj dokument:
docs/team-overview-release-checklist.md

Musí obsahovat minimálně:

1. Role / permission checklist
2. Scope / hierarchy checklist
3. Career / pool / unit checklist
4. Briefing / attention / rhythm consistency checklist
5. People area checklist
6. Selected member checklist
7. Empty / partial / fallback states checklist
8. Responsive sanity checklist
9. Performance sanity checklist
10. Known limitations
11. Blockers before release / demo
12. Demo script doporučení

Known limitations musí být poctivé.
Například:
- některé kariérní podmínky jsou stále manual / partial
- některé interní termíny mohou být jen first-pass read model
- kvalita struktury závisí na hierarchy datech
- cadence / follow-up logika je doporučovací, ne tvrdý workflow engine

======================================================================
ČÁST 11 — FINAL CLEANUP
======================================================================

Udělej finální cleanup relevantního scope:
- dead imports
- copy konflikty
- zbytečné duplicity
- drobné state flow nedostatky
- type / lint issues

Nepouštěj se do unrelated cleanupu mimo Team Overview scope.

======================================================================
IMPLEMENTAČNÍ PRAVIDLA
======================================================================

- nepřidávej nové feature
- nedělej broad refactor
- neopravuj kosmetiku za cenu rozbití wiring logiky
- role / scope correctness má vyšší prioritu než malé vizuální nuance
- kde něco nejde bezpečně dokončit, poctivě to zapiš
- release checklist a known limitations jsou povinné

======================================================================
ACCEPTANCE CRITERIA
======================================================================

Ber tento krok jako hotový jen pokud:

1. Role / scope audit proběhl a případné leaky jsou opravené nebo zdokumentované.
2. Hierarchy / selected member edge cases jsou rozumně ošetřené.
3. People filters + search fungují konzistentně.
4. BJ/BJS a pool logika jsou plně jednotné.
5. Briefing / attention / rhythm / detail si neprotiřečí.
6. Empty / partial / fallback states jsou použitelné.
7. Responsive hlavní problémy jsou ošetřené.
8. Helper tests / checks jsou rozšířené nebo zlepšené.
9. Existuje docs/team-overview-release-checklist.md
10. Team Overview je demo-ready nebo má jasně sepsané poslední blokery.

======================================================================
VÝSTUP DO CHATU
======================================================================

Na konci napiš stručně:
- jaké hlavní QA nálezy jsi našel
- co jsi opravil
- co zůstává known limitation
- jak dopadl performance sanity pass
- jestli je Team Overview demo-ready
- co by byl už jen případný poslední follow-up

---

**Cursor**

Provádíme finální QA pass: prozkoumáme serverové akce, scope a komponenty Team Overview, pak doplníme dokumentaci, testy a bezpečné opravy.



Opravujeme kritickou nekonzistenci: `getTeamMemberDetail` na stránce detailu nepředával `scope`, takže Director/Admin dostávali výchozí `my_team` místo `full` — riziko 404 při otevření člena z přehledu. Přidáváme `defaultLandingScopeForRole` a sjednocujeme odkazy.



## Hlavní QA nálezy

1. **Kritická nekonzistence scope (opraveno)**  
   `getTeamMemberDetail` používá `resolveScopeForRole(role, options?.scope)`. Při volání **bez** `scope` dostane Director/Admin výchozí **`my_team`**, zatímco přehled používá **`full`**. To mohlo vést k **Forbidden / 404 na detailu** u člena viditelného jen v „Celá struktura“.  
   **Řešení:** `defaultLandingScopeForRole` v `team-hierarchy-types.ts`, stejná logika jako u `team-overview/page.tsx`, předávání `scope` do `getTeamMemberDetail` na **`[userId]/page.tsx`**, volitelně `?scope=` z URL.

2. **URL a deep linky**  
   Přehled nečetl `?scope=` ze serveru; odkazy na detail neměly scope. **Řešení:** SSR čte `scope` z query, `syncTeamOverviewUrl` přidává `scope`, odkazy (`memberDetailHref`, strom) mají `period` + `scope`.

3. **Viewer**  
   V `rolePermissions` **nemá** `team_overview:read` → na Team Overview se nedostane (redirect). Kontrola v checklistu; kód pro „Viewer“ ve výběru scope je mrtvá větev — bezpečné.

4. **Ostatní oblasti** (briefing, pool, filtry, empty states) — prošly kontrolou kódu; většina už byla stabilizační vlnou. **Known limitation:** člen bez řádku metrik může projít filtrem (`getVisibleTeamMembers`) — zdokumentováno.

## Co je opraveno

- `defaultLandingScopeForRole` + testy rozdílu vůči `resolveScopeForRole(undefined)` u Director.  
- `team-overview/page.tsx`: `initialScope` z `?scope=` + `resolveScopeForRole`.  
- `[userId]/page.tsx`: `getTeamMemberDetail(..., { period, scope })`, zpětný odkaz s `scope`.  
- `TeamOverviewView`: sync URL včetně `scope`, změna rozsahu zapisuje query, odkazy s `period` + `scope`.  
- `docs/team-overview-release-checklist.md` — kompletní checklist (role, people, selected, empty, responsive, performance, demo script, limitations).  
- `docs/team-overview-implementation-notes.md` — sekce o scope parity.

## Known limitations (zůstávají)

- Proxy filtr „Stabilní“, heuristická kariéra, AI shrnutí nemusí odpovídat období, rytmus jako read model, závislost na `parent_id`, případná deduplikace KPI vs metriky na serveru (větší refaktor).  
- **Člen bez metrik** ve filtru — edge case; případně zpřesnit až při změně datového API.

## Performance sanity

- **OK:** memoizace `pageModel`, `visibleMembers`, `sortedMembers`, `metricsByUser` ve view.  
- **Do dokumentace:** paralelní náklad na serveru (KPI + metriky) — případná optimalizace později.

## Testy a typy

- **21 testů** v souborech Team Overview + `team-hierarchy-scope` — vše prošlo.  
- **`tsc` na celém `apps/web`** v tomto workspace **hlásí chyby mimo Team Overview** (`auth.ts`, `notes/page.tsx`) — v release checklistu zmíněno; pro Team Overview změny samy o sobě typy neporušují.

## Demo-ready?

**Ano** pro scénář ředitele/managera při rozumných datech a hierarchii; **blokery v kódu Team Overview z tohoto passu nejsou**. Doporučený **poslední** krok: **staging manuální průchod** podle `docs/team-overview-release-checklist.md` (sekce 13).

---

## SQL migrace

Pro tento Team Overview QA krok **nejsou potřeba žádné nové SQL migrace**. (V pracovní kopii můžete mít nesouvisející migrace — netýkají se tohoto commitu.)

---

**User**

Správa týmu nesmí být v nastavení ale bude v Týmový přehled!

---

**Cursor**

Prohlížíme implementaci „Správa týmu“ v nastavení a strukturu Týmového přehledu, abychom ji přesunuli do Team Overview.



Implementuji `TeamManagementPanel`, vložím ho do `TeamOverviewView`, odstraním záložku Tým ze `SetupView` a přidám přesměrování `?tab=tym` → team overview.



Vytvářím panel a propojuji změny.



Updating `TeamOverviewCareerSummarySection`, `MemberCareerQuickActions`, and stripping the team tab from `SetupView`.



## Hotovo

**Správa týmu** je přesunuta z **Nastavení** do **Týmového přehledu** (`/portal/team-overview`).

### Co se změnilo

1. **`TeamManagementPanel.tsx`** – stejná logika jako dřív v Setupu: výchozí kariérní program workspace, pozvánka (e-mail + role), tabulka členů včetně `TeamMemberCareerFields` a odebrání člena. Sekce má **`id="sprava-tymu"`** a **`scroll-mt-24`** pro kotvu v URL.

2. **`TeamOverviewView.tsx`** – panel je vložený za **Kariérní přehled**; tlačítko **Pozvat člena** a banner u neúplné hierarchie vedou na **`#sprava-tymu`** (zachovává aktuální `pathname` + hash).

3. **`page.tsx`** – načte e-mail a jméno přes **`getCachedSupabaseUser()`** a předá je panelu.

4. **`SetupView.tsx`** – záložka **Tým** je pryč; **`?tab=tym`** přes **`useLayoutEffect`** přesměruje na **`/portal/team-overview#sprava-tymu`**.

5. **`TeamOverviewCareerSummarySection`**, **`MemberCareerQuickActions`** – odkazy a texty místo „Nastavení → Tým“ na **Týmový přehled → Správa týmu**.

**Commit a push:** `11cf88a1` na `origin/main` (repo `Aidvisora`).

---

**Žádné SQL migrace nejsou potřeba** – mění se jen umístění UI a odkazy, ne schéma databáze.

---

**User**

Proč to není 1:1 podle plánu a podle UX UI podle kodu který jsem poslal v .tsx ?! Udělej to tak!! 1:1 !!

---

**Cursor**

Porovnáváme váš referenční `.tsx` s aktuální implementací v repu, abychom připravili plán sjednocení 1:1.



Máme jasný rozdíl: [`TeamOverviewPremiumPreview.tsx`](/Users/marekmarek/Downloads/TeamOverviewPremiumPreview.tsx) je samostatný „premium“ layout (~1300 řádků) se **slate / #f5v7fb** vzhledem, **Cockpit | Struktura | Lidé**, blokem **otázek + pool split**, **runtime checks**, tmavým **briefingem**, mřížkou sekcí a **pravým sticky panelem** ve stylu ukázky. Produkční [`TeamOverviewView.tsx`](Developer/Aidvisora/apps/web/src/app/portal/team-overview/TeamOverviewView.tsx) používá **`--wp-*`**, jinou hierarchii sekcí a chybí mu přepínač pohledů a horní „masterplan“ řádek z preview. Připravím plán sjednocení 1:1 (struktura + komponenty + mapování dat).



---

**User**

Implementuj plán ale samozřejmě rozlišuj mockup! Nechci tam fejkové data.

---

**Cursor**

Implementujeme plán: rozšíříme premium layout podle preview, napojíme reálná data a odstraníme záměrně klamavé demo údaje.



Obnovujeme implementaci — vytvářím soubory v repozitáři.



Pokračujeme v implementaci premium layoutu podle plánu — bez falešných dat.



Implementujeme shell a `TeamOverviewPremiumMemberRow`, poté přepíšeme `TeamOverviewView`.



Upravujeme `TeamOverviewPremiumShell` (oprava importů) a přepisujeme `TeamOverviewView`.



Přidávám pomocný soubor pro dev runtime checks a přepisuji `TeamOverviewView.tsx`.



Provádíme postupné úpravy: nejprve importy a stav, poté návratový JSX.



Opravujeme volání `TeamOverviewPremiumShell`: předáme `aside` a odstraníme rozbitý grid.



## Hotovo

Implementoval jsem **premium layout** podle plánu a **oddělil mockup od dat**:

### Co je jen „rámec“ (ne metriky)
- **Vodící otázky** — edukační texty v horním bloku; v podtitulku je uvedeno, že jde o orientační rámec, ne o čísla.
- **Role vs. kariéra** a **typy podpory** (adaptace/rozvoj) — obecné popisy vrstev a témat podpory **bez vymyšlených statistik**; skutečná adaptace zůstává v **`TeamOverviewAdaptationSection`** níže.

### Co jde z reálných dat
- **Pool split** — počty a jednotky z `pageModel.poolSplit`.
- **Tmavý briefing** — počty z `attentionUserIds`, nováčků, `byManagerLabel`, rozpad podle **career tracků** (`management_structure`, `individual_performance`, `reality`, `call_center`).
- **Priority** — [`deriveTeamOverviewPriorities`](Developer/Aidvisora/apps/web/src/lib/team-overview-priorities.ts) (pozornost, nováčci, úkoly po termínu, cadence, případně schůzky v týdnu z KPI). Když nic nevyjde, zobrazí se vysvětlující prázdný stav.
- **Seznam lidí** — [`TeamOverviewPremiumMemberRow`](Developer/Aidvisora/apps/web/src/app/portal/team-overview/premium/TeamOverviewPremiumMemberRow.tsx) napojený na `TeamMemberInfo` + metriky.
- **Pravý panel** — `variant="premium"`; **adaptační progress** jen pokud existuje `detail.adaptation` (skutečné `adaptationScore`).

### Další
- **Runtime checks** — jen v **`NODE_ENV === "development"`** ([`TeamOverviewPremiumRuntimeChecks.tsx`](Developer/Aidvisora/apps/web/src/app/portal/team-overview/premium/TeamOverviewPremiumRuntimeChecks.tsx)).
- **Správa týmu** — přestylováno na `rounded-[28px]`, slate border ([`TeamManagementPanel.tsx`](Developer/Aidvisora/apps/web/src/app/portal/team-overview/TeamManagementPanel.tsx)).
- **Přepínače** Cockpit / Struktura / Lidě + scope/period v [`TeamOverviewPremiumShell.tsx`](Developer/Aidvisora/apps/web/src/app/portal/team-overview/premium/TeamOverviewPremiumShell.tsx).

**Commit:** `31cae431` na `origin/main`.

---

**Žádné SQL migrace nejsou potřeba** — mění se jen frontend a odvozené zobrazení ze stávajících dat.

