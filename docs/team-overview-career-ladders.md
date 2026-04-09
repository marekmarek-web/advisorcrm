# Kariérní řády a Team Overview

Implementační zdroj pravdy pro kódy, větve a pořadí: `apps/web/src/lib/career/`. V databázi jsou na `memberships` textové sloupce `career_program`, `career_track`, `career_position_code` (viz migrace `packages/db/drizzle/0024_memberships_career.sql`).

---

## 1. Proč nestačí program + pozice — nutný `careerTrack`

Stejný **kariérní program** (např. Beplan) obsahuje **paralelní větve** s různými pravidly:

- **Top poradce (individuální výkon)** — osobní BJ / výkon, bez týmových kritérií v evaluatoru.
- **Manažerská / strukturální** — navíc tým, přímí podřízení, kvalifikace struktury (tam, kde máme data).
- **Realitní větev** — odděleně od „čistě“ finanční logiky; bez 1:1 mapování na TP.
- **Call centrum (Premium Brokers)** — samostatná osa kódů a pravidel.

Kód pozice (`career_position_code`) je vždy vázaný na **dvojici program + větev**. Stejný „název“ stupně v jiné větvi může mít **jiný kód** a **jiné `next`**. Bez `career_track` by šlo omylem míchat výkonovou a manažerskou logiku.

---

## 2. Oddělení čtyř vrstev

| Vrstva | Kde žije | Příklad |
|--------|-----------|---------|
| **systemRole** | `memberships.role_id` → `roles.name` | Admin, Director, Manager, Advisor, Viewer |
| **careerProgram** | `memberships.career_program` | `beplan`, `premium_brokers` |
| **careerTrack** | `memberships.career_track` | `individual_performance`, `management_structure`, `reality`, `call_center` |
| **careerPositionCode** | `memberships.career_position_code` | např. `BP_TP_3`, `BP_MS_M1`, `PB_REP_2`, `PB_CC_UR2` |

**Neslučovat:** aplikační role ≠ kariérní program ≠ větev ≠ pozice.

Evaluátor a UI pracují s kanonickými hodnotami programu; legacy hodnoty z první vlny (`beplan_finance`, `beplan_realty`, `premium_brokers_call_center`) se **normalizují** na `beplan` / `premium_brokers` a kde je to jednoznačné, doplní se větev (nebo se větev odvodí z kódu pozice u Beplanu — vždy s upozorněním v `sourceNotes` / `missingRequirements`).

---

## 3. Mapa konfigurace (program × větev)

Kanonicalní soubory: `beplan-top-poradce.ts`, `beplan-management.ts`, `beplan-reality.ts`, `premium-brokers-individual.ts`, `premium-brokers-management.ts`, `premium-brokers-call-center.ts`, `registry.ts`.

### Beplan + `individual_performance` (Top poradce)

| Kód | Label |
|-----|--------|
| `BP_TP_1` … `BP_TP_7` | Top poradce 1–7 |

Legacy aliasy v registry: `BP_FIN_T1` → TP1, `BP_FIN_T2` → TP2.

### Beplan + `management_structure`

| Kód | Label |
|-----|--------|
| `BP_MS_R1` | R1 |
| `BP_MS_VR2` … `BP_MS_VR4` | VR2–VR4 |
| `BP_MS_M1`, `BP_MS_M1P`, `BP_MS_M2` | M1, M1+, M2 |
| `BP_MS_D1` … `BP_MS_D3` | D1–D3 |

Legacy aliasy: `BP_FIN_R1`, `BP_FIN_VR2`, …, `BP_FIN_D3`.

### Beplan + `reality`

| Kód | Label |
|-----|--------|
| `BP_RE_RT1`, `BP_RE_RT2`, `BP_RE_RR1`, `BP_RE_RV2`–`BP_RE_RV4`, `BP_RE_RM1`, `BP_RE_RM1P`, `BP_RE_RM2`, `BP_RE_RD1`–`BP_RE_RD3` | realitní stupně |

