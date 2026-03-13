# Aidvisora

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
   - **Registrace bez e-mailu:** Aplikace po registraci rovnou přesměruje do portálu. Pokud v Supabase máš zapnuté „Confirm email“, buď ho v **Authentication → Providers → Email** vypni, nebo nakonfiguruj vlastní SMTP (Supabase defaultní e-maily často nedorazí).

3. **Databáze**
   - **Důležité:** Pokud používáte existující Supabase projekt a vidíte chyby typu `column X does not exist` nebo `relation Y does not exist`, spusťte migraci schématu (načte `DATABASE_URL` z `apps/web/.env.local`):
     ```bash
     pnpm run db:apply-schema
     ```
     Případně z kořene: `node packages/db/src/apply-schema.mjs`
   - Jinak pro nový projekt: `pnpm db:push`
   - Tabulka `contact_coverage` (pokrytí produktů v kartě klienta) se vytvoří při `db:apply-schema` nebo `db:push`. Používáte-li jen SQL migrace, spusťte `packages/db/migrations/add-contact-coverage.sql`.

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

## Nasazení (production mimo localhost)

Nejjednodušší je **Vercel** (Next.js, automatické deploye z GitHubu).

1. **Vercel**
   - Jděte na [vercel.com](https://vercel.com), přihlaste se (ideálně přes GitHub).
   - **Add New** → **Project** → vyberte repozitář **marekmarek-web/advisorcrm**.
   - **Root Directory:** klikněte **Edit** a zvolte **`apps/web`** (aplikace je v monorepu).
   - Nechte **Build Command** a **Output** na automatických hodnotách (v `apps/web` je už `vercel.json` s `installCommand` pro monorepo).

2. **Proměnné prostředí (Environment Variables)**
   V projektu na Vercelu přidejte v **Settings → Environment Variables** (pro Production i Preview):
   - `NEXT_PUBLIC_SUPABASE_URL` – URL tvého Supabase projektu
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY` – anon klíč
   - `SUPABASE_SERVICE_ROLE_KEY` – service role klíč
   - `DATABASE_URL` – Postgres connection string (Supabase → Settings → Database → Connection string, pooler, např. `postgresql://postgres.[ref]:[password]@aws-0-[region].pooler.supabase.com:6543/postgres`)
   - `NEXT_PUBLIC_APP_URL` – URL nasazené aplikace (např. `https://tvuj-projekt.vercel.app`), důležité pro auth callback a e-maily.

3. **Supabase – povolené URL**
   V Supabase Dashboard → **Authentication → URL Configuration** přidej do **Redirect URLs** tvou produkční adresu (např. `https://tvuj-projekt.vercel.app/**`).

4. **Deploy**
   Klikni **Deploy**. Po úspěšném buildu bude aplikace dostupná na adrese typu `https://advisorcrm-xxx.vercel.app`. Další push do `main` na GitHubu spustí automatický redeploy.

**Jiné hosty (Netlify, Railway, atd.):** Build z monorepa: z kořene `pnpm install && pnpm --filter web build`, výstup Next.js je v `apps/web/.next`. Spuštění: `pnpm --filter web start` (nebo `node apps/web/.next/standalone/...` pokud máš `output: 'standalone'` v `next.config.js`).

### Chyba „Application error: a server-side exception“ na Vercelu

1. **Logy:** Vercel → tvůj projekt → **Deployments** → klikni na poslední deploy → **Functions** nebo **Runtime Logs**. Tam uvidíš skutečnou chybu (např. chybějící tabulka, špatné DATABASE_URL).
2. **Schéma v Supabase:** Tabulky musí v Supabase existovat. Na svém počítači v repozitáři nastav v `apps/web/.env.local` stejné `DATABASE_URL` jako na Vercelu (tvůj Supabase projekt) a spusť:
   ```bash
   pnpm db:apply-schema
   ```
3. **DATABASE_URL na Vercelu:** Musí být **celý** connection string, např.  
   `postgresql://postgres:TvojeHeslo@db.paoayamrcanxhsvkmdni.supabase.co:5432/postgres`  
   Pro Vercel je vhodný **connection pooler** (Supabase → Project Settings → Database → Connection string → **Transaction** pooler, port 6543). Na konec můžeš přidat `?sslmode=require` (nebo kód to doplní sám).
4. **Redirect URLs:** Supabase → Authentication → URL Configuration → Redirect URLs musí obsahovat tvou produkční adresu, např. `https://advisorcrm-web.vercel.app/**`.

**„Nepodařilo se dokončit registraci“ po přihlášení:** Účet v Supabase máš, ale při přesměrování na dokončení se vytváří workspace v databázi. Chyba znamená, že Vercel se nedostane k DB. Zkontroluj: (1) Na Vercelu je nastavená **DATABASE_URL** (celý connection string na tvůj Supabase projekt). (2) V Supabase jsou vytvořené tabulky – spusť v SQL Editoru skript z `docs/supabase-run-in-sql-editor.sql`. (3) Vercel → Deployments → poslední deploy → **Runtime Logs** / **Functions** – tam uvidíš přesnou chybovou hlášku.

**Google / Apple přihlášení:** Návod je v `docs/GOOGLE-APPLE-LOGIN.md`.

## Struktura

- `apps/web` – Next.js aplikace (Aidvisora)
- `packages/db` – Drizzle schema, client, seed
- `docs/` – PRD, ASSUMPTIONS, ROADMAP, DATA_MODEL, API, SECURITY, COMPLIANCE_CZ, UI_POLICY
- `legal/` – DPA a DPIA šablony

**UI reference:** V kořeni repozitáře složka `portal/` – soubor `portal reference (board layout)` slouží jako vizuální reference pro Monday-like board (sloupce, pickery, layout). Logika a data jsou v advisor-crm.

## Akceptační kritéria MVP

- 4 role + multi-tenant izolace
- Klient + domácnost + vztahy + firma
- Případ (hypo/invest/pojist) v pipeline, úkoly a schůzka
- Meeting note ze šablony + PDF export
- Dokument + audit log
- Compliance balíček (ZIP)
- Import CSV
- Dashboard „Dnes“
