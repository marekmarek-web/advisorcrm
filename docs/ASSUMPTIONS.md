# Předpoklady a výchozí rozhodnutí (Aidvisora MVP)

Dokument zachycuje výchozí rozhodnutí pro věci, které v zadání nejsou explicitně specifikované.

---

## Infrastruktura

- **Databáze:** Postgres (Supabase). Připojení přes `DATABASE_URL` nebo `SUPABASE_DB_URL` (connection string z Supabase Dashboard → Settings → Database).
- **Auth:** Supabase Auth (email + heslo). Uživatelé se zakládají v Supabase Dashboard nebo přes Admin API; MVP neobsahuje self‑registration.
- **Storage:** Supabase Storage pro dokumenty; bucket `documents` (v Supabase Dashboard vytvořit bucket s názvem `documents`). Cesty souborů jsou tenant‑izolované (např. `{tenant_id}/{contact_id}/{filename}`). Stažení se loguje do `audit_log` (action `download`).

---

## Multi‑tenant

- **Tenant:** Jedna „poradenská firma“. Každý uživatel má právě jednu memberships v jednom tenantovi (1:1 pro MVP).
- **Všechny entity** (contacts, households, opportunities, …) mají `tenant_id`; každý dotaz je filtrovaný podle `tenant_id` z membership aktuálního uživatele.
- **Server-side guardy:** Na serveru se vždy získá session → membership → `tenant_id`; bez platné membership není přístup k datům. RLS v Supabase může být doplněno později; MVP spoléhá na Drizzle dotazy s `tenant_id`.

---

## Role a RBAC

- **Role:** Admin, Manager, Advisor, Viewer (v tabulce `roles` s `tenant_id`).
- **Permissions:** Řetězce ve tvaru `entity:action` (např. `contacts:read`, `contacts:write`, `opportunities:*`). Admin má `*`.
- **Výchozí mapování rolí** (viz `get-membership.ts` / RBAC helper):
  - **Admin:** všechno (`*`)
  - **Manager:** plný přístup k CRM entitám (contacts, households, opportunities, tasks, events, documents, meeting_notes, export)
  - **Advisor:** read/write kontakty, domácnosti, případy, úkoly, události, dokumenty, meeting notes; bez nastavení tenanta a uživatelů
  - **Viewer:** pouze čtení (contacts, households, opportunities, tasks, events, documents)
- **Role-based redirect po přihlášení:** Oba typy (Admin, Advisor) jdou na `/dashboard`. Rozlišení `/admin` vs `/dashboard` může být přidáno později.

---

## CRM data

- **Kontakt:** Osoba (firstName, lastName, email, phone, …). Vazba na organizaci přes `relationships` (kind např. `works_at`).
- **Domácnost:** Skupina kontaktů; vazba přes `household_members` (role: primary, member, child).
- **Pipeline:** Případy (`opportunities`) ve stupních (`opportunity_stages`). Výchozí stupně: Lead, Kvalifikace, Nabídka, Vyjednávání, Uzavřeno. Stupně jsou per‑tenant.
- **Schůzky / úkoly:** „Schůzky dnes“ = události (`events`) se `start_at` v aktuální den; „Úkoly k splnění“ = `tasks` bez `completed_at`.

---

## Advisory / compliance MVP

- **Meeting notes:** Strukturované (JSON) dle šablony; 3 šablony (hypo, invest, pojist) v seedu.
- **PDF export „Client summary“:** Jednoduchý souhrn kontaktu (jméno, kontaktní údaje, domácnost, otevřené případy) vygenerovaný na serveru (např. React-PDF nebo šablonovaný HTML→PDF).
- **Dokumenty:** Upload do Supabase Storage; záznam v `documents`; u každého stažení záznam do `audit_log` (action `download`).
- **CSV import kontaktů:** Jeden endpoint/action – upload CSV, parsování, validace, vložení řádků do `contacts` s aktuálním `tenant_id`. Chyby se vrací po řádcích (např. které řádky selhaly).

---

## Testování a commity

- Každý významný commit obsahuje v popisu: **co je hotové** a **jak otestovat** (kroky: např. přihlásit se, otevřít Dashboard, vytvořit kontakt, přesunout kartu v pipeline).
- E2E testy (Playwright) mohou být doplněny podle dostupného času; minimálně manuální postup dle commit zprávy.

