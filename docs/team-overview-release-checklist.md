# Team Overview — release checklist & known limitations

Fáze 7 (QA / stabilizace). Použijte před demem nebo produkčním vydáním modulu **Týmový přehled** (Team Overview).

---

## 1. Role / permission checklist

| Role | `team_overview:read` | Očekávaný výchozí scope | Career edit (`team_members:write`) | Týmový kalendář (`team_calendar:write`) |
|------|----------------------|-------------------------|-------------------------------------|----------------------------------------|
| Advisor | ano | `me` | ne | dle matice |
| Viewer | typicky ne (bez přístupu na přehled) | — | ne | ne |
| Manager | ano | `my_team` | dle matice | ano |
| Director | ano | `full` | dle matice | dle matice |
| Admin | ano | `full` | ano | dle matice |

- [ ] Advisor / Viewer nevidí cizí týmová data (scope vždy `me` pro tyto role).
- [ ] Manager nemůže přepnout na `full` (server i `/api/ai/team-summary` používají `resolveScopeForRole`).
- [ ] Detail člena (`getTeamMemberDetail`) vrací 404 / Forbidden mimo `visibleUserIds`.
- [ ] AI follow-up z týmového shrnutí (`executeTeamAiAction`): přiřazený uživatel musí být v **maximálním** povoleném scope pro roli (stejná logika jako Team Overview).

---

## 2. Scope / hierarchy checklist

- [ ] Při **žádném** `parent_id` v tenantu: rozsah **„Můj tým“** ukazuje jen přihlášeného uživatele (bez scope leaku na celý tenant).
- [ ] Zobrazí se informační banner (desktop + mobile) o neúplné hierarchii.
- [ ] Panel struktury vysvětlí „plochý“ strom jako problém dat, ne rozbití UI.
- [ ] Po doplnění `parent_id` se větev descendantů počítá konzistentně (`getDescendantIds`).
- [ ] Sirotci / odkazy na neviditelné `parent_id` se ořezávají ve `getTeamTree` (zůstávají kořeny v rámci scope).

---

## 3. Career data checklist

- [ ] `not_configured`, `data_missing`, `unknown`, `manual_required`, `low_confidence` mají čitelné štítky v přehledu i v detailu (stejný slovník kde je to záměr).
- [ ] Alert „Kariéra: …“ odpovídá `buildAlertsFromMetric` / řádku v tabulce.
- [ ] Nováček bez kariéry: UI se nerozsype; evaluace má konzistentní `summaryLine`.

---

## 4. AI / summary consistency checklist

- [ ] Generování shrnutí (`generateTeamSummaryAction`) dostává **stejný** `scope` jako přepínač na stránce.
- [ ] `buildTeamAiContextRaw` odvozuje alerty z **jedné** sady metrik (`buildTeamAlertsFromMemberMetrics`), ne třetím paralelním `getTeamAlerts`.
- [ ] Uložené „poslední shrnutí“ může pocházet z jiného scope/období než aktuální výběr — po přepnutí scope znovu vygenerovat (viz known limitations).

---

## 5. Internal terms / cadence checklist

- [ ] Rytmus / interní termíny respektují `getScopeContext` (stejné `visibleUserIds` jako přehled).
- [ ] Disclaimer u rytmu zůstává viditelný (zdroj dat, ne kalendářový engine).

---

## 6. Loading / empty / error states checklist

- [ ] Obnovení stránky: žádné tiché prázdné bloky bez textu.
- [ ] Chyby AI shrnutí a follow-upu mají `role="alert"` / srozumitelnou češtinu.
- [ ] Mobile: opravený `Promise.all` v `TeamOverviewScreen` (žádný „přesýpací“ počet výsledků).

---

## 7. Responsive / mobile checklist

- [ ] Banner hierarchie na mobile neřeže layout (padding `mx-4`).
- [ ] Dlouhá jména v kartách členů: `truncate` / `min-w-0` kde je potřeba.

---

## 8. Performance sanity checklist

- [ ] `getTeamOverviewKpis` už znovu nevolá `getTeamAlerts` (druhé `getTeamMemberMetrics`).
- [ ] `getTeamMemberDetail` nestahuje metriky dvakrát kvůli alertům.
- [ ] AI kontext a `/api/ai/team-summary` nevolají `getTeamAlerts` nad stejnými metrikami znovu.
- [ ] **Zbývající duplicita (known limitation):** `getTeamOverviewKpis` a paralelní `getTeamMemberMetrics` stále oba počítají metriky — odstranění vyžaduje větší refaktor (sdílený „bundle“).

---

## 9. Known limitations (poctivě)

1. **Hierarchie** závisí na kvalitě `parent_id`; bez vazeb je „Můj tým“ záměrně restriktivní.
2. **Kariéra:** část pravidel je heuristická; `manual_required` / legacy kombinace vyžadují lidskou kontrolu — nejsou tvrdé licence BJ/BJS v tomto modulu.
3. **Uložené AI shrnutí** nemusí odpovídat aktuálnímu scope/period v UI — metadata generace to zatím plně nepropisuje.
4. **Cadence / rytmus** je read model a doporučení, ne workflow engine s tvrdými stavy.
5. **Výkon:** jedna navíc nákladná vrstva = dvojí výpočet member metrik (KPI + explicitní metrics) při načtení přehledu.

---

## 10. Doporučení před demo / release

1. Nastavit u 2–3 uživatelů ukázkový `parent_id` a ověřit strom + „Můj tým“.
2. Projít jednoho člena s prázdnou kariérou a jednoho s plnou konfigurací.
3. Jako Director vygenerovat shrnutí v `full`, pak přepnout Manager účet a ověřit zúžení dat.
4. Ověřit vytvoření follow-up úkolu jen pro člena v rozsahu.

---

## SQL migrace

Žádné SQL migrace nejsou součástí této fáze (logika scope a výkon v aplikační vrstvě).

Odkaz na dotčené soubory (repo):  
`apps/web/src/lib/team-hierarchy-types.ts`,  
`apps/web/src/app/actions/team-overview.ts`,  
`apps/web/src/lib/ai/actions/action-executors.ts`,  
`apps/web/src/lib/ai/context/team-context.ts`,  
`apps/web/src/app/api/ai/team-summary/route.ts`,  
`apps/web/src/app/portal/team-overview/TeamOverviewView.tsx`,  
`apps/web/src/app/portal/team-overview/TeamStructurePanel.tsx`,  
`apps/web/src/app/portal/mobile/screens/TeamOverviewScreen.tsx`.
