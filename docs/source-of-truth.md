# Source of truth (index)

Tento soubor je **krátký rozcestník**. Detailní mapování tabulek a polí je v:

- **[SOURCES-OF-TRUTH.md](./SOURCES-OF-TRUTH.md)** — CRM / DB zdroje pravdy (kontakty, smlouvy, extrakce, AI vrstva).

## Aplikační vrstva (kam sahat v kódu)

| Oblast | Kde začít |
|--------|-----------|
| Hlavní webová app | `apps/web` (Next.js App Router pod `src/app`). |
| Sdílená DB a migrace | `packages/db`. |
| Klientský portál (session, routing) | `apps/web/src/lib/client-portal/`, `apps/web/src/app/client/`. |
| AI review / assistant | `apps/web/src/lib/ai/`, `apps/web/src/lib/ai-review/`, UI pod `apps/web/src/app/portal/` a komponenty v `src/app/components/`. |

## Konvence

- **Jedna pravda pro data:** zapisovat přes existující server actions / služby, ne duplikovat paralelní modely (viz kritický fix plán).
- **Lint:** `pnpm --filter web lint` musí projít v CI; varování (unused, `any`, část React hooks) řeší `lint:report` a postupný debt cleanup.

## Související dokumenty

- [repo-map.md](./repo-map.md) — strom repozitáře.
- [agent-entrypoints.md](./agent-entrypoints.md) — vstupy pro agenty.
- [DATA_MODEL.md](./DATA_MODEL.md), [API.md](./API.md) — hlubší reference, pokud existují v aktuální verzi.