### Jak otestovat MVP (lokálně)

1. **Env:** Zkopírovat `apps/web/.env.example` do `apps/web/.env.local`, vyplnit `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL` (connection string z Supabase → Settings → Database).
2. **DB:** V rootu projektu: `pnpm db:push` (nebo `pnpm --filter db push`) pro aplikaci schématu; `pnpm seed` (nebo `pnpm --filter db seed`) pro demo data.
3. **První uživatel:** V Supabase Dashboard → Authentication vytvořit uživatele (email + heslo). Zkopírovat jeho UUID (Authentication → Users → User UID). V databázi upravit tabulku `memberships`: nastavit sloupec `user_id` na toto UUID pro jeden řádek (např. ten s `tenant_id` demo tenanta). Alternativa: upravit `packages/db/src/seed.ts` a nastavit `DEMO_USER_ID` na UUID vytvořeného uživatele a znovu spustit seed (insert s onConflictDoNothing nepřepíše existující membership).
4. **Spuštění:** `pnpm dev` (spustí `apps/web`).
5. **Kontrola:** Přihlásit se na `/login`, po přihlášení přesměrování na `/dashboard`. Ověřit KPI (schůzky/úkoly/případy), Kontakty (seznam, přidat, editovat, detail), Domácnosti (seznam, detail), Pipeline (kanban, přesun karty do jiného stupně), Zápisky (vytvořit zápisek), Client summary (kontakt → Client summary → Tisk/PDF), CSV import (Kontakty → nahrát CSV), Dokumenty (pokud existují záznamy v `documents`, odkaz Stažení loguje audit).

---

## Board View (Monday-style)

- Stránka `/board` je **čistě front-end demo** (bez backendu): Board View ve stylu Monday.com (sidebar, topbar, tabulka se skupinami Únor/Leden, status pills s dropdownem, inline edit BJ, Add item). Design tokens a komponenty v `src/styles/monday.css` a `src/app/components/monday/`. Data jsou lokální state se seed daty.

## E-mail provider

- **Výchozí:** Resend (nastavte `RESEND_API_KEY` v `.env.local`). Bez klíče se e-maily logují do konzole.
- **From adresa:** `EMAIL_FROM` env proměnná (default `Aidvisora <noreply@aidvisora.cz>`).
- Šablony: `apps/web/src/lib/email/templates.ts` (Připomínka servisu, Nový dokument, Platební instrukce).
- Všechny e-maily respektují `notification_unsubscribed_at` na kontaktu; nepošle se e-mail odhlášenému klientovi.
- Unsubscribe odkaz v každém e-mailu; token logika v existujících `unsubscribe_tokens`.

## Segment labels

- Mapování kódu na plný název: `packages/db/src/schema/contracts.ts` obsahuje `SEGMENT_LABELS`.
- Klientská verze: `apps/web/src/app/lib/segment-labels.ts`.
- V DB se ukládá kód (ZP, MAJ, INV...), v UI se zobrazuje plný název (Životní pojištění, Majetek, Investice...).

## ŽP rating

- Pouze informativní; data v `apps/web/src/data/insurance-ratings.ts`.
- Disclaimer vždy zobrazen: „Poradce odpovídá za rozhodnutí. Aidvisora nedoporučuje."

## Board views

- MVP: stav boardu (sloupce, šířky, pořadí, skupiny, filtry) uložen v `localStorage` (`aidvisora_portal_state_v2`; legacy `weplan_portal_state_v1` / `v2` se při načtení migrují).
- Phase 2: tabulka `board_views` v DB (tenant_id, user_id, columns_config JSON). Schéma připraveno v `supabase-schema.sql`.

## Co je mimo scope MVP

- Self‑registration a „zapomenuté heslo“ (lze doplnit přes Supabase Auth).
- Více tenantů na jednoho uživatele (výběr tenanta po přihlášení).
- RLS v Supabase (MVP = aplikace vždy filtruje podle `tenant_id` z membership).
- Plnohodnotný kalendář (stačí počet schůzek dnes a jednoduchý seznam).
- Mobilní aplikace; cíleno na desktopový prohlížeč.
