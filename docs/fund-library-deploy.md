# Fondová knihovna — deploy DB a post-deploy kontrola

Krátká **release poznámka**: před prvním použitím Fondová knihovna / fronta „Chci přidat fond“ na **cílové** DB musí být aplikovaná migrace **`0020_fund_library_settings`** (nebo ekvivalentní SQL). Bez toho server actions při ukládání nastavení nebo fronty skončí chybou (typicky chybějící sloupec / tabulka).

Hlubší ruční QA: [`fund-library-manual-qa.md`](./fund-library-manual-qa.md).

---

## Co migrace zavádí

- Sloupec **`advisor_preferences.fund_library`** (jsonb) — pořadí a zapnutí fondů u poradce.
- Tabulka **`fund_add_requests`** + index **`fund_add_requests_tenant_created_idx`** + FK na **`tenants`**.
- Idempotentní **UPDATE** starších hodnot **`status`** ve frontě (`under_review` → `in_progress`, atd.).

**Whitelist tenantu** (`tenant_settings`, klíč `fund_library.allowlist`) **novou migraci nepotřebuje** — používá existující tabulku.

Zdrojové soubory v repu:

- Drizzle: `packages/db/drizzle/0020_fund_library_settings.sql` (záznam v `packages/db/drizzle/meta/_journal.json`).
- Ruční kopie: `packages/db/migrations/fund_library_settings_2026-04-06.sql` (+ volitelně `fund_library_z_status_normalize_2026-04-07.sql` — duplicitní UPDATE).
- Součást celkového schématu: `packages/db/supabase-schema.sql` a patch v `packages/db/src/apply-schema.ts` / `apply-schema.mjs`.

---

## Přesný postup na cílovém prostředí

### Předpoklady

1. Zastav se v **kořeni repozitáře** (`Aidvisora/`).
2. Nastav **`DATABASE_URL`** (nebo **`SUPABASE_DB_URL`**) na **tu samou** Postgres instanci a databázi, kterou používá produkční (nebo staging) **`apps/web`** — včetně pooleru, pokud ho aplikace používá.
3. Migrační skript načítá env z **`apps/web/.env.local`**, pokud existuje. Na CI/produkci typicky exportuješ proměnnou přímo v kroku deploy pipeline **před** `pnpm db:migrate`.

### Varianta A — doporučeno: Drizzle migrátor

```bash
cd /cesta/k/Aidvisora
export DATABASE_URL="postgresql://..."   # pokud nečteš z apps/web/.env.local
pnpm db:migrate
```

Očekávaný výstup: `Migrations done.` a ukončení s kódem **0**.

Drizzle si píše stav do tabulky **`__drizzle_migrations`**. Po úspěšném běhu musí být v historii záznam o migraci s tagem odpovídajícím **`0020_fund_library_settings`**.

### Varianta B — Supabase SQL Editor (bez `pnpm`)

1. Otevři **Supabase → SQL Editor** (nebo jiný klient na stejnou DB).
2. Zkopíruj a spusť **celý** obsah souboru  
   **`packages/db/drizzle/0020_fund_library_settings.sql`**  
   (je ekvivalentní logice s `fund_library_settings_2026-04-06.sql` včetně UPDATEů na konci 0020).
3. Volitelně znovu spusť **`fund_library_z_status_normalize_2026-04-07.sql`** — jen idempotentní opakování UPDATEů; na čisté DB nic nezmění.

### Varianta C — širší synchronizace schématu

```bash
pnpm db:apply-schema
```

Aplikuje **`supabase-schema.sql`** + **patch** z `apply-schema` (mj. `fund_library` a `fund_add_requests`). Použij jen pokud víš, že chceš **celý** patch prostředí znovu sladit — není to „jen“ fondová knihovna.

---

## Post-deploy smoke test (~5 min)

Spusť na **nasazené** URL s reálným účtem (ideálně Admin + poradce).

| # | Kontrola |
|---|----------|
| 1 | **Migrace:** žádná 500 při prvním vstupu do Nastavení → Fondy (pokud nevíš jistě, ověř sloupec/tabulku v DB). |
| 2 | **Tenant whitelist:** jako Admin — změna checkboxu, **Uložit nastavení firmy**, refresh → stav drží. |
| 3 | **Moje fondy:** toggle + případně pořadí, **Uložit moje fondy**, refresh → drží. |
| 4 | **Chci přidat fond:** odeslat požadavek → řádek ve frontě. |
| 5 | **FA:** investice do povoleného fondu → **uložit** analýzu bez chyby. |
| 6 | **PDF:** vygenerovat z téže analýzy → soubor se otevře / stáhne bez chyby. |

---

## Blocker vs. non-blocker (release)

| Blocker | Non-blocker |
|---------|--------------|
| Migrace neproběhla → chyby při uložení fondů / fronty | Placeholder obrázky u části fondů v `public/` |
| `DATABASE_URL` na app ≠ DB po migraci | Úklid duplicitních `.svg` vedle JPG v `report-assets` |
| PDF nebo FA 500 po deployi při výše uvedeném smoke | Textové loga v PDF tabulkách (záměr) |
