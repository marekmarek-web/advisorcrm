# Kariérní řády a Team Overview

Tento dokument popisuje oddělení **aplikačních (system) rolí** od **kariérní vrstvy**, podporované programy, mapu pozic (zdroj v kódu), limity CRM dat a doporučený rollout. Implementační zdroj pravdy pro kódy a pořadí pozic je v `apps/web/src/lib/career/`.

---

## 1. Proč oddělit aplikační roli a kariérní vrstvy (včetně tracku)

- **System role** (`memberships.role_id` → `roles.name`: Admin, Director, Manager, Advisor, Viewer) řídí **oprávnění v aplikaci**. Neříká nic o tom, zda je člověk např. „M2“ v Beplan nebo „GA2“ u Premium Brokers.
- **Kariérní program** (`career_program`) určuje, **který žebříček** platí (Beplan finance / Beplan realty / Premium Brokers / Premium Brokers Call Centrum / nevyplněno).
- **Kariérní track** (`career_track`) rozlišuje **individuální výkon** vs **manažerskou / strukturální** dráhu. U tracku `individual_performance` se **nevyhodnocují** týmové a strukturální podmínky; u `management_structure` ano, ale jen tam, kde máme data (např. počet přímých podřízených z `parent_id`, případně jejich uložené kariérní kódy).
- **Kariérní pozice** (`career_position_code`) je stabilní interní kód; zobrazovaný název přichází z konfigurace v `lib/career`.

Tyto dimenze se **neslučují** s `roleId` — jde o paralelní model.

---

## 2. Podporované systémy (programy)

| ID (`career_program`) | Popis |
|----------------------|--------|
| `beplan_finance` | Beplan – finanční řád (T, R, VR, M, D stupně dle interního mapování) |
| `beplan_realty` | Beplan – realitní řád (RT, RR, RV, RM, RD) |
| `premium_brokers` | Premium Brokers – hlavní žebříček (reprezentanti → GA) |
| `premium_brokers_call_center` | Premium Brokers – Call Centrum (UR, M) |
| `not_set` | Nevyplněno / neznámé |

PDF zdroje (interní): *Kariera_Beplan.pdf*, *karierniradPB.pdf* — prahy BJ/BJS a detaily podmínek jsou v dokumentech; v aplikaci jsou u požadavků explicitně označeny jako **manuální** nebo **nespecifikované**, aby nedocházelo k falešným automatickým verdiktům.

---

## 3. Mapa pozic (konfigurace v repu)

Kanonicalní definice: soubory pod `apps/web/src/lib/career/` (`beplan-finance.ts`, `beplan-realty.ts`, `premium-brokers.ts`, `premium-brokers-call-center.ts`) a `registry.ts`.

### Beplan finance (`beplan_finance`)

| Kód | Label (z configu) |
|-----|-------------------|
| `BP_FIN_T1` | Trainee 1 (T1) |
| `BP_FIN_T2` | Trainee 2 (T2) |
| `BP_FIN_R1` | Reprezentant 1 (R1) |
| `BP_FIN_VR2` | VR2 |
| `BP_FIN_VR3` | VR3 |
| `BP_FIN_VR4` | VR4 |
| `BP_FIN_M1` | M1 |
| `BP_FIN_M1P` | M1+ |
| `BP_FIN_M2` | M2 |
| `BP_FIN_D1` | D1 |
| `BP_FIN_D2` | D2 |
| `BP_FIN_D3` | D3 |

### Beplan realty (`beplan_realty`)

| Kód | Label |
|-----|--------|
| `BP_RE_RT1` | RT1 |
| `BP_RE_RT2` | RT2 |
| `BP_RE_RR1` | RR1 |
| `BP_RE_RV2` | RV2 |
| `BP_RE_RV3` | RV3 |
| `BP_RE_RV4` | RV4 |
| `BP_RE_RM1` | RM1 |
| `BP_RE_RM1P` | RM1+ |
| `BP_RE_RM2` | RM2 |
| `BP_RE_RD1` | RD1 |
| `BP_RE_RD2` | RD2 |
| `BP_RE_RD3` | RD3 |

### Premium Brokers (`premium_brokers`)

