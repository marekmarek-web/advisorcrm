# SQL doplnění (Supabase SQL Editor)

Základní celé schéma a opakovaně spustitelné skripty: [`supabase-run-in-sql-editor.sql`](./supabase-run-in-sql-editor.sql).

**Pravidlo pro tento soubor:** Jakmile něco doplňuješ do SQL (migrace, patch), přidej **nový záznam vždy na konec** sekce „Záznamy“ — nejnovější je vždy **poslední** (scroll dolů = poslední změna). V konverzích to pak nemusíš hledat.

Úplný adresář migrací v repu: [`packages/db/migrations/`](../packages/db/migrations/).

---

## Záznamy (od nejstaršího k nejnovějšímu — nejnovější dole)

<details>
<summary><strong>Toast + Realtime</strong> — <code>opportunities</code> v publikaci, RLS SELECT pro členy tenanta</summary>

- Soubor: [`advisor-portal-opportunities-realtime-rls.sql`](../packages/db/migrations/advisor-portal-opportunities-realtime-rls.sql)
- Účel: realtime toast v poradenském portálu při novém klientském požadavku (INSERT do <code>opportunities</code>); na konci souboru jsou ověřovací <code>SELECT</code> pro SQL Editor.

</details>

<details>
<summary><strong>Výkon (indexy)</strong> — advisor performance 2026-04-01</summary>

- Soubor: [`supabase-performance-advisor-2026-04-01.sql`](../packages/db/migrations/supabase-performance-advisor-2026-04-01.sql)

</details>

<!-- Při další migraci: zkopíruj blok <details>…</details> nad tento komentář, aby nový záznam zůstal vždy poslední. -->
