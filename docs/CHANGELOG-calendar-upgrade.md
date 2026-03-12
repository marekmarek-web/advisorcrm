# Kalendář CRM – produktový upgrade (changelog)

Dokumentace změn provedených v rámci kompletního upgrade kalendáře na hlavní pracovní nástroj poradce.

---

## 1. Produktové změny

- **Denní pohled** – nový režim „Den“ pro detailní operativu jednoho dne.
- **Pracovní režimy** – Den, Měsíc, Týden, Pracovní týden s konzistentní navigací (šipky posunují podle aktivního režimu).
- **Pravý kontextový panel** – místo pouze úkolů: při výběru události zobrazuje detail, quick actions (Upravit, Rychlá úprava, Označit hotovo, Follow-up, Otevřít klienta, Napsat zprávu, Smazat); bez výběru zobrazuje denní agendu, úkoly dne, volná okna a odkaz na zprávy.
- **Click to create** – klik do slotu v denním/týdenním gridu otevře rychlé vytvoření události (čas předvyplněn).
- **Click to edit** – klik na událost vybere a zobrazí detail v panelu; „Upravit“ otevře plný formulář, „Rychlá úprava“ otevře kompaktní quick edit.
- **Čára aktuálního času** – výrazná čára v denním/týdenním pohledu s volitelným badge „Teď HH:mm“, nastavitelná barva a tloušťka v nastavení kalendáře.
- **Napojení na úkoly** – úkoly dne v pravém panelu s odškrtáváním; z panelu „Založit návazný úkol“ a „+ Follow-up událost“ v plném formuláři.
- **Napojení na zprávy** – v panelu u události s klientem odkaz „Napsat zprávu“, badge s počtem nevyřízených konverzací; v plném formuláři odkaz „Otevřít zprávy“.
- **Rozšířený formulář události** – stav (Naplánováno / Potvrzeno / Hotovo / Zrušeno), poznámka, odkaz na schůzku; tlačítka Follow-up událost a Založit návazný úkol.
- **Tlačítko „Dnes“** – přepne na dnešek a nastaví vybraný den na dnešek ve všech režimech.

---

## 2. UX/UI změny

- **Hierarchie** – sticky hlavička kalendáře, čitelné názvy režimů a data; denní režim zobrazuje celý den (např. „pondělí 12. března“).
- **Barvy a kategorie** – centrální mapa typů aktivit (schůzka, telefonát, kafe, e-mail, úkol, priorita, servis, interní, administrativa, review, follow-up, osobní) s jednotnými barvami a ikonami v měsíci, týdnu i panelu.
- **Week/day grid** – události jako absolutně pozicované bloky podle skutečného času a délky (multi-hour události a přesné časy); klikatelné sloty pro vytvoření.
- **Pravý panel** – přejmenován a rozšířen na kontextový hub (detail události nebo denní agenda), sbalitelný, na mobilu jako horní/svislý pruh.
- **Quick form** – kompaktní overlay pro rychlé vytvoření/úpravu (typ, název, čas, kontakt, poznámka) bez nutnosti otevírat plný modal.
- **Empty states a odkazy** – „Žádné události“, „Žádné úkoly“, odkaz „Všechny úkoly“, „Zprávy čekající na reakci“, „Volná okna“.

---

## 3. Technické změny

- **Nové komponenty:** `WeekDayGrid`, `CalendarContextPanel`, `QuickEventForm`, `CurrentTimeLine`, centrální `event-categories.ts`.
- **Refaktor** – `PortalCalendarView` používá výše uvedené komponenty; odstraněn duplicitní week grid a tasks panel; odstraněno lokální `EVENT_TYPES` / `getEventTypeInfo` ve prospěch `event-categories`.
- **Datový model** – rozšíření tabulky `events` o sloupce `status`, `notes`, `meeting_link`, `task_id` (migrace v `packages/db/src/apply-schema.mjs`); Drizzle schema a `EventRow` / `createEvent` / `updateEvent` rozšířeny o tato pole.
- **Nastavení kalendáře** – přidána volitelná pole `currentTimeLineColor`, `currentTimeLineWidth`; v modalu nastavení nová sekce „Čára aktuálního času“.

---

## 4. Nové interakce

