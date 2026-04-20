# Tenant-scope audit

Statický kontrolor, že každé `.from(<tenant-scoped table>)` v `apps/web/src` má buď:

1. Obalení do `withAuthContext` / `withTenantContext*` wrapperu (runtime GUC + transakce), **nebo**
2. Explicit `eq(<table>.tenantId, auth.tenantId)` v `where(...)`.

Primární obrana proti cross-tenant leaku (poradce A nesmí vidět data poradce B)
je **aplikační WHERE vrstva**. RLS je defense in depth. Tento audit chrání primární vrstvu.

## Spuštění lokálně

```bash
pnpm audit:tenant
```

Exit code 0 = zelený. Exit code 1 = jsou nové nálezy nebo chybí guard.

## Kdy audit failne

- Nově přidaný `.from(<tenantTable>)` bez guard wrapperu a bez `eq(X.tenantId, ...)` ve where.
- Přejmenovaná funkce ve známém nálezu (allow-list.json ukazuje na neexistující entry).

## Fix

1. **Preferovaná cesta** — obalit funkci do `withAuthContext(async (auth, tx) => { ... tx.from(...) ... })`.
2. **Alternativa** — přidat `eq(<table>.tenantId, auth.tenantId)` jako explicitní část `and(...)` v `where(...)`.
3. **Legitimní výjimka** (FK pattern, globální katalog, bootstrap flow) — přidat záznam do
   `tools/tenant-audit/allow-list.json` včetně `reason`, proč je přístup bezpečný.

## Kde audit běží

- `.github/workflows/ci.yml` → krok "Tenant-scope audit (blokující)" → PR nelze mergnout s rozbitým auditem.
- `.githooks/pre-push` → lokálně před `git push` (override: `SKIP_TENANT_AUDIT=1 git push ...`).

## Heuristika & limity

Audit používá TypeScript AST a:

- Projde řetězec enclosing funkcí a hledá guard/tenant token kdekoli v nich.
- Detekuje `requireAuthInAction`, `withAuthContext`, `withTenantContext*` volání.
- Neumí sledovat izolaci přes join (např. `household_members` scope přes `households.tenant_id`)
  nebo přes explicitní subquery. Takové nálezy patří do `allow-list.json` s důvodem.
- Neumí kontrolovat, že subsekvenční FK lookup opravdu předal tenant-gated ID.

## Rozšíření

Přidat tenant-scoped tabulku: doplň snake_case jméno do `TENANT_TABLES_SQL` v
`audit-tenant-queries.mjs`. Script automaticky odvodí camelCase variantu Drizzle identifikátoru.
