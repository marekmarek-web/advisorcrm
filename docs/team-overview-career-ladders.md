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

## 4. Co jde spočítat z dnešních dat

- Počet **přímých podřízených** (`parent_id`).
- U **manažerské / call-centrum M*** větve: zda má přímý podřízený vyplněný **kariérní kód** (ne „splněno 6× M2“, jen přítomnost údaje).
- Hrubé **CRM metriky** jako kontext — nikdy jako oficiální BJ/BJS.

---

## 5. Co nejde spočítat / chybí specifikace

- **BJ, BJS, historický výkon** z PDF — vždy **manual** / **unspecified** v `missingRequirements`.
- **Licence, zkoušky, FT**, realitní podíl u manažerského postupu — manuálně nebo otevřená specifikace v configu.
- **Kvantitativní prahy** z PDF bez bezpečné extrakce — nepřidávat do kódu bez schválení.
- Neznámé řetězce v `career_program` / `career_track` → stav evaluace **`unknown`**, úplnost **`low_confidence`**.

Výstup evaluace používá `progressEvaluation` (např. `on_track`, `data_missing`, `blocked`, `unknown`, `not_configured`) a `evaluationCompleteness` (`full`, `partial`, `low_confidence`, `manual_required`). Hodnoty `close_to_promotion` / `promoted_ready` jsou v typu připravené pro budoucí pravidla — bez falešné přesnosti se dnes primárně používá `on_track` + `manual_required`.

---

## 6. Rollout do Team Overview

1. Konfigurace v `lib/career` (hotovo pro základ více větví).
2. DB sloupce (již v migraci 0024).
3. Úprava uložených hodnot v DB směrem k `beplan` / `premium_brokers` a explicitním trackům (postupně, legacy parser pomáhá).
4. UI: přehled (řádek program · větev · pozice), detail (program, větev, pozice, další krok, stav, úplnost, chybějící položky).
5. Další fáze: editace v Nastavení → Tým, tenant default, rozšířené pravidla s jasným „proxy“ labelingem.

---

## 7. Rizika a otevřené otázky

- **Legacy data** s `beplan_finance` bez tracku: dokud není vyplněn `career_track` nebo spolehlivý kód pozice, může zůstat `data_missing`.
- **TP1–TP7**: názvy a počet stupňů musí odpovídat schválenému PDF; snadno doplnitelné v `beplan-top-poradce.ts`.
- **PB**: oddělení reprezentant vs OB+ jako performance vs management je produktové rozhodnutí — při změně interní logiky upravit jen config, ne CRM role.
- **Call centrum**: u M* předpokládáme smysluplnost týmových pravidel; detaily PDF mohou vyžadovat úpravu `requirement` textů.

---

## Odkaz na kód

- `apps/web/src/lib/career/`
- `packages/db/src/schema/tenants.ts`
- `packages/db/drizzle/0024_memberships_career.sql`
