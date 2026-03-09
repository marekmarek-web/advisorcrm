# Roadmap

## MVP (90 dní)

- Týden 1–2: Monorepo, DB schema, auth, RBAC, multi-tenant guard.
- Týden 3–4: Kontakty CRUD, domácnosti, vztahy, timeline (základ).
- Týden 5–6: Pipeline (board + list), stavy, typy případů, úkoly z pravidel.
- Týden 7–8: Kalendář (události), meeting notes (šablony + strukturovaný zápis), PDF export.
- Týden 9–10: Dokumenty (upload, audit log), compliance export (ZIP).
- Týden 11: Import CSV (šablona, mapování, duplikace).
- Týden 12: Dashboard „Dnes“, dokumentace, seed, E2E smoke testy, deploy.

## Phase 2 (6 měsíců)

- Fulltext vyhledávání dokumentů.
- Automatická retence a scheduled jobs.
- eIDAS-ready datový model a UI pro podpisy.
- Rozšíření šablon a workflow engine.

## Phase 2+ backlog

- **Google Calendar sync** – API bez poplatků, kvóty; obousměrná sync událostí.
- **Kalkulačky** (hypoteční, investiční, penzijní, životní) – lead-gen modul.
- **AI integrace** – import mapování, šablony výpovědí, texty e-mailů (poradce musí zkontrolovat).
- **Marketing / lead gen modul** – landing pages, formuláře, tracking.
- **Finanční analýza PDF** (OSVČ / s.r.o. / rodina) – generování strukturované analýzy.
- **Board views v DB** – tabulka `board_views` místo localStorage.

## Phase 3 (12+ měsíců)

- Klientský portál – rozšíření.
- Analytika a reporty – pokročilé.
- Integrace s externími systémy.