Evaluator používá **opatrnější** sadu požadavků (bez automatického mapování na finanční TP).

### Premium Brokers + `individual_performance`

| Kód | Label |
|-----|--------|
| `PB_REP_1` … `PB_REP_3` | Reprezentant 1–3 |

### Premium Brokers + `management_structure`

| Kód | Label |
|-----|--------|
| `PB_OB`, `PB_OV`, `PB_OR`, `PB_ZR`, `PB_GA_1` … `PB_GA_4` | OB … GA4 |

### Premium Brokers + `call_center`

| Kód | Label | Poznámka |
|-----|--------|----------|
| `PB_CC_UR1` … `PB_CC_UR4` | UR1–UR4 | bez týmových pravidel v MVP |
| `PB_CC_M1`, `PB_CC_M1P`, `PB_CC_M2` | M1, M1+, M2 | se strukturálními požadavky (přímí + kódy u podřízených), kde data jsou |

---

## 4. Úložiště a editace (jeden zdroj pravdy)

| Pole | Tabulka / sloupec |
|------|-------------------|
| `careerProgram` | `memberships.career_program` |
| `careerTrack` | `memberships.career_track` |
| `careerPositionCode` | `memberships.career_position_code` |

**Nepersistovat** stejná data paralelně do `user_profiles`, tenant-only metadat či jiných tabulek — evaluator i Team Overview čtou z `memberships` (přes existující dotazy členů tenantu).

**UI pro úpravu:** záložka **Nastavení → Tým** (`SetupView` + `TeamMemberCareerFields`). U každého člena se pod jménem zobrazí tři selecty (program → větev → pozice) a tlačítko uložení. Volné textové kódy nejsou povoleny.

**Oprávnění:** zápis přes server action `updateMemberCareer` v `apps/web/src/app/actions/team.ts` je chráněn oprávněním **`team_members:write`** (typicky Director / Admin). Poradce bez tohoto oprávnění formulář nevidí. Aplikační role zůstává oddělená (správa rolí jinde).

---

## 5. Validace program / větev / pozice

- **Zápis:** `validateCareerFieldsForWrite` v `apps/web/src/lib/career/career-write-validation.ts` — pouze kanonické programy `beplan` a `premium_brokers`; pozice musí existovat v registru pro danou dvojici program + track (`getCareerPositionDef`). Legacy řetězce v `career_program` při zápisu zamítnout (nutná oprava přes select).
- **Klient:** nabídka větví z `listTracksForProgram(programId)`; pozice z `listCareerPositions(programId, trackId)` — filtrování podle výběru.
- **Čtení / evaluace:** `normalizeCareerProgramFromDb`, `inferTrackFromLegacyProgram`, případně odhad větve z kódu u Beplanu — výsledkem může být `missingRequirements` (např. explicitní track), `evaluationCompleteness` `low_confidence` / `manual_required`, nikoli „tvrdá“ jistota.

---

## 6. Proxy pravidla (orientační, ne řád)

Implementace: `buildCareerProxySignals` v `apps/web/src/lib/career/evaluate-career-progress.ts`. Signály jsou v `CareerEvaluationResult.proxySignals` a v detailu člena v sekci **„Orientační signály z CRM“** (viz `TeamMemberDetailView`).

Aktuálně (MVP fáze 2):

1. **CRM aktivita** — hrubý kontext z počtu aktivit a dnů bez aktivity (ne BJ/BJS).
2. **Hierarchie** — kontext z počtu přímých podřízených tam, kde to dává smysl (stále bez předstírání splnění strukturálních kritérií z PDF).
3. **Adaptace** — stejný popisek adaptace jako v přehledu nováčků se propisuje do evaluace **už v `getTeamMemberMetrics`** (fáze 3), takže list a detail mají shodné `proxySignals`.

V UI je vždy zdůrazněno, že jde o **doprovodné signály**, ne oficiální splnění podmínek kariérního řádu.

