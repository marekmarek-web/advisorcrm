# Commit zprávy a testování

## Co je hotové (MVP)

### Priorita 1
- **Next.js 14** (App Router) + TypeScript + Tailwind; existující **shadcn/ui** (Radix) komponenty v projektu.
- **Supabase:** Auth (email+heslo), Postgres (přes Drizzle + `DATABASE_URL`), Storage (bucket `documents` pro soubory).
- **Multi-tenant:** Tabulky `tenants`, `memberships`, `roles`. Všechny entity mají `tenant_id`; serverové guardy v každé akci (`requireAuthInAction` + filtrování podle `tenantId`).
- **Auth:** Přihlášení na `/login` (dynamický formulář), po přihlášení redirect na `?next` nebo `/dashboard`. Odhlášení přes tlačítko v hlavičce.
- **RBAC:** Role Admin, Manager, Advisor, Viewer s oprávněními (read/write) v `get-membership.ts`; každá serverová akce volá `hasPermission(roleName, action)`.

### Priorita 2
- **Datový model + CRUD:** Kontakty, domácnosti, členové domácností, organizace, vztahy, případy (opportunities), stupně pipeline – vše v `packages/db`.
- **UI:** Dashboard „Dnes“ (KPI ze DB: schůzky dnes, úkoly, otevřené případy), Kontakty (seznam, nový, edit, detail), Domácnosti (seznam, detail s členy), Pipeline (kanban ze DB, přesun karty do jiného stupně).

### Priorita 3
- **Meeting notes:** Strukturované zápisky (JSON) s šablonami; 3 šablony v seedu (hypo, invest, pojist). Stránka Zápisky: formulář (kontakt, šablona, datum, obsah JSON) + seznam.
- **PDF export „Client summary“:** Stránka `/dashboard/contacts/[id]/summary` – souhrn kontaktu (jméno, email, telefon, domácnost, otevřené případy). Tlačítko „Tisk / Export do PDF“ (tisk prohlížeče → Uložit jako PDF).
- **Dokumenty + audit_log:** Tabulka `documents`, `audit_log`. Na detailu kontaktu seznam dokumentů; odkaz na stažení vede na `/api/documents/[id]/download` (log do `audit_log`, redirect na Supabase signed URL). Bucket `documents` je třeba vytvořit v Supabase.
- **CSV import:** Na stránce Kontakty formulář „Import z CSV“ (sloupce: Jméno, Příjmení, E-mail, Telefon). Výsledek: počet importovaných + chyby po řádcích.

---

## Jak otestovat

1. **Prostředí:** `apps/web/.env.local` zkopírovat z `apps/web/.env.example` – vyplnit `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `DATABASE_URL`.
2. **DB:** Z rootu `pnpm db:push`, pak `pnpm seed`.
3. **Uživatel:** V Supabase Dashboard → Authentication vytvořit uživatele. Do tabulky `memberships` nastavit `user_id` na jeho User UID (nebo v `packages/db/src/seed.ts` nastavit `DEMO_USER_ID` na toto UID a znovu spustit seed).
4. **Spuštění:** `pnpm dev` (nebo z `apps/web`: `npm run dev` / `npx next dev`).
5. **Kroky:** Přihlásit se na `/login` → Dashboard (KPI) → Kontakty (seznam, + Přidat, detail, upravit, Client summary, CSV import) → Domácnosti (seznam, detail) → Pipeline (přesun karty) → Zápisky (nový zápisek). Odhlásit se.

---

## Pravidla pro commity

Každý commit má v popisu:
- **Co je hotové** (stručně).
- **Jak otestovat** (kroky, pokud se mění chování).

Příklad:  
*„Přidán CSV import kontaktů. Otestování: Dashboard → Kontakty → nahrát CSV (jméno, příjmení, email, telefon), ověřit počet importovaných a chyby.“*