- Klik do prázdného slotu v denním/týdenním gridu → otevření quick form pro novou událost.
- Klik na událost v gridu → výběr události a zobrazení detailu v pravém panelu.
- V panelu: Upravit → plný modal; Rychlá úprava → quick form overlay.
- V měsíčním pohledu: klik na událost → popover s detailem, Upravit / Rychlá úprava / Zavřít.
- Přepínání dne v hlavičce týdenního/denního pohledu → změna `selectedDate`.
- Tlačítko „Dnes“ → aktuální datum a vybraný den = dnes.

---

## 5. Datové struktury a vazby

- **EventRow** – přidána pole: `status`, `notes`, `meetingLink`, `taskId`.
- **Events API** – `createEvent` a `updateEvent` přijímají a ukládají `status`, `notes`, `meetingLink`, `taskId`.
- **Vazby** – událost může mít `contactId`, `opportunityId`, `taskId`; konverzace zpráv je dle `contact_id`, v UI propojení přes odkazy (bez nového sloupce `conversation_id`).

---

## 6. Změněné / nové soubory

| Soubor | Typ změny |
|--------|-----------|
| `packages/db/src/schema/tasks-events.ts` | Rozšíření `events` o status, notes, meetingLink, taskId |
| `packages/db/src/apply-schema.mjs` | ALTER pro nové sloupce events |
| `apps/web/src/app/actions/events.ts` | EventRow, listEvents, createEvent, updateEvent rozšířeny |
| `apps/web/src/app/portal/calendar/event-categories.ts` | **Nový** – centrální mapa kategorií a stylů |
| `apps/web/src/app/portal/calendar/CurrentTimeLine.tsx` | **Nový** – čára aktuálního času |
| `apps/web/src/app/portal/calendar/CalendarContextPanel.tsx` | **Nový** – pravý kontextový panel |
| `apps/web/src/app/portal/calendar/QuickEventForm.tsx` | **Nový** – rychlé vytvoření/úprava |
| `apps/web/src/app/portal/calendar/WeekDayGrid.tsx` | **Nový** – denní/týdenní grid s absolutními událostmi |
| `apps/web/src/app/portal/calendar/calendar-settings.ts` | currentTimeLineColor, currentTimeLineWidth |
| `apps/web/src/app/portal/PortalCalendarView.tsx` | Refaktor: day view, WeekDayGrid, CalendarContextPanel, QuickEventForm, event-categories, rozšířený modal a popover |
| `apps/web/src/app/components/calendar/CalendarSettingsModal.tsx` | Sekce čára aktuálního času |
| `apps/web/src/styles/weplan-calendar.css` | Styly pro context panel, quick form, week-day grid, current time line, wp-cal-event--muted |
| `docs/CHANGELOG-calendar-upgrade.md` | **Nový** – tento dokument |

---

## 7. Co je hotové

- Vše v odstavcích 1–6 výše: denní/týdenní/měsíční/pracovní režimy, kontextový panel, quick create/edit, plný formulář se stavem a poznámkou a meeting linkem, čára času, napojení na úkoly a zprávy (odkazy a badge), centrální kategorie, rozšířený datový model a API.

---

## 8. Připraveno na další fázi

- **Drag & drop** a **resize** událostí – architektura zatím bez implementace; změna času/délky přes quick edit nebo plný formulář.
- **Filtrování vrstev** (zapnutí/vypnutí typů událostí) a **legendy kategorií** – struktura kategorií to umožňuje, UI v nastavení nepřidáno.
- **Opakované události**, **šablony aktivit**, **před/po checklisty**, **volné sloty pro schůzky** – v panelu zobrazena „Volná okna“ z výpočtu mezer; zbytek připraven na budoucí rozšíření.

---

## 9. Co čeká na backend

- Sloupce `status`, `notes`, `meeting_link`, `task_id` jsou v migraci a ve schématu; po spuštění migrace (`node packages/db/src/apply-schema.mjs` nebo ekvivalent) je backend připraven.
- Volitelně: `tasks.scheduled_start_at` pro zobrazení časově pevných úkolů přímo v gridu; konverzace vázaná na událost (`conversation_id` na events) – aktuálně propojení přes kontakt a odkazy.
