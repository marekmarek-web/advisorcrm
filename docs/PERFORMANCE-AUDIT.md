# Postupná kontrola výkonu (Aidvisora)

**Datum auditu:** 2026-03-31 · **Implementace pass:** 2026-04-01  
**Rozsah:** monorepo – primárně [`apps/web`](../apps/web) (Next.js 16), [`packages/db`](../packages/db), sdílené balíčky.

**Jak s tím pracovat:** každá fáze má stav a konkrétní nálezy z kódu. Metriky Lighthouse/PageSpeed doplňte ručně do tabulek po nasazení nebo z produkčního buildu (`pnpm --filter web build` / Vercel preview).

---

## Fáze 0 – Baseline a nástroje

| Nástroj | Stav | Poznámka |
|--------|------|----------|
| Vercel Speed Insights | Nasazeno | [`SpeedInsights`](../apps/web/src/app/layout.tsx) z `@vercel/speed-insights/next` v root layoutu. Ověřit v projektu Vercel, že je zapnutý Speed Insights. |
| Bundle Analyzer | Částečně | Skript `pnpm --filter web analyze` spouští `ANALYZE=true next build --webpack`. Next 16 default build používá Turbopack; **webpack** je nutný pro `@next/bundle-analyzer` (viz [Next bundling](https://nextjs.org/docs/app/guides/package-bundling)). |
| Sentry | Nasazeno | `@sentry/nextjs`, `instrumentation-client.ts` (replay + traces), server/edge config, `tunnelRoute: "/monitoring"` v [`next.config.js`](../apps/web/next.config.js). |

**Bundle report (lokální běh):** při úspěšném buildu se generuje `apps/web/.next/analyze/nodejs.html` a `edge.html` (složka `.next` je v `.gitignore`). Production build (`pnpm --filter web build`) **prošel** s `pdf-parse` v závislostech ([`apps/web/package.json`](../apps/web/package.json)); dynamický import v [`pdf-text-fallback.ts`](../apps/web/src/lib/documents/processing/pdf-text-fallback.ts).

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

**Desktop:** [`PortalShell`](../apps/web/src/app/portal/PortalShell.tsx) obaluje [`PortalBadgeCountsProvider`](../apps/web/src/app/portal/PortalBadgeCountsContext.tsx) – **jedno** volání server action [`getPortalShellBadgeCounts`](../apps/web/src/app/actions/portal-badges.ts) místo dvou při každé změně `pathname` + samostatného dotazu pro zvoneček; obnovení každých ~60 s, při návratu na tab (`visibilitychange`), na události `portal-messages-badge-refresh` / `portal-tasks-badge-refresh` / `portal-notifications-badge-refresh`. Layout portálu už **neníčí** DB pro quick actions ([`portal/layout.tsx`](../apps/web/src/app/portal/layout.tsx)) – načítá je klient přes [`useQuickActionsItems`](../apps/web/src/lib/quick-actions/useQuickActionsItems.ts) (bez duplicitního fetchu, pokud RSC předá `initialConfig`).

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
| ~~**P0**~~ | ~~Build `pdf-parse`~~ – ověřeno úspěšným `pnpm --filter web build`. |
| **P1** | V produkční Supabase spustit nové indexy ze [`supabase-schema.sql`](../packages/db/supabase-schema.sql) / [`messages-unread-badge-index.sql`](../packages/db/migrations/messages-unread-badge-index.sql), pokud ještě nejsou. |
| **P1** | Sledovat náklady middleware/proxy po migraci z `middleware.ts` na doporučenou konvenci Next 16. |
| **P2** | Rozšířit `next/image` a optimalizaci obrázků na další stránky. |
| **P2** | Zvážit `next experimental-analyze` při přechodu na výchozí Turbopack build pro srovnání s webpack analyzerem. |

---

## Implementované optimalizace (2026-04-01)

| Oblast | Změna |
|--------|--------|
| Portál – badge | [`getPortalShellBadgeCounts`](../apps/web/src/app/actions/portal-badges.ts) + [`PortalBadgeCountsContext`](../apps/web/src/app/portal/PortalBadgeCountsContext.tsx); sidebar + zvoneček sdílí data; méně HTTP volání při navigaci. |
| Quick actions | Layout už nevolá `loadQuickActionsConfig`; jeden klientovský fetch, bez duplicity když RSC dodá seed. |
| `router.refresh` | Odstraněn u [`ContactTagsEditor`](../apps/web/src/app/components/contacts/ContactTagsEditor.tsx) (stačí lokální stav). |
| Dokumenty u kontaktu | [`DocumentsSection`](../apps/web/src/app/dashboard/contacts/[id]/DocumentsSection.tsx) – tichý refetch po uploadu/smazání (bez celého „Načítám…“). |
| Polling | Intervaly ve zprávách / chatu / scanu přeskakují tick, když je tab na pozadí (`document.visibilityState`). |
| DB | `getNotificationBadgeCount` používá `COUNT(*)` místo načtení všech řádků; index `idx_messages_tenant_unread_client` v schématu a migraci. |
| Fonty | `Plus_Jakarta_Sans`: `preload: false` – méně konkurence o LCP s primárním fontem. |
| Logy (produkce) | `logOpenAICall` a debug logy v [`api/contracts/review`](../apps/web/src/app/api/contracts/review/route.ts) jen v `development`. |

**Kontrola:** `pnpm exec tsc -p apps/web`, `pnpm --filter web build`, `pnpm --filter web test` (vitest).

---

## Fáze 2 – pokračování (TanStack Query, méně RSC refreshů)

| Oblast | Změna |
|--------|--------|
| TanStack Query | [`PortalQueryProvider`](../apps/web/src/app/portal/PortalQueryProvider.tsx) + [`PortalAppProviders`](../apps/web/src/app/portal/PortalAppProviders.tsx) v [`portal/layout.tsx`](../apps/web/src/app/portal/layout.tsx) (desktop i mobilní větev). Klíče v [`query-keys.ts`](../apps/web/src/lib/query-keys.ts). |
| Kontakty | [`ContactsPageClient`](../apps/web/src/app/portal/contacts/ContactsPageClient.tsx): `useQuery` + `invalidateQueries` místo `router.refresh` u hromadných akcí; desktop: postupné načítání řádků („Načíst další“). |
| Úkoly | [`portal/tasks/page.tsx`](../apps/web/src/app/portal/tasks/page.tsx): seznam úkolů a počty přes `useQuery` (`queryKeys.tasks.board`, invalidace `queryKeys.tasks.all`). |
| Pipeline | [`PipelinePageClient`](../apps/web/src/app/portal/pipeline/PipelinePageClient.tsx) + `useQuery` pro [`getPipeline`](../apps/web/src/app/actions/pipeline.ts); [`PipelineBoard`](../apps/web/src/app/dashboard/pipeline/PipelineBoard.tsx) po mutacích invaliduje `pipeline` + `contacts` místo `router.refresh()`. |
| Import CSV / AI drawer | [`CsvImportForm`](../apps/web/src/app/dashboard/contacts/CsvImportForm.tsx), [`AiAssistantDrawer`](../apps/web/src/app/portal/AiAssistantDrawer.tsx): po importu kontaktů invalidace `queryKeys.contacts`; drobná UX úprava fokusu vstupu po odeslání chatu. |
| Pokrytí produktů | [`ClientCoverageWidget`](../apps/web/src/app/components/contacts/ClientCoverageWidget.tsx): náhrada záložního `router.refresh` za invalidaci pipeline/úkolů/kontaktů. |
| DB / EXPLAIN | [`PERFORMANCE-EXPLAIN-HINTS.md`](PERFORMANCE-EXPLAIN-HINTS.md) – vzorové dotazy pro ruční kontrolu indexů v produkci. |
| Produkční logy (AI) | `console.info` / diagnostická `console.warn` v [`ai-service`](../apps/web/src/lib/ai/ai-service.ts), [`contract-understanding-pipeline`](../apps/web/src/lib/ai/contract-understanding-pipeline.ts), [`ai-review-classifier`](../apps/web/src/lib/ai/ai-review-classifier.ts), [`ai-review-pipeline-v2`](../apps/web/src/lib/ai/ai-review-pipeline-v2.ts) podmíněny `NODE_ENV !== "production"` kde jde o vývojářský šum. |
| Kalendář | [`PortalCalendarView`](../apps/web/src/app/portal/PortalCalendarView.tsx) již používá `useMemo` pro rozsahy dnů, agregaci událostí a popisky – další optimalizace až podle profileru. |

### Výkon – fáze 3 (navazující)

| Oblast | Změna |
|--------|--------|
| Dokumenty u kontaktu | [`queryKeys.contacts.documentsBundle`](../apps/web/src/lib/query-keys.ts) + `useQuery` v [`DocumentsSection`](../apps/web/src/app/dashboard/contacts/[id]/DocumentsSection.tsx); invalidace po uploadu/smazání místo opakovaného efektového fetchu. |
| `router.refresh` + cache | U detailu obchodu a domácností: před `router.refresh()` se volá `invalidateQueries` na `queryKeys.pipeline` / `contacts` / `tasks` tam, kde už existuje TanStack cache ([`DealDetailHeader`](../apps/web/src/app/portal/pipeline/[id]/DealDetailHeader.tsx), [`HouseholdDetailView`](../apps/web/src/app/portal/households/[id]/HouseholdDetailView.tsx), [`HouseholdListClient`](../apps/web/src/app/portal/households/HouseholdListClient.tsx), …). |
| Pipeline UI | [`PipelineBoard`](../apps/web/src/app/dashboard/pipeline/PipelineBoard.tsx): vytažená karta příležitosti, stabilnější handlery pro DnD (`useCallback`). |
| DB – N+1 / select | [`getHouseholdsList`](../apps/web/src/app/actions/households.ts): jeden dotaz s `GROUP BY` + `count` místo dotazu na členy pro každou domácnost; [`getHouseholdsWithMembers`](../apps/web/src/app/actions/households.ts): dva dotazy (seznam + `inArray` členů); [`getContactDependencyCounts`](../apps/web/src/app/actions/contacts.ts) a [`addTagToContacts`](../apps/web/src/app/actions/contacts.ts): paralelní čtení / zápis; [`getPipeline`](../apps/web/src/app/actions/pipeline.ts) / [`getPipelineByContact`](../apps/web/src/app/actions/pipeline.ts): zúžený select stupňů; [`getContractsByContact`](../apps/web/src/app/actions/contracts.ts): explicitní sloupce místo `select()`. Indexy a EXPLAIN: [`PERFORMANCE-EXPLAIN-HINTS.md`](PERFORMANCE-EXPLAIN-HINTS.md), [`packages/db/supabase-schema.sql`](../packages/db/supabase-schema.sql). |
| AI drawer | [`AiAssistantDrawer`](../apps/web/src/app/portal/AiAssistantDrawer.tsx): synchronní zámek (`ref`) proti dvojímu odeslání chatu / „urgentní“ shrnutí dřív, než stihne naskočit `chatLoading`. Stream odpovědi: viz **Výkon – fáze 5**. |

**Lighthouse / analyze:** tabulku v sekci „Šablona Lighthouse“ doplňte po měření v cílovém prostředí. Bundle: `pnpm --filter web analyze` (webpack, viz Fáze 0) generuje `apps/web/.next/analyze/nodejs.html` a `edge.html` – slouží k orientaci ve velkých chunky; čísla závisí na lokálním buildu.

### Výkon – fáze 4 (navazující)

| Oblast | Změna |
|--------|--------|
| Kalendář | [`queryKeys.calendar`](../apps/web/src/lib/query-keys.ts) + `useQuery` pro `listEvents` v [`PortalCalendarView`](../apps/web/src/app/portal/PortalCalendarView.tsx) (`placeholderData: keepPreviousData`, `staleTime` 45 s); po CRUD / Google sync `invalidateQueries` na `queryKeys.calendar.all`. |
| Finanční analýzy | [`queryKeys.analyses`](../apps/web/src/lib/query-keys.ts) + `useQuery` v [`AnalysesPageClient`](../apps/web/src/app/portal/analyses/AnalysesPageClient.tsx); po archivaci/smazání invalidace místo plného `router.refresh`. Serializace sdílena v [`analyses-page-utils`](../apps/web/src/app/portal/analyses/analyses-page-utils.ts). |
| Mindmap seznam | Po vytvoření volné mapy [`onRefresh`](../apps/web/src/app/portal/mindmap/page.tsx) místo `router.refresh` ([`MindmapListClient`](../apps/web/src/app/portal/mindmap/MindmapListClient.tsx)). |
| Domácnosti | [`queryKeys.households`](../apps/web/src/lib/query-keys.ts) + `useQuery` v [`HouseholdListClient`](../apps/web/src/app/portal/households/HouseholdListClient.tsx); wizard/smazání invaliduje `households` + existující cache bez `router.refresh` na seznamu. [`HouseholdDetailView`](../apps/web/src/app/portal/households/[id]/HouseholdDetailView.tsx) doplňuje invalidaci `households` při úpravách. |
| Integrace Google (server) | Diagnostické `log()` v calendar/drive/gmail integration services jen v `NODE_ENV === "development"` (chyby `logError` zůstávají). |
| Fonty (root layout) | [`layout.tsx`](../apps/web/src/app/layout.tsx): upřesněný komentář k preload (`Source_Sans_3` primární, `Plus_Jakarta_Sans` bez preload). |

**`router.refresh()` – záměrně ponechané (bez TanStack klíče nebo nutný RSC detail):** odhlášení ([`UserMenu`](../apps/web/src/app/components/UserMenu.tsx), [`SignOutButton`](../apps/web/src/app/components/SignOutButton.tsx)); uložení profilu v Nastavení ([`SetupView`](../apps/web/src/app/portal/setup/SetupView.tsx)); klientská zóna (upload, profil, notifikace); detail obchodu ([`DealDetailHeader`](../apps/web/src/app/portal/pipeline/[id]/DealDetailHeader.tsx)) a vlastní pole příležitosti ([`OpportunityCustomFieldsTab`](../apps/web/src/app/portal/pipeline/[id]/OpportunityCustomFieldsTab.tsx)) kde invalidace doplňuje cache a `router.refresh` synchronizuje RSC props; [`HouseholdDetailView`](../apps/web/src/app/portal/households/[id]/HouseholdDetailView.tsx) po úpravách domácnosti na stejné route.

### Výkon – fáze 5 (navazující)

| Oblast | Změna |
|--------|--------|
| AI chat (stream) | [`POST /api/ai/assistant/chat`](../apps/web/src/app/api/ai/assistant/chat/route.ts): s `?stream=1` vrací SSE (`text/event-stream`) – události `text` (chunky zprávy) a `complete` s plným [`AssistantResponse`](../apps/web/src/lib/ai/assistant-tool-router.ts); bez parametru zůstává JSON. Klient: [`assistant-chat-client.ts`](../apps/web/src/lib/ai/assistant-chat-client.ts), desktop [`AiAssistantDrawer`](../apps/web/src/app/portal/AiAssistantDrawer.tsx), mobil [`AiAssistantChatScreen`](../apps/web/src/app/portal/mobile/screens/AiAssistantChatScreen.tsx). Compliance výstup beze změny významu ([aidvisor-compliance](../.cursor/rules/aidvisor-compliance.mdc)). |
| Kalendář – kontakty a příležitosti | [`PortalCalendarView`](../apps/web/src/app/portal/PortalCalendarView.tsx): `useQuery` místo mount `useEffect` – klíče [`queryKeys.calendar.contactsPick()`](../apps/web/src/lib/query-keys.ts) (alias na `contacts.list`) a `calendar.openOpportunities()` → [`pipeline.openListWithContact`](../apps/web/src/lib/query-keys.ts); `staleTime` 120 s. |
| Contract review – polling | [Detail revize smlouvy](../apps/web/src/app/portal/contracts/review/[id]/page.tsx): při `document.visibilityState === "hidden"` se další dotaz odkládá na 60 s; při návratu na tab (`visibilitychange`) se čekající timeout zruší a proběhne okamžitý poll (stejný vzor jako u zpráv v auditu). |
| `router.refresh` (RSC) | **Záměrně ponechané** u uložení profilu v [`SetupView`](../apps/web/src/app/portal/setup/SetupView.tsx), [`DealDetailHeader`](../apps/web/src/app/portal/pipeline/[id]/DealDetailHeader.tsx) / [`OpportunityCustomFieldsTab`](../apps/web/src/app/portal/pipeline/[id]/OpportunityCustomFieldsTab.tsx) a [`HouseholdDetailView`](../apps/web/src/app/portal/households/[id]/HouseholdDetailView.tsx): po server actions je potřeba znovu načíst **serverové props** (RSC data z `getOpportunityById`, domácnost, seed nastavení). TanStack `invalidateQueries` zůstává vedle toho pro sdílené seznamy. |
| Dashboard – smlouvy u kontaktu | [`ContractsSection`](../apps/web/src/app/dashboard/contacts/[id]/ContractsSection.tsx) sdílí [`queryKeys.contacts.documentsBundle`](../apps/web/src/lib/query-keys.ts) s [`DocumentsSection`](../apps/web/src/app/dashboard/contacts/[id]/DocumentsSection.tsx) přes [`contact-documents-bundle.ts`](../apps/web/src/app/dashboard/contacts/contact-documents-bundle.ts); segmenty a duplicity přes `contractSegments` / `contractDupPairs`. |

**Lighthouse / analyze:** tabulku v sekci „Šablona Lighthouse“ (Fáze 0) doplňte po měření v cílovém prostředí. Z `apps/web`: `pnpm --filter web analyze` (webpack, viz Fáze 0) generuje `apps/web/.next/analyze/nodejs.html` a `edge.html` – orientace ve velkých chunky; čísla závisí na lokálním buildu a konfiguraci.

**Backlog P2:** rozšířit [`next/image`](../apps/web/src/app/layout.tsx) na marketingové stránky, pokud vznikne čas (viz Fáze 8).

---

## Závěr

Checklist všech fází je **dokumentovaný v repu**; číselné metriky Lighthouse vyplňte po měření v cílovém prostředí. Iterace: baseline metriky → P1–P2 → regrese.
