# Agent entrypoints

Stručný seznam míst, kde má smysl **začít číst kód** při typických úkolech. Cílem je snížit náhodné procházení celého stromu.

## Vždy zkontrolovat

| Kontext | Cesta |
|---------|--------|
| Root skripty a workspace | `package.json`, `pnpm-workspace.yaml` |
| CI | `.github/workflows/ci.yml` |
| Lint (web) | `apps/web/eslint.config.mjs`, `apps/web/package.json` (`lint`, `lint:report`) |

## Podle tématu

### Autentizace a session

- `apps/web/src/lib/auth/` (a související middleware / layout guardy podle route).

### Klientský portál

- `apps/web/src/app/client/` — stránky a layout.
- `apps/web/src/lib/client-portal/` — session bundle, routing notifikací, mobile SPA cesty.

### Smlouvy a AI review

- `apps/web/src/lib/ai-review/`, `apps/web/src/lib/ai/` (publish bridge, quality gates).
- Akce: `apps/web/src/app/actions/contract-review.ts` a okolní `actions/`.

### Dokumenty a zpracování

- `apps/web/src/lib/documents/` včetně `processing/`.

### Databáze

- `packages/db` — schéma, migrace (`migrations/` nebo ekvivalent dle struktury balíčku).

## Dokumentace pro lidi

- [repo-map.md](./repo-map.md)
- [source-of-truth.md](./source-of-truth.md)
- [SOURCES-OF-TRUTH.md](./SOURCES-OF-TRUTH.md)

## Lokální kořen projektu

Aktuální kanonický klon je u maintainera typicky pod `Developer/Aidvisora` (viz plány v repo); vždy upřednostni **lokální stav** před dohadem z veřejného GitHubu.
