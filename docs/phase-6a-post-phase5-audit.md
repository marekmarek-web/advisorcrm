# Fáze 6A – post-phase5 audit a release mapa

Datum: 2026-04-03  
Model: Sonnet 4.6  
Repo: `/Users/marekmarek/Developer/Aidvisora`  
Poslední commit před auditem: `2af9376 AI Asistent: rychlá akce Připomeň mi`

---

## Výsledek auditu (shrnutí)

| Oblast | Stav | Subfáze |
|--------|------|---------|
| Client auth guards (všechny pages) | **Already stable** | 6B → can be quick confirmation |
| Client portal routes (messages, notif, docs, portfolio, requests, pozadavky-poradce) | **Already stable** | – |
| Phase 5 regression gate (`test:client-portal-phase5-regression`) | **Already stable** | 6F → verify coverage |
| Lint gate (`eslint.config.mjs`, real rules) | **Already stable** | 6G → verify CI pass |
| Toast stack (polling 35 s) | **Needs hardening** | 6C |
| Notification delivery policy + edge cases | **Needs hardening** | 6C |
| Request thread edge cases (closed, empty, deep link, repeat attachment) | **Needs hardening** | 6D |
| Contracts segment/type dual-field enforcement | **Needs hardening** | 6E |
| Publish safety guards (review approval gate) | **Needs hardening** | 6E |
| Observability pro phase 5 flows (portal-notifications, material-requests, auth guard) | **Needs extend** | 6H |
| Docs: `client-portal-flow.md`, `ai-review-publish-flow.md` | **Needs extend** | 6I |
| Docs: `repo-map.md`, `source-of-truth.md` | **Already stable** | – |

---

## 1. Client auth consistency

**Stav: Already stable**

Všechny server page soubory pod `apps/web/src/app/client/**/page.tsx` i `layout.tsx` používají **`requireClientZoneAuth()`** konzistentně:

- `layout.tsx` → `requireClientZoneAuth()` ✓
- `notifications/page.tsx` → `requireClientZoneAuth()` ✓ (plán říkal `requireAuth()` z veřejného repa — lokálně už fixnuto v commit `c370070 P2.2 + P2.3`)
- `payments/page.tsx` → `requireClientZoneAuth()` ✓
- `messages/page.tsx` → `requireClientZoneAuth()` ✓
- `requests/page.tsx` → `requireClientZoneAuth()` ✓
- `requests/new/page.tsx` → `requireClientZoneAuth()` ✓
- `pozadavky-poradce/page.tsx` → `requireClientZoneAuth()` ✓
- `pozadavky-poradce/[id]/page.tsx` → `requireClientZoneAuth()` ✓
- `portfolio/page.tsx` → `requireClientZoneAuth()` ✓
- `documents/page.tsx` → `requireClientZoneAuth()` ✓
- `profile/page.tsx` → `requireClientZoneAuth()` ✓

**6B** stačí provést jako rychlý confirmation pass + přidat regression scénář na client-only access.

---

## 2. Client portal routes

**Stav: Already stable**

Všechny očekávané routes z Fáze 5 existují:

```
apps/web/src/app/client/
  messages/          ✓
  notifications/     ✓
  documents/         ✓
  portfolio/         ✓
  requests/          ✓  (+ new/ subfolder)
  pozadavky-poradce/ ✓  (+ [id]/ detail)
  profile/           ✓
  payments/          ✓
  contracts/         ✓
  calculators/       ✓  (+ investment/, mortgage/)
  investments/       ✓
```

Shell komponenty:
- `ClientPortalShell.tsx` ✓
- `ClientPortalTopbar.tsx` ✓
- `ClientMaterialRequestToastStack.tsx` ✓
- `ClientSidebar.tsx`, `ClientChatWrapper.tsx` atd. ✓

---

## 3. Toast stack (notifications delivery)

**Stav: Needs hardening → 6C**

`ClientMaterialRequestToastStack` polluje každých **35 sekund** volání `getPortalNotificationsForClient()`. Toto je vědomá v1 decision:

- `shownRef` dedup přes `Set<string>` brání duplicitním toastům v rámci jedné session ✓
- Router deep-link na `/client/pozadavky-poradce/${requestId}` ✓
- `markPortalNotificationRead` při otevření ✓

