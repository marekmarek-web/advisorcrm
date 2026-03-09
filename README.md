# Advisor CRM

CRM pro finanční poradce v ČR – MVP dle specifikace (domácnosti, pipeline, meeting notes, compliance).

## Stack

- **Frontend:** Next.js 14 (App Router), TypeScript, Tailwind, shadcn/ui
- **Backend:** Next.js Server Actions / Route Handlers + Supabase (Postgres, Auth, Storage)
- **DB:** Drizzle ORM, migrations (drizzle-kit)
- **Deploy:** Vercel

## Setup

1. **Klonovat a závislosti**
   ```bash
   cd advisor-crm
   pnpm install
   ```

2. **Supabase**
   - Vytvořte projekt na [supabase.com](https://supabase.com).
   - V Settings → Database získejte connection string (URI, např. pro pooler).
   - Do kořene projektu zkopírujte `.env.example` jako `.env` a vyplňte:
     - `NEXT_PUBLIC_SUPABASE_URL`
     - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
     - `SUPABASE_SERVICE_ROLE_KEY` (pro server)
     - `DATABASE_URL` nebo `SUPABASE_DB_URL` (Postgres connection string pro Drizzle)

3. **Databáze**
   - **Důležité:** Pokud používáte existující Supabase projekt a vidíte chyby typu `column X does not exist` nebo `relation Y does not exist`, spusťte migraci schématu (načte `DATABASE_URL` z `apps/web/.env.local`):
     ```bash
     pnpm run db:apply-schema
     ```
     Případně z kořene: `node packages/db/src/apply-schema.mjs`
   - Jinak pro nový projekt: `pnpm db:push`

   **Storage:** Pro nahrávání dokumentů vytvořte v Supabase Dashboard → Storage bucket s názvem `documents`.

   **Partneři a produkty (dropdown u smluv):** Po apply-schema můžete naplnit katalog z `packages/db/src/catalog.json`:
   ```bash
   pnpm run db:seed-catalog
   ```
   Vloží globální partnery a produkty (ČSOB, Uniqa, Direct, Pillow, ČPP, Kooperativa, Allianz, MetLife, Conseq, INVESTIKA, …). Pravidla `excludePartners` v katalogu se respektují.

4. **Seed (demo data)**
   ```bash
   pnpm seed
   ```
   Vytvoří 1 tenant, 20 kontaktů, 5 domácností, 10 příležitostí, šablony a účely.

5. **Spuštění aplikace**
   ```bash
   pnpm dev
   ```
   Otevřete [http://localhost:3000](http://localhost:3000).

## Struktura

- `apps/web` – Next.js aplikace (WePlan MVP)
- `packages/db` – Drizzle schema, client, seed
- `docs/` – PRD, ASSUMPTIONS, ROADMAP, DATA_MODEL, API, SECURITY, COMPLIANCE_CZ, UI_POLICY
- `legal/` – DPA a DPIA šablony

**UI reference:** V kořeni repozitáře složka `portal/` – soubor `weplan.html` slouží jako vizuální reference pro Monday-like board (sloupce, pickery, layout). Logika a data jsou v advisor-crm.

## Akceptační kritéria MVP

- 4 role + multi-tenant izolace
- Klient + domácnost + vztahy + firma
- Případ (hypo/invest/pojist) v pipeline, úkoly a schůzka
- Meeting note ze šablony + PDF export
- Dokument + audit log
- Compliance balíček (ZIP)
- Import CSV
- Dashboard „Dnes“
