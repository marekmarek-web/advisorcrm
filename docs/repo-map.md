# Repo map (Aidvisora)

Orientační mapa monorepa pro lidi i pro agentní modely. **Produkční kód** je především v `apps/` a `packages/`; kořen obsahuje také historické **design / reference** složky, které nejsou součástí buildu.

## Produkce (upravovat tady)

| Cesta | Účel |
|--------|------|
| `apps/web` | Hlavní Next.js aplikace (CRM, portál, AI review, Capacitor mobile wrapper). |
| `packages/db` | Drizzle schéma, migrace, seed skripty. |
| `packages/*` | Sdílené balíčky workspace (viz jednotlivé `package.json`). |
| `scripts/` | Root pomocné skripty (hooks, compliance, verifikace). |
| `.github/workflows/` | CI (build, test, lint, E2E). |

## Dokumentace

| Cesta | Účel |
|--------|------|
| `docs/` | Provozní a produktová dokumentace, acceptance poznámky, SQL poznámky. |
| `README.md` | Vstup do projektu, lokální dev, odkazy. |

## Reference / design-only (typicky neměnit pro feature fix)

Tyto cesty zvyšují šířku stromu pro nástroje; při úpravách aplikace je **neberte jako zdroj pravdy** pro runtime chování.

| Oblast | Poznámka |
|--------|-----------|
| `UX UI/`, `mobile ui/`, `kalkulacky ui/`, `Client dashboard/`, `Test AI/`, `ai uceni/` | Design a experimentální materiály. |
| `html/`, `*.html` v kořeni | Statické mocky / exporty. |
| `img pdf/`, `logos/` | Podklady k assetům. |
| `*.md` plány v kořeni (`plan-*.md`, `aidvisor-*.md`, …) | Historické plány; aktuální execute plány mohou žít i mimo repo. |
| `legals/`, `legal/` | Právní zdroje podle interních pravidel (viz README / `legals`). |

## Rychlé příkazy

- Dev server: `pnpm dev` (z kořene; běží `apps/web`).
- Lint (CI stejně): `pnpm --filter web lint` — pouze **chyby** (`eslint --quiet`). Plný výpis včetně varování: `pnpm --filter web lint:report`.
- Testy webu: `pnpm --filter web test`.
- DB: `pnpm db:migrate` atd. (viz root `package.json`).

Viz také [source-of-truth.md](./source-of-truth.md) a [agent-entrypoints.md](./agent-entrypoints.md).
