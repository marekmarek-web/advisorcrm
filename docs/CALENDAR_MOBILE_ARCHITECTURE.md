# Kalendář — mobil a tablet (architektura)

Tento dokument popisuje cílovou architekturu kalendáře v Aidvisor CRM pro **telefon a tablet**. Implementace detailů UI je v samostatných iteracích; zde jde o datový model, režimy zobrazení a chování obalu aplikace.

## Cíle

- **Telefon**: výchozí **denní** pohled (časová osa) nebo kompaktní agenda; přepínač den / seznam.
- **Tablet**: výchozí **týdenní** mřížka + volitelný panel agendy vpravo.
- Společné: stabilní **hlavička**, **FAB** pro novou událost, žádné skákání layoutu při načítání (skeleton ve tvaru finální mřížky).

## Režimy zobrazení

| Režim   | Telefon                         | Tablet                                      |
|--------|----------------------------------|---------------------------------------------|
| Den    | Časová osa 7:00–21:00, celodenní nahoře | Stejné + širší sloupec                      |
| Týden  | Volitelné (přepínač), kompaktní 7 sloupců | 7 sloupců, čitelné bloky                    |
| Měsíc  | Mřížka měsíce, tečky událostí, tap → den | Mřížka + boční agenda vybraného dne        |

## Navigace

- Šipky **&lt; &gt;** v hlavičce: posun dne / týdne / měsíce podle aktivního režimu.
- **Swipe** vlevo/vpravo (volitelné): stejný posun jako šipky (s redukcí konfliktů se scrollem).
- Titulek hlavičky: aktuální rozsah dat (např. „25. 3. 2026“ nebo „24.–30. 3. 2026“).

## Data

- Použít existující akce `listEvents` / `createEvent` (a případně rozšířit o **`getEventsForDateRange(start, end)`** pro efektivní dotaz bez tahání celé historie).
- Klient: načíst kontakty pro výběr stejně jako u mobilního kalendáře dnes (`contacts` prop / seznam ID → jméno).
- Integrace Google: události označit ikonou / štítkem zdroje (stejný princip jako na webu).

## Komponenty (návrh)

- `CalendarMobileShell` — hlavička (režim, datum, akce), sticky pod hlavičkou.
- `CalendarDayTimeline` — vertikální osa, bloky událostí s barvou typu.
- `CalendarWeekGrid` — 7 × časové řádky (tablet), na telefonu zjednodušená výška řádku.
- `CalendarMonthGrid` — klasická měsíční mřížka, indikátory hustoty.
- `CalendarAgendaList` — seznam pro vybraný den (sidebar na tabletu, fullscreen na telefonu po tapu na den).

## Tablet: master–detail

- Levá / hlavní část: týden nebo den.
- Pravý panel (min. 280px): agenda vybraného dne, řazeno podle času.
- FAB zůstává v obálce portálu (mimo scrollovanou mřížku).

## Politika načítání

- Při změně režimu nebo rozsahu: skeleton ve tvaru aktivního režimu (ne prázdná obrazovka).
- Hlavička portálu a spodní navigace se nemění při `loading`.

## Out of scope (v této architektuře)

- Drag & drop událostí mezi časy na mobilu (náhrada: detail události → úprava času).
- Offline-first synchronizace (pouze online režim dle současného chování aplikace).

---

*Odvolání na plán stabilizace: workstream P7 — pouze architektura; implementace podle samostatného briefu.*
