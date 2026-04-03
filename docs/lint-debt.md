# Lint gate a technický dluh (`apps/web`)

Fáze **6G** — engineering hygiene bez masivního refaktoru celého monorepa.

## Co je gate (CI + lokálně)

- **Příkaz:** `pnpm --filter web lint` (nebo z `apps/web`: `pnpm lint`)
- **Chování:** `eslint . --quiet` — **pouze chyby (error)** blokují build; varování se v tomto režimu nevypsat.
- **CI:** `.github/workflows/ci.yml` — krok **ESLint (apps/web)** spouští `pnpm lint` ve `apps/web`.

Kořen repa: `pnpm lint` spustí `pnpm -r lint` (včetně balíčku `web`, pokud má skript `lint`).

## Aktuální stav varování (debt)

- **Plný výpis:** `pnpm --filter web lint:report` (`eslint .` bez `--quiet`).
- **Orientační počet (snapshot):** řádově **~560+ varování**, **0 errors** při posledním auditu 6G.
- **Nejčastější pravidla** (typicky):
  - `@typescript-eslint/no-unused-vars`
  - `@typescript-eslint/no-explicit-any`
  - `react-hooks/set-state-in-effect`
  - `react-hooks/rules-of-hooks`
  - `react-hooks/exhaustive-deps`
  - `@next/next/no-img-element`
  - `@next/next/no-html-link-for-pages`
  - další `react-hooks/*` (refs, purity, …)

Přesné počty se mění; pro aktuální rozpad spusťte `lint:report` a případně export do JSON (`eslint -f json`).

## Konfigurace

- **`apps/web/eslint.config.mjs`** — `eslint-config-next` (core-web-vitals + typescript), pravidla výše nastavená převážně na **`warn`** (bounded gate).
- **Ignorované cesty:** `.next/`, `android/`, `ios/`, Playwright reporty, atd. (viz `ignores` v configu).

## Jak dluh bezpečně snižovat

1. **Nezvedat najednou vše na `error`** — zvyšovat pravidla po složkách nebo po typech souborů (`overrides` v flat config).
2. **Auto-fix tam, kde je bezpečný** — např. unused imports (`eslint --fix`), pak ručně edge cases.
3. **Hooks a `any`** — často vyžadují produktové rozhodnutí; řešit v menších PR.
4. Po větším úklidu v jedné oblasti aktualizovat tento soubor (nový snapshot počtu / priorit).

## Související

- [repo-map.md](./repo-map.md) — kde leží `apps/web`
- [source-of-truth.md](./source-of-truth.md) — konvence včetně zmínky o lintu