**Gaps pro 6C:**
- Polling zůstane jako vědomý v1 release režim — dokumentovat explicitně
- Ověřit edge case: co se stane, pokud `relatedEntityId` chybí a JSON body také neobsahuje `requestId`
- Ověřit konzistenci route mezi bell (topbar), toast a notifications page
- Ověřit, že notifikace pro `new_document` a `request_status_change` mají správné deep-linky

---

## 4. Phase 5 regression gate

**Stav: Already stable (základní scaffold)**

`apps/web/package.json` má:
```json
"test:client-portal-phase5-regression": "vitest run src/lib/client-portal/__tests__/phase-5-client-portal-bridge-regression.test.ts ..."
```

Test soubor: `src/lib/client-portal/__tests__/phase-5-client-portal-bridge-regression.test.ts`

Pokrývá: `materialRequestStatusLabel`, `getPortalNotificationDeepLink`, `mapFinancialSummaryForClientDashboard`, `toClientMobileInitialData`, `createPortalNotification` (dedup).

**Gaps pro 6F:**
- Chybí scénář: advisor vytvoří požadavek → klient dostane notif → klient odpoví → poradce dostane výsledek (end-to-end request thread)
- Chybí scénář: closed request nepovolí neplatnou akci
- Chybí scénář: klient nevidí nepublikovaný dokument / smlouvu
- Chybí scénář: bell, toast a page konzistentní unread/read

---

## 5. Lint gate

**Stav: Already stable**

`apps/web/eslint.config.mjs` existuje s reálnou konfigurací:

- `eslint-config-next/core-web-vitals` + `typescript` ✓
- `@typescript-eslint/no-explicit-any`: warn ✓
- `@typescript-eslint/no-unused-vars`: warn (argsIgnorePattern `^_`) ✓
- `react-hooks/rules-of-hooks`: warn ✓
- `react/no-unescaped-entities`: warn ✓
- Správné `ignores` (`.next/`, `node_modules`, Capacitor, Playwright) ✓

Package script: `lint: eslint . --quiet` — **není placeholder**, jde o reálný gate.

**6G** stačí ověřit, že `pnpm --filter web lint` projde bez errors; zdokumentovat stávající warnings jako debt list.

---

## 6. Contracts segment/type

**Stav: Needs hardening → 6E**

V `packages/db/src/schema/contracts.ts`:
```ts
segment: text("segment").notNull(),
/** Kanonický kód shodný se segmentem (legacy / reporting); vždy synchronní s `segment`. */
type: text("type").notNull(),
```

- Oba fieldy existují a jsou `notNull()`.
- Komentář říká "vždy synchronní" — ale žádný enforce mechanismus v schématu ani v DB constraints.
- `visibleToClient: boolean` existuje s default `true` ✓
- `portfolioStatus` enum s hodnotami `draft | pending_review | active | ended` ✓

**Gaps pro 6E:**
- Audit publish flow: kde se zapisuje `type` při create/update contractu a zda se vždy rovná `segment`
- Přidat publish guard: contract bez `advisorConfirmedAt` nesmí být `visibleToClient = true` bez explicitního approve
- Ověřit AI review → contract create path (sourceKind = `ai_review`)

---

## 7. Observability

**Stav: Needs extend → 6H**

Existující Sentry coverage:
- `src/lib/observability/assistant-sentry.ts` — AI assistant HTTP handler failures ✓
- `src/lib/observability/contract-review-sentry.ts` — contract review failures ✓
- `src/lib/observability/production-error-ui.ts` — UI error boundary ✓

**Chybí** (žádný `captureException` v):
- `apps/web/src/app/actions/portal-notifications.ts`
- `apps/web/src/app/actions/advisor-material-requests.ts`
- `apps/web/src/app/actions/portal-badges.ts`
- Notification delivery failures (create, dedup selhání)
- Request reply failures
- Attachment linking failures
- Auth guard mismatches (kdy `requireClientZoneAuth()` selže mimo layout)

---

## 8. Docs stav

**Stav: Partially done**