| Kód | Label |
|-----|--------|
| `PB_REP_1` | Reprezentant 1 |
| `PB_REP_2` | Reprezentant 2 |
| `PB_REP_3` | Reprezentant 3 |
| `PB_OB` | OB |
| `PB_OV` | OV |
| `PB_OR` | OR |
| `PB_ZR` | ZR |
| `PB_GA_1` | GA1 |
| `PB_GA_2` | GA2 |
| `PB_GA_3` | GA3 |
| `PB_GA_4` | GA4 |

### Premium Brokers Call Centrum (`premium_brokers_call_center`)

| Kód | Label |
|-----|--------|
| `PB_CC_UR1` | UR1 |
| `PB_CC_UR2` | UR2 |
| `PB_CC_UR3` | UR3 |
| `PB_CC_UR4` | UR4 |
| `PB_CC_M1` | M1 |
| `PB_CC_M1P` | M1+ |
| `PB_CC_M2` | M2 |

**Poznámka:** Pořadí a `next` pozice jsou v kódu; při rozporu s PDF má přednost **aktualizace configu** a poznámka v evaluatoru / dokumentaci.

---

## 4. Co lze odvodit z dnes dostupných dat v CRM

- **Počet přímých podřízených:** z `memberships.parent_id` a výpisu členů tenantu (`listTenantHierarchyMembers`).
- **Hrubé metriky výkonu** (jednotky, produkce, schůzky, aktivity, …) z existujících team overview agregací — užitečné jako **orientační kontext**, ne jako oficiální BJ/BJS.
- **Viditelnost členů** dle role a scope (stejná jako u `team_overview:read`).

---

## 5. Co nejde nebo vyžaduje manuální evidenci

- **BJ / BJS** podle kariérních PDF — v CRM nejsou jako kanonický údaj; evaluator je označuje jako **manuální** / **data_missing**.
- **Historické BJ** a časové podmínky z PDF.
- **Licence, FT, certifikace** a interní checklisty.
- **Kvalifikace podřízených** ve smyslu „6× M2“ — bez vyplněného `career_position_code` u podřízených nelze pravidlo automaticky ověřit → `data_missing` / chybějící údaje u týmu.

Metriky z CRM se **nikdy** neprezentují jako 1:1 „splněno BJ“.

---

## 6. Doporučený datový model

- **Entita členství** `memberships` (per user per tenant) rozšířena o:
  - `career_program` (text, nullable)
  - `career_track` (text, nullable)
  - `career_position_code` (text, nullable)
- Volitelně později: `career_profile_json` (jsonb) pro ruční příznaky (FT, licence, …) — mimo minimální vlnu MVP.
- **Žádná samostatná tabulka pozic pro MVP** — definice žebříčků žijí v TypeScript konfiguraci; DB drží jen výběr uživatele.

ER (logicky): `User` — `Membership` → `career_program`, `career_track`, `career_position_code`; nezávisle `Membership` → `Role` (permissions).

---

## 7. Rollout do Team Overview (fáze)

1. **Config** — `apps/web/src/lib/career/*` (typy, registry, definice programů).
2. **DB migrace** — sloupce na `memberships` před nasazením kódu, který je čte.
3. **Evaluator** — `evaluate-career-progress.ts` (poctivé `data_missing`, confidence, poznámky).
4. **Server actions** — `getCareerEvaluationForMember` + napojení na detail (`getTeamMemberDetail` může vracet stejný výsledek v jednom requestu).
5. **UI** — sekce Kariéra na detailu člena; kompaktní badge / řádek v přehledu týmu.
6. **Editace** (další fáze) — formulář v Nastavení → Tým, validace proti registry, případně default program v `tenant_settings`.

---

## 8. Rizika a otevřené otázky

- **Mapování PB** „individuální vs manažerská“ větev může vyžadovat interní schválení — aktuálně jsou oba tracky podporované typy, ale pravidla u vyšších stupňů zůstávají u strukturálních částí **konzervativní** (manuálně / unspecified), dokud nejsou zadány tvrdé prahy v configu.
- **Přesnost kódů Beplan** — PDF může mít varianty; při změně interní nomenklatury aktualizovat pouze `lib/career` a migrovat uložené kódy v DB.
- **Multi-tenant** — jeden uživatel může v budoucnu potřebovat jiný program v jiném workspace; model je per `memberships`, což je správně.

---

## Odkaz na kód

- Konfigurace a evaluace: `apps/web/src/lib/career/`
- Schéma: `packages/db/src/schema/tenants.ts` (`memberships`)
- Migrace: `packages/db/drizzle/0024_memberships_career.sql`