---

## 7. Výchozí kariérní program na tenantovi (volitelný prefill)

- **Uložení:** `tenant_settings` — klíč `team_career_defaults`, doména `team`, JSON `{ "defaultCareerProgram": "beplan" | "premium_brokers" | null }`.
- **Načtení / zápis:** `getTenantTeamCareerDefaults`, `setTenantTeamCareerDefaultProgram` v `apps/web/src/app/actions/team.ts`.
- **Chování:** používá se jen jako **předvyplnění** ve formuláři u člena, pokud nemá uložený program — **nepřepisuje** už uložené hodnoty na `memberships`. V záhlaví záložky Tým je blok „Výchozí kariérní program pro workspace“ (jen při `team_members:write`).

---

## 8. Propsání do Team Overview a detailu (fáze 3 — jeden zdroj)

### Kanonický evaluation flow

1. **`evaluateCareerProgress`** (`evaluate-career-progress.ts`) — jádro výpočtu (program, track, pozice, `missingRequirements`, proxy, …).
2. **`buildCareerEvaluationViewModel`** (`career-evaluation-vm.ts`) — jediné místo, které z jádra skládá **view model** pro UI: přidává `summaryLine` (stejná sémantika jako dříve `formatCareerSummaryLine`), `hintShort`, `managerProgressLabel` (manažerské škatulky bez toxických textů).
3. **`getTeamMemberMetrics`** — pro každého člena ve **stejném** scope jako přehled zavolá `buildCareerEvaluationViewModel` s kontextem včetně **`newcomerAdaptationStatusLabel`** z `getNewcomerAdaptation` (shoda proxy se seznamem/detail).
4. **`getTeamMemberDetail(userId, { period?, scope? })`** — **nepočítá** kariéru znovu jiným vstupem: vezme `careerEvaluation` z `getTeamMemberMetrics(period, scope)` kde `scope = resolveScopeForRole(role, options?.scope)`. Volitelný fallback VM jen když by metrika chyběla.
5. Odkazy z přehledu na detail přidávají **`?period=`**; stejný query parametr používá panel struktury týmu — období v CRM metrikách sedí s řádkem v tabulce.

Na `TeamMemberMetrics` je navíc **`directReportsCount`** (počet přímých podřízených v hierarchii) pro insighty.

### Team Overview — blok „Růst týmu“

- Agregace čistými funkcemi: **`buildTeamCareerSummaryBlock`** (`team-career-aggregate.ts`) — počty podle **větve**, podle **manažerského bucketu** (`managerProgressLabel`), souhrn „chybí data / doplnění“, částečná nebo ruční část evaluace, **startovní pozice + adaptace**, až **5 lidí** s nejvyšším skóre pozornosti (odvozeno od stavu evaluace, ne od „hodnocení osobnosti“).

### Seznam členů

- Zobrazuje **`careerEvaluation.summaryLine`**, **`managerProgressLabel`**, technické štítky (`progressEvaluation`, `evaluationCompleteness`), **`hintShort`**, volitelně **další krok** (`nextCareerPositionLabel`).

### Detail člena

- Stejný `CareerEvaluationViewModel` jako v řádku přehledu (včetně `summaryLine`).
- Stručná legenda: **Evidované / Odvozené / K ručnímu ověření**.
- **`careerInsights`** z **`buildCareerInsights`** (`career-insights.ts`) — krátké manažerské signály (start + CRM ticho, manažerská větev bez přímých, nízká jistota, adaptace + slabý rozjezd, pozitivní CRM proxy u individuální větve). Nejsou to oficiální splnění řádu.

### Career alerty (k CRM alertům)

- V `buildAlertsFromMetric` přibyly typy **`career_data_gap`**, **`career_review`**, **`career_low_confidence`** — jemná vrstva nad kariérními daty.

### Scope a role (audit)

