# Postupná kontrola výkonu (Aidvisora)

**Datum auditu:** 2026-03-31  
**Rozsah:** monorepo – primárně [`apps/web`](../apps/web) (Next.js 16), [`packages/db`](../packages/db), sdílené balíčky.

**Jak s tím pracovat:** každá fáze má stav a konkrétní nálezy z kódu. Metriky Lighthouse/PageSpeed doplňte ručně do tabulek po nasazení nebo z produkčního buildu (`pnpm --filter web build` / Vercel preview).

---

## Fáze 0 – Baseline a nástroje

| Nástroj | Stav | Poznámka |
|--------|------|----------|
| Vercel Speed Insights | Nasazeno | [`SpeedInsights`](../apps/web/src/app/layout.tsx) z `@vercel/speed-insights/next` v root layoutu. Ověřit v projektu Vercel, že je zapnutý Speed Insights. |
| Bundle Analyzer | Částečně | Skript `pnpm --filter web analyze` spouští `ANALYZE=true next build --webpack`. Next 16 default build používá Turbopack; **webpack** je nutný pro `@next/bundle-analyzer` (viz [Next bundling](https://nextjs.org/docs/app/guides/package-bundling)). |
| Sentry | Nasazeno | `@sentry/nextjs`, `instrumentation-client.ts` (replay + traces), server/edge config, `tunnelRoute: "/monitoring"` v [`next.config.js`](../apps/web/next.config.js). |

**Bundle report (lokální běh):** při úspěšném buildu se generuje `apps/web/.next/analyze/nodejs.html` a `edge.html` (složka `.next` je v `.gitignore`). **Aktuálně build může selhat** na chybějící závislosti `pdf-parse` (viz import v `pdf-text-fallback.ts`) – dokud to není vyřešeno, analýzu chunků dokončete po opravě nebo v CI s kompletními závislostmi.

### Šablona Lighthouse (mobile + desktop)

Změřte na produkčním buildu nebo preview; zapisujte LCP, INP, CLS (Google používá INP místo FID).

| URL | Mobile LCP | Mobile INP | Mobile CLS | Desktop LCP | Poznámka |
|-----|------------|------------|------------|-------------|----------|
| `/prihlaseni` | | | | | Auth |
| `/portal/today` | | | | | Nástěnka |
| `/portal/contacts` | | | | | Seznam kontaktů |
| `/portal/contacts/[uuid]` | | | | | Detail (desktop RSC) |
| `/portal/households` | | | | | Domácnosti |
| `/portal/pipeline` nebo `/portal/board` | | | | | Obchody / board |
| `/client` | | | | | Klientská zóna |
| `/portal/mindmap` nebo `/portal/analyses` | | | | | Těžší modul |

---

## Fáze 1 – Next.js (routing, RSC, caching)

**Nález:** `export const dynamic = "force-dynamic"` je použité hojně u **API routes** (auth, drive, gmail, calendar, AI, cron, …) – to je očekávané pro osobní/session data.

**Layouty / stránky (vyžadují dynamiku):**

- [`apps/web/src/app/portal/layout.tsx`](../apps/web/src/app/portal/layout.tsx) – `force-dynamic` (auth, DB, redirect setup).
- [`apps/web/src/app/dashboard/layout.tsx`](../apps/web/src/app/dashboard/layout.tsx) – redirect / dynamika.
- Vybrané portálové stránky: `portal/pipeline/[id]/page.tsx`, `portal/team-overview/...`, `portal/tools/...`, `rezervace/[token]/page.tsx`.

**Doporučení:** veřejné marketingové stránky bez osobních dat nechte bez zbytečného `force-dynamic` na úrovni nadřazeného layoutu (kontrola stromu `app/`). Portál jako celek je záměrně dynamický kvůli auth.

**Data fetching / client vs server:** Detail kontaktu [`portal/contacts/[id]/page.tsx`](../apps/web/src/app/portal/contacts/[id]/page.tsx) už používá aktivní záložku, `next/dynamic` pro těžké bloky a early return pro mobilní shell – vzor pro další těžké stránky.

---

## Fáze 2 – API routes a Server Actions

**API:** Kritické oblasti pod `apps/web/src/app/api/` – drive, gmail, calendar, `contracts/review`, AI, upload dokumentů. Latenci **p50/p95** sledujte ve Vercel Observability / logách nebo Sentry performance.

**Server Actions:** V [`apps/web/src/app/actions`](../apps/web/src/app/actions) je desítky modulů s `"use server"`. V projektu nebyl nalezen masivní výskyt `revalidatePath` / `revalidateTag` v `src` (cache invalidace může být řešena jinak). Doporučení: při úpravách akcí kontrolovat velikost payloadů a zbytečné full-page `router.refresh()` na klientovi.

---

## Fáze 3 – Databáze (Drizzle / SQL)

**Nález:** Drizzle schéma [`packages/db/src/schema/contacts.ts`](../packages/db/src/schema/contacts.ts) definuje tabulky bez explicitních `.index()` v tomto souboru. V [`packages/db/supabase-schema.sql`](../packages/db/supabase-schema.sql) tabulka `contacts` nemusí mít v základním výpisu samostatný `CREATE INDEX` na `tenant_id` – ověřte v produkčních migracích / Supabase, zda existuje index vhodný pro **filtrování kontaktů podle tenantu** (typické `WHERE tenant_id = ?`).

**Doporučení:** Profilovat nejpomalejší dotazy (kontakty, úkoly, pipeline) v dev se zapnutým logováním Postgresu nebo přes explain. Hledat N+1 v akcích, které načítají související záznamy v cyklu.

---

## Fáze 4 – Auth, middleware

**Soubor:** [`apps/web/src/middleware.ts`](../apps/web/src/middleware.ts) – Next hlásí migraci na konvenci `proxy` (viz varování při buildu). Na cestách `/portal` se doplňuje header `x-pathname` a pro Supabase routy probíhá `getUser()` – náklady jsou nutné pro auth; statické assety by měly být mimo middleware matcher (ověřte `matcher` v souboru).

**Doporučení:** Po přechodu na `proxy` (Next 16+) znovu ověřit chování redirectů a hlaviček.

---

## Fáze 5 – Portal UI (desktop vs mobil)

**Desktop:** [`PortalShell`](../apps/web/src/app/portal/PortalShell.tsx), [`PortalSidebar`](../apps/web/src/app/portal/PortalSidebar.tsx) – badge úkolů/zpráv může způsobovat periodické re-fetch; sledujte frekvenci volání v síťové záložce.

**Mobil:** [`portal/layout.tsx`](../apps/web/src/app/portal/layout.tsx) – při `mobileUiEnabled` renderuje `MobilePortalApp` + `children` ve skrytém `sr-only` slotu. Detail kontaktu má serverový **early return** pro mobilní UI, aby se neplýtvalo těžkým RSC stromem.

**Virtualizace:** [`VirtualizedColumn`](../apps/web/src/app/shared/mobile-ui/VirtualizedColumn.tsx) (`@tanstack/react-virtual`) se používá v mobilních [`ContactsScreen`](../apps/web/src/app/portal/mobile/screens/ContactsScreen.tsx) a [`TasksScreen`](../apps/web/src/app/portal/mobile/screens/TasksScreen.tsx) nad práhem ~24 položek. Desktopové tabulky kontaktů – zvážit stránkování nebo limity, pokud se seznamy zhoršují.

---

## Fáze 6 – Klientská zóna a veřejné stránky

**Client:** [`apps/web/src/app/client`](../apps/web/src/app/client) – layout a dashboard; ověřit LCP na slabším mobilu, kalkulačky bez blokování UI (dlouhé výpočty do `requestIdleCallback` / worker pokud přibudou).

**Marketing / auth:** Root [`layout.tsx`](../apps/web/src/app/layout.tsx) + Speed Insights; landing (`PremiumLandingPage` atd.) – ověřit velikost obrázků a fonty (`next/font` tam, kde chybí).

---

## Fáze 7 – Těžké moduly a integrace

**Grafy:** Chart.js v investičních kalkulačkách ([`InvestmentGrowthChart`](../apps/web/src/app/portal/calculators/_components/investment/InvestmentGrowthChart.tsx) atd.); ApexCharts přes `dynamic(..., { ssr: false })` v [`InvestmentBacktestChart`](../apps/web/src/app/portal/calculators/_components/investment/InvestmentBacktestChart.tsx) – dobrý vzor lazy načtení.

**Mindmap / board / pipeline:** Importy jsou route-level; nepřidávat tyto knihovny do sdíleného layoutu nástěnky bez nutnosti.

**Integrace (Google):** API routy jsou `force-dynamic`; UI by nemělo blokovat render na čekání na status integrace – ověřit v `portal/tools` a nastavení.

---

## Fáze 8 – Obrázky, PWA, assety

**next/image:** V codebase je relativně málo přímých importů `next/image` (např. [`Illustration`](../apps/web/src/app/components/Illustration.tsx), [`PremiumLandingPage`](../apps/web/src/app/components/PremiumLandingPage.tsx), [`AidvisoraLogoShimmerLoader`](../apps/web/src/app/components/AidvisoraLogoShimmerLoader.tsx)). **Doporučení:** rozšířit na další velké obrázky v marketingu a tam, kde se načítají uživatelské avatary z URL (kde to dává smysl s doménami a `remotePatterns` v `next.config`).

**PWA / Capacitor:** Skripty `cap:assets`, `brand:assets` v [`apps/web/package.json`](../apps/web/package.json) – držet ikony optimalizované (viz interní dokumentace mobilní aplikace).

---

## Fáze 9 – Capacitor a regresní kontrola

**Capacitor:** Po změnách výkonu ověřit start WebView, přechody mezi „obrazovkami“ v [`MobilePortalClient`](../apps/web/src/app/portal/mobile/MobilePortalClient.tsx) a zda neprobíhá zbytečná synchronní práce při `pathname` změně.

**Regrese:** Po dokončení priorit níže zopakovat tabulku Lighthouse (Fáze 0) a porovnat čísla.

---

## Backlog priorit (P0–P2)

| Priorita | Položka |
|----------|---------|
| **P0** | Opravit build: chybějící modul `pdf-parse` (nebo podmíněný import) pro kompletní production build a spolehlivý bundle report. |
| **P1** | Ověřit DB indexy pro časté dotazy (`contacts.tenant_id`, další hot listy) v produkční DB. |
| **P1** | Sledovat náklady middleware/proxy po migraci z `middleware.ts` na doporučenou konvenci Next 16. |
| **P2** | Rozšířit `next/image` a optimalizaci obrázků na další stránky. |
| **P2** | Zvážit `next experimental-analyze` při přechodu na výchozí Turbopack build pro srovnání s webpack analyzerem. |

---

## Závěr

Checklist všech fází je **dokumentovaný v repu**; číselné metriky Lighthouse vyplňte po měření v cílovém prostředí. Iterace: P0 build → baseline metriky → P1–P2 → regrese.
