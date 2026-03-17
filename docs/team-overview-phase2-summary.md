# Týmový přehled Phase 2 – výstup po dokončení

## 1. Build

- **Opraveno:** V komponentě `WizardReview` byl typ propu `icon` sjednocen s `WizardInputWithIcon`: místo `React.ComponentType<{ size?: number | string; className?: string }>` se nyní používá `LucideIcon` (import z `lucide-react`). Tím pádem předávání Lucide ikon (Mail, Phone, User, …) z `NewClientWizard` nevyvolává nekompatibilitu typů.
- **Ověření:** `pnpm run build` probíhá úspěšně (včetně `apps/web`).

---

## 2. Reálná jména členů

- **Řešení:** Zavedena vrstva **user_profiles** (tabulka `user_profiles` v DB: `userId` PK, `fullName`, `email`, `updatedAt`).
- **Sync:** Při volání `updatePortalProfile(fullName)` v `auth.ts` se kromě aktualizace Supabase Auth (`user_metadata.full_name`) provádí upsert do `user_profiles` pro aktuálního uživatele (včetně emailu z `auth.getUser()`). Ostatní členy lze doplnit později (např. sync z admin API nebo ruční úpravou).
- **Team overview:** V `listTeamMembersWithNames` a `getTeamMemberDetail` se používá join (příp. samostatný select) na `user_profiles`; `fullName` se mapuje na `displayName`, `email` zůstává. Kde profil chybí, UI dál používá fallback „Člen týmu“.
- **UI:** V přehledu i v detailu člena se zobrazují reálná jména a e-maily tam, kde jsou v `user_profiles` vyplněné; v tabulce a na kartách je pod jménem zobrazena role a případně e-mail.

---

## 3. Týmové cíle

- **Model:** Nová tabulka `team_goals` (tenantId, period, goalType, targetValue, year, month, createdAt, updatedAt). Podporované typy cílů: `units`, `production`, `meetings`.
- **KPI:** V `getTeamOverviewKpis` byly do výstupu přidány pole `teamGoalTarget`, `teamGoalActual`, `teamGoalProgressPercent`, `teamGoalType`. Pro aktuální období (podle `period`, `year`, `month`) se načte odpovídající cíl z `team_goals`; actual se bere z existujících metrik (units/production/meetings podle goalType); procento = (actual / target) * 100.
- **UI:** Na stránce Týmový přehled byla přidána KPI karta „Splnění týmového cíle“ (zobrazuje se jen pokud je pro dané období nastaven cíl): target vs actual, progress % a progress bar.
- **Příprava na další iteraci:** Schéma umožňuje později rozšíření o cíle na úrovni člena (např. nullable `userId`).

---

## 4. Risk scoring

- **Rozšíření:** V `getTeamAlerts` se kromě stávajících faktorů (dny bez aktivity, dny bez schůzky, velmi nízká aktivita) nově zohledňují:
  - **Slabá CRM disciplína** – za 30 dní jen několik záznamů aktivity (rozšíření původního „low_crm_usage“).
  - **Pokles výkonu** – výrazný meziroční/meziobdobový pokles produkce (např. actual &lt; 50 % předchozího období při prev &gt; 1000).
  - **Případy bez další akce** – otevřené případy a dlouho žádná aktivita (7+ resp. 14+ dní).
  - **Slabý follow-up** – mnoho otevřených úkolů (10+, resp. 20+) a dlouho žádná schůzka (7+ dní).
- **Výstup:** Zachován stávající formát – seznam `TeamAlert[]` (včetně nových typů) a `riskLevel: "ok" | "warning" | "critical"` v `getTeamMemberMetrics`. Critical/warning se stále určuje podle severity alertů (critical alert → critical, jinak warning → warning). Nové typy alertů mají přiřazenou severity dle závažnosti.

---

## 5. Adaptační scoring (nováčci)

- **Vážené kroky:** Krokům v adaptačním checklistu jsou přiřazeny váhy (součet 100 %): profil/setup 10 %, první aktivita 15 %, schůzky 20 %, analýza 15 %, obchod 25 %, pravidelnost 15 %. Skóre se počítá jako vážený součet splněných kroků (0–100).
- **Kategorie:** Stávající klíče odpovídají požadovaným kategoriím: profil a setup (`profile_created`), aktivita (`first_activity`, `regular_crm`), schůzky (`first_meeting`), analýza (`first_analysis`), obchod (`first_contract`), pravidelnost (`regular_crm`). Výstupní typ `NewcomerAdaptation` a struktura `checklist` zůstaly beze změny pro UI.
- **Status:** Prahy pro `adaptationStatus` (Začíná / V adaptaci / Aktivní / Stabilizovaný / Rizikový) zůstaly stejné; mění se pouze hodnota `adaptationScore` díky váženému výpočtu.

---

## 6. UI refinement

- **KPI:** Přidána karta „Splnění týmového cíle“ (target vs actual, progress % a progress bar).
- **Členové:** V přehledu (tabulka i mobilní karty) se u každého člena zobrazuje jméno, role a případně e-mail (pokud je v `user_profiles`).
- **Detail člena:** Zobrazen e-mail vedle role v hlavičce; přidán blok **„Shrnutí pro coaching“**, který z existujících dat (alerts, metriky, adaptace) sestavuje odrážky: rizika, doporučení (např. „X dní bez aktivity“, „Vysoký počet otevřených úkolů“, stav adaptace u nováčků). Bez nového API.

---

## 7. Další iterace

- **Nastavení cíle:** UI pro zadání/úpravu týmového cíle (target + typ) pro aktuální období (např. v Nastavení nebo v Týmovém přehledu) zatím není; v DB a v KPI je připraveno.
- **Cíle členů:** Rozšíření modelu o cíle na úrovni jednotlivce (nullable `userId` v `team_goals` nebo obdobná tabulka).
- **Sync profilů:** Volitelný sync `user_profiles` pro celý tým (např. pomocí Supabase admin API) pro naplnění jmen a e-mailů u členů, kteří si ještě neupravili profil.
- **Jemné doladění:** Prahy risk scoringu a adaptačních vah lze po nasazení doladit na základě reálných dat.
