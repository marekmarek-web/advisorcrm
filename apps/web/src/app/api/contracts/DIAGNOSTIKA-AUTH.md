# Diagnostika auth pro /api/contracts/*

**Pozn.:** DEV BYPASS (`DEV_CONTRACTS_USER_ID`, `NEXT_PUBLIC_SKIP_AUTH`) funguje jen při `NODE_ENV=development` a když `VERCEL_ENV !== "production"`. Na Vercelu produkce se nikdy nepoužije; v produkci nemít tyto env vyplněné.

## Co bylo implementováno

1. **Middleware** (`src/middleware.ts`)
   - Branch pro `/api/contracts/*` běží **před** jakýmkoli `NEXT_PUBLIC_SKIP_AUTH` return (vždy se vyhodnotí).
   - Pro každý request na `/api/contracts/*`: log do konzole `pathname`, `method`, `contractsBranchRan: true`, `userFound`, `userIdMask`.
   - Nastavené hlavičky do route: `x-debug-mw: 1`, `x-debug-path: <pathname>`, `x-user-id: <id>` (jen pokud je user).
   - Výjimka: `/api/contracts/debug-auth` vždy projde (nepošle 401), aby endpoint mohl vrátit, co v requestu přišlo.

2. **Route handlery** (`review/route.ts`, `upload/route.ts`)
   - Na začátku: diagnostický log (URL, method, x-debug-mw, x-debug-path, hasUserIdHeader, userIdMask).
   - Auth **pouze** přes `x-user-id` z hlavičky; pokud chybí → 401. Žádný fallback na Supabase.

3. **Debug endpoint** `GET /api/contracts/debug-auth`
   - Vrací JSON: `ok`, `path`, `method`, `hasDebugMwHeader`, `debugPath`, `userIdFromHeader` (maskované).
   - Nepřistupuje k DB ani Supabase.

## Jak spustit diagnostiku

1. Restartuj dev server (`pnpm dev`).
2. V prohlížeči (přihlášený uživatel) otevři:
   - `http://localhost:3000/api/contracts/debug-auth`
3. V terminálu (kde běží `pnpm dev`) sleduj:
   - `[middleware /api/contracts]` – zda se vůbec spustil middleware pro tuto cestu.
   - `[route GET /api/contracts/review]` resp. `[route POST /api/contracts/upload]` – co route dostala v hlavičkách.
4. Na stránce Review smluv načti seznam (GET /api/contracts/review) a případně upload (POST /api/contracts/upload) a znovu sleduj terminál.

## Jak interpretovat výsledky

| Situace | Závěr |
|--------|--------|
| V terminálu **není** `[middleware /api/contracts]` při volání /api/contracts/* | **Middleware neběží** pro tyto cesty (matcher nebo pořadí). |
| Je `[middleware /api/contracts]` s `userFound: false` | **Řetězec se láme v middleware:** session není (cookies nepřišly nebo neobsahují platnou session). Sleduj `cookieCount` a `hasSupabaseAuthCookie` v logu. |
| Je `[middleware /api/contracts]` s `userFound: true`, ale v route logu `xDebugMw: null` | **Hlavičky se z middleware do route nepředávají** (NextResponse.next). |
| V route logu je `xDebugMw: "1"` a `hasUserIdHeader: true` | Hlavičky fungují; route by měla autorizovat. Problém byl v Supabase SSR fallbacku nebo v tom, že hlavičky dříve nebyly nastaveny. |
| V route logu je `xDebugMw: "1"` ale `hasUserIdHeader: false` | Middleware běží a předává hlavičky, ale `x-user-id` nenastavil (např. `userFound: false`). |

### Aktuální závěr (z tvých logů)

- Middleware **běží** pro `/api/contracts/review` (`contractsBranchRan: true`).
- **userFound: false** → problém je v middleware: `getUser()` nevidí uživatele (cookies buď nejsou v requestu, nebo v nich není platná Supabase session).
- **Co zkontrolovat:** Je uživatel při načtení Review stránky opravdu přihlášen? Není zapnuté `NEXT_PUBLIC_SKIP_AUTH=true` (pak můžeš být na /portal bez session)? Posílá frontend u `fetch('/api/contracts/review')` cookies (same-origin defaultně ano; u jiného originu je potřeba `credentials: 'include'`)?

## Matcher

V `config.matcher` je `/api/contracts/:path*`, což matchuje např.:
- `/api/contracts/review`
- `/api/contracts/upload`
- `/api/contracts/debug-auth`
- `/api/contracts/review/123`

## Změněné soubory

- `apps/web/src/middleware.ts` – diagnostický log, hlavičky, výjimka pro debug-auth
- `apps/web/src/app/api/contracts/review/route.ts` – diagnostický log na začátek GET, auth jen z hlavičky
- `apps/web/src/app/api/contracts/upload/route.ts` – diagnostický log na začátek POST, auth jen z hlavičky
- `apps/web/src/app/api/contracts/debug-auth/route.ts` – nový GET endpoint (jen čte headers, vrací JSON)