| Dokument | Stav |
|----------|------|
| `docs/repo-map.md` | ✓ Existuje, aktuální |
| `docs/source-of-truth.md` | ✓ Existuje (rozcestník na SOURCES-OF-TRUTH.md) |
| `docs/agent-entrypoints.md` | ✓ Existuje |
| `docs/client-portal-flow.md` | ✗ **Chybí** |
| `docs/ai-review-publish-flow.md` | ✗ **Chybí** |

**6I:** Napsat oba chybějící docs.

---

## 9. Exact files to touch (per subfáze)

### 6B – auth consistency (confirmation pass)
- `apps/web/src/app/client/**/page.tsx` — audit je hotový, žádný drift; přidat regression scénář
- `apps/web/src/lib/client-portal/__tests__/phase-5-client-portal-bridge-regression.test.ts` — doplnit client-only access scénář

### 6C – notification hardening
- `apps/web/src/app/client/ClientMaterialRequestToastStack.tsx` — dokumentovat polling jako vědomé rozhodnutí v1; opravit edge case chybějícího requestId
- `apps/web/src/app/actions/portal-notifications.ts` — ověřit route resolution pro všechny typy notifikací
- `apps/web/src/lib/client-portal/portal-notification-routing.ts` — přidat chybějící typy (new_document, request_status_change, new_message)
- `apps/web/src/lib/client-portal/__tests__/phase-5-client-portal-bridge-regression.test.ts` — přidat bell/toast/page konzistenci

### 6D – request thread hardening
- `apps/web/src/app/client/pozadavky-poradce/page.tsx`
- `apps/web/src/app/client/pozadavky-poradce/[id]/page.tsx`
- Edge cases: closed/done request, prázdná komunikace, repeat attachment, direct deep link
- `apps/web/src/lib/client-portal/__tests__/` — doplnit request thread scénáře

### 6E – document visibility + publish safety
- `packages/db/src/schema/contracts.ts` — zdokumentovat segment/type invariant (nebo přidat DB constraint)
- `apps/web/src/app/actions/contracts.ts` — ověřit publish flow + přidat guard
- `apps/web/src/app/actions/documents.ts` — ověřit visibility rules

### 6F – regression gate
- `apps/web/src/lib/client-portal/__tests__/phase-5-client-portal-bridge-regression.test.ts` — doplnit 5 chybějících scénářů
- `apps/web/package.json` — ověřit / rozšířit `test:client-portal-phase5-regression` scope

### 6G – lint gate
- Spustit `pnpm --filter web lint` a ověřit 0 errors
- Zapsat debt list varování do `docs/lint-debt.md` (pokud je potřeba)

### 6H – observability
- `apps/web/src/lib/observability/portal-sentry.ts` — **nový soubor**, phase 5/6 flows
- `apps/web/src/app/actions/portal-notifications.ts` — přidat Sentry hooks
- `apps/web/src/app/actions/advisor-material-requests.ts` — přidat Sentry hooks

### 6I – docs
- `docs/client-portal-flow.md` — **nový soubor**
- `docs/ai-review-publish-flow.md` — **nový soubor**

---

## 10. Out of scope

- Rebuild klientského portálu
- Rebuild AI review UI
- Rebuild contracts UI
- Nový notification systém (polling je vědomé v1 rozhodnutí)
- Celkový monorepo lint cleanup jedním refaktorem
- Nová produktová oblast

---

## 11. Doporučené pořadí execute po 6A

| Pořadí | Subfáze | Odůvodnění |
|--------|---------|------------|
| 1 | **6B** | Rychlý pass (auth je stable, jen potvrdit + regression) |
| 2 | **6C** | Notification hardening — závisí na 6B auth stabilitě |
| 3 | **6D** | Request thread — souběžně s 6C nebo po ní |
| 4 | **6E** | Publish safety — nejkritičtější, Opus 4.6 |
| 5 | **6F** | Regression gate — staví na 6C + 6D + 6E coverage |
| 6 | **6G** | Lint gate — verify current stav, debt list |
| 7 | **6H** | Observability — nový portal-sentry modul |
| 8 | **6I** | Docs — dopsat chybějící 2 dokumenty |