- **Manager:** při požadavku na `full` scope ho `resolveScopeForRole` srazí na **`my_team`** — kariérní souhrn ani metriky při detailu **neobsahují** lidi mimo podstrom.
- **Director / Admin:** `full` = celý tenant (dle hierarchie).
- **Advisor / Viewer:** jen **`me`**.
- Viditelnost detailu: `getVisibleUserIds` se stejným scope jako metriky — nelze otevřít detail mimo rozsah.

---

## 9. Fáze 4 — manažerský coaching a doporučené akce

### Coaching summary a 1:1 agenda

- **`buildCareerCoachingPackage`** (`apps/web/src/lib/career/career-coaching.ts`) skládá z: kariérního VM, CRM metrik, adaptačního řezu (včetně neuhájených kroků checklistu), titulků alertů u člena.
- Výsledek je na `TeamMemberDetail` jako **`careerCoaching`**: doporučený typ akce, krátké body **Doporučení pro coaching** (odlišné podle **careerTrack**), **Doporučená agenda na 1:1** s kategoriemi *Evidované / CRM signál / K ověření ručně*, **Další doporučený krok**, **follow-up** po 1:1, případně řádek **Růst a adaptace** (nováček + start ve větvi).
- UI: sekce **„Coaching a 1:1“** v `TeamMemberDetailView.tsx`.

### Recommended action mapping

- **`deriveRecommendedCareerAction`** mapuje stav na např. `adaptation_checkin`, `one_on_one`, `data_completion`, `performance_coaching`, `team_meeting_followup`, `monitor_only` — čistá derivační funkce, **ne** workflow engine; úpravy jen v jednom souboru.

### Propojení s adaptací nováčků

- Checklist adaptace (chybějící položky) a stav se promítají do agendy a do odstavce růst/adaptace; stejný zdroj dat jako přehled nováčků v Team Overview.

### Team Overview — lehká akční vrstva

- **`buildTeamCoachingAttentionList`** — v manažerském briefingu (pravý sloupec) blok **„Růst — kdo potřebuje krok“**: až 5 lidí, stručný důvod a doporučená akce; odkaz na detail; anchor **`#team-calendar-actions`** pro týmové schůzky/úkoly (více lidí přes existující modal).

### CTA a existující create flow

- **`MemberCareerQuickActions`**: volá **`createTeamEvent`** / **`createTeamTask`** z `apps/web/src/app/actions/team-events.ts` pro **jednoho** člena, s předvyplněným názvem a poznámkami z `careerCoaching.cta`.
- Podmínka **`team_calendar:write`**. Odkaz **Nastavení → Tým** pro doplnění kariéry, pokud je doporučená akce `data_completion` a uživatel má **`team_members:write`**.
- Stránka **`/portal/team-overview`** přijímá `?period=` pro shodu období s detailem člena.

### Role / scope (beze změny matice oprávnění)

- Coaching se počítá jen nad viditelnými členy v aktuálním scope (jako metriky). Advisor u rozsahu „Já“ vidí coaching pro sebe; bez kalendářového write nemá rychlé CTA.

### Co zůstává manual / další fáze

- Plný read model naplánovaných 1:1 v UI, hlubší AI follow-up, pokročilé šablony — mimo scope.

---

## 10. Co jde spočítat z dnešních dat (stručně)

- Počet **přímých podřízených** (`parent_id`).
- U **manažerské / call-centrum M*** větve: přítomnost **kariérního kódu** u podřízených (ne kvantifikace „6× M2“).
- Hrubé **CRM metriky** a **aktivita** jen jako proxy kontext — nikdy jako oficiální BJ/BJS.

---

## 11. Co nejde spočítat / zůstává manual

- **BJ, BJS, historický výkon** z PDF — `manual` / `unspecified` v `missingRequirements`.
- **Licence, zkoušky, FT**, realitní podíly u postupu — manuálně nebo bez specifikace v configu.
- **Kvantitativní prahy** z PDF bez bezpečné extrakce — do kódu nepřidávat bez schválení.
- Neznámé řetězce v DB → `unknown` / `low_confidence` / doplnění přes Nastavení → Tým.

