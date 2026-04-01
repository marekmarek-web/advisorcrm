# SQL doplnění (repo)

Jednotný přehled SQL změn — **nemusíte je hledat v konverzacích**. Odkazy vedou přímo na soubory v repu (v editoru rozkliknutelné).

**Pravidlo:** nejnovější záznam je vždy **poslední** v sekci „Log“.

---

## Základ (referenční skripty)

| Co | Soubor |
|----|--------|
| Hlavní schéma (Postgres / Supabase) | [packages/db/supabase-schema.sql](../packages/db/supabase-schema.sql) |
| Velký idempotentní balík pro Supabase SQL Editor | [docs/supabase-run-in-sql-editor.sql](supabase-run-in-sql-editor.sql) |
| Drizzle / apply-schema (TypeScript) | [packages/db/src/apply-schema.ts](../packages/db/src/apply-schema.ts) |

---

## Log (chronologicky — **nejnovější dole**)

Při **nové** migraci nebo významné úpravě `.sql` přidejte **jeden řádek na konec** této tabulky (datum ISO, krátký popis, odkaz).

| Datum | Popis | Soubor |
|-------|--------|--------|
| 2026-04-01 | Supabase Performance Advisor: RLS initplan (`SELECT` kolem `auth.*`), sloučené permissive politiky, duplicitní index `mindmap_maps`, FA politiky | [supabase-performance-advisor-2026-04-01.sql](../packages/db/migrations/supabase-performance-advisor-2026-04-01.sql) |