Výstup evaluace: `progressEvaluation` (`on_track`, `data_missing`, `blocked`, `unknown`, `not_configured`, …) a `evaluationCompleteness` (`full`, `partial`, `low_confidence`, `manual_required`). Bez falešné přesnosti — preferovat `manual_required` a partial stavy před „ready for promotion“.

---

## 12. Rizika a otevřené otázky

- **Legacy data** s `beplan_finance` bez tracku: dokud není vyplněn `career_track` nebo spolehlivý kód pozice, může zůstat `data_missing`.
- **TP1–TP7**: názvy a počet stupňů musí odpovídat schválenému PDF; snadno doplnitelné v `beplan-top-poradce.ts`.
- **PB**: oddělení reprezentant vs OB+ jako performance vs management je produktové rozhodnutí — při změně interní logiky upravit jen config, ne CRM role.
- **Call centrum**: u M* předpokládáme smysluplnost týmových pravidel; detaily PDF mohou vyžadovat úpravu `requirement` textů.

---

## 13. Team rhythm a cadence (Fáze 5)

- **Stejný vstup jako coaching:** `deriveRecommendedCareerAction` z `career-coaching.ts` se v cadence vrstvě znovu nepřepisuje — `buildTeamCadenceRows` ho reuseuje spolu s řezy metrik a adaptace jako u `buildTeamCoachingAttentionList`.
- **Rozdíl oproti pouhému coaching bloku:** do rozhodování vstupuje **evidence z `team_events`** — poslední událost klasifikovaná jako 1:1 / adaptace / follow-up (heuristika z názvu) sníží agresivitu doporučení „naplánovat 1:1“.
- **UI:** panel „Týmový rytmus“ v `TeamOverviewView` zobrazuje průnik **coaching attention × cadence** a CTA s prefillem do `TeamCalendarModal` (název, poznámka, cílový člen).
- **Dokumentace read modelu:** `docs/team-overview-masterplan.md` sekce 13.

---

## 14. Sjednocení copy s Team Overview (Fáze 6)

- **Detail člena** (`TeamMemberDetailView`): štítky `progressEvaluation` a `evaluationCompleteness` používají **stejné krátké řetězce** jako tabulka v Team Overview (`Na dobré cestě`, `Chybí data`, `Potřebuje pozornost`, `Ruční ověření`, …) — delší vysvětlení zůstává v `hintShort` / coaching textech.
- **Účel:** jeden mentální model pro managera mezi přehledem a detail osoby; snížení pocitu „jiná aplikace, jiný jazyk“.
- **IA přehledu:** viz `docs/team-overview-masterplan.md` sekce 14 (pořadí bloků a empty states).

---

## Odkaz na kód

- `apps/web/src/lib/career/` — `evaluate-career-progress.ts`, `career-evaluation-vm.ts`, `career-insights.ts`, `career-coaching.ts`, `team-career-aggregate.ts`, `career-write-validation.ts`, registry
- `apps/web/src/app/actions/team.ts` (`updateMemberCareer`, tenant default)
- `apps/web/src/app/actions/team-overview.ts` (`getTeamMemberMetrics`, `getTeamMemberDetail`, alerty)
- `apps/web/src/app/portal/setup/SetupView.tsx`, `TeamMemberCareerFields.tsx`
- `apps/web/src/app/portal/team-overview/TeamOverviewView.tsx`, `TeamRhythmPanel.tsx`, `TeamCalendarModal.tsx`, `TeamStructurePanel.tsx`, `[userId]/TeamMemberDetailView.tsx`, `[userId]/MemberCareerQuickActions.tsx`, `[userId]/page.tsx`
- `apps/web/src/lib/team-rhythm/` — klasifikace názvů, cadence, `computeTeamRhythmView`
- `packages/db/drizzle/0024_memberships_career.sql`
