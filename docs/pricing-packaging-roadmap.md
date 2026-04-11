# Pricing, balíčky a backlog (interní source of truth)

Tento dokument je **centrální referenční bod** pro produktové a technické rozhodnutí kolem plánů, přístupových režimů a webu. Není marketingový text pro zákazníky; slouží vývoji a promptům.

Související technický popis implementace Fáze 0–1: `docs/billing-plan-architecture.md`.

---

## 1) Aktuální stav architektury v repu

### Veřejné vs interní identita

- **Veřejné názvy produktů:** Start, Pro, Management (mapované přes `publicPlanKey`: `start` | `pro` | `management`).
- **Interní billing / Stripe tiery (beze změny enumů):** `starter` | `pro` | `team`.
- **Mapování:** `team` (interně) = **Management** (veřejně). Env proměnné zůstávají `STRIPE_PRICE_TEAM_*` atd.

### Kde je „source of truth“ v kódu

| Oblast | Soubor / modul |
|--------|----------------|
| Katalog plánů, capability matrix, konfigurační limity, default tenant settings patch | `apps/web/src/lib/billing/plan-catalog.ts` |
| Čistá resoluce přístupu (bez DB) | `apps/web/src/lib/billing/access-resolution.ts` — `computeEffectiveAccessContext` |
| Async resoluce (DB + admin allowlist) | `apps/web/src/lib/billing/resolve-effective-access.ts` — `resolveEffectiveAccessContext` |
| Interní admin (env allowlist) | `apps/web/src/lib/billing/internal-admin.ts` |
| Stav předplatného z DB | `apps/web/src/lib/billing/subscription-state.ts` — `getSubscriptionState` |
| Typ `SubscriptionState` | `apps/web/src/lib/stripe/billing-types.ts` |
| Stripe ceny / checkout metadata labels | `apps/web/src/lib/stripe/price-catalog.ts`, `planLabelCs` |
| Hrubé entitlements (stávající flow) | `apps/web/src/lib/entitlements.ts` — `resolveEntitlements` / `checkEntitlement` |
| Tenant settings registry | `apps/web/src/lib/admin/settings-registry.ts` |
| DB: předplatné | `packages/db/src/schema/subscriptions.ts` — `plan` je text |
| DB: tenant + workspace trial | `packages/db/src/schema/tenants.ts` — `trial_*`, migrace `packages/db/migrations/tenant_trial_billing_2026-04-11.sql` |
| Nový workspace / start trial | `apps/web/src/lib/auth/ensure-workspace.ts` |
| Sync Stripe → DB, označení spotřebovaného trialu | `apps/web/src/lib/stripe/subscription-sync.ts` — mimo jiné `markTenantTrialConverted` |
| Webhook | `apps/web/src/app/api/stripe/webhook/route.ts` |
| Checkout | `apps/web/src/app/api/stripe/checkout/route.ts` |
| Billing snapshot pro UI | `apps/web/src/lib/stripe/workspace-billing.ts` — `getWorkspaceBillingSnapshot` |
| Workspace billing UI (tarify, badge trial / admin) | `apps/web/src/app/components/billing/WorkspaceStripeBilling.tsx` |
| Landing pricing sekce (obsah, ne architektura) | `apps/web/src/app/components/PremiumLandingPage.tsx` |
| Nastavení / tarif copy | `apps/web/src/app/portal/setup/SetupView.tsx` |
| Profil — billing + interní admin badge | `apps/web/src/app/portal/profile/page.tsx`, `AdvisorProfileView.tsx` |

### Co už platí technicky

- Granulární **capability klíče** jsou definované v `plan-catalog` (`PlanCapabilityKey`); **většina route guardů je na ně zatím nenapojená** — stále dominuje hrubý model v `entitlements.ts` + tenant settings.
- **Workspace trial** (14 dní, úroveň Pro) je persistovaný na `tenants`; oddělený od Stripe „trial period“ u konkrétní ceny.
- **Internal admin** není tier; je `EffectiveAccessSource === "internal_admin"` s bypass limitů.
- **Restricted** je připravený stav pro budoucí paywall; data se při přechodu nemají mazat (viz architektura).

### Co zatím nesedí s cílem produktu (záměrně odloženo)

- **Ceny na webu / v `WorkspaceStripeBilling` TIER_COPY** mohou být jiné než cílové níže — sjednocení je součástí pozdější fáze UI/copy, ne bloku architektury 0–1.
- **Landing page** — bez redesignu v tomto dokumentu pouze zaznamenán backlog (viz §8).

---

## 2) Cílové veřejné balíčky

| Veřejný název | `publicPlanKey` | Určení (stručně, produktově) |
|----------------|-----------------|------------------------------|
| **Start** | `start` | Vstupní placený plán; základ CRM, kalendář, základní portál a AI dle matrixu v katalogu. |
| **Pro** | `pro` | Plnější integrace (Google), klientský portál, pokročilejší AI / review dle matrixu. |
| **Management** | `management` | Vše z Pro + týmové / manažerské přehledy a pokročilé reporty dle matrixu. |

Veřejný výběr v checkoutu a pricing gridu zůstává **pouze těmito třemi** — žádný čtvrtý „plán“ pro interní admin.

---

## 3) Interní technické reality

- **Interní tiery:** `starter`, `pro`, `team` (Stripe price IDs, metadata, parsování `subscriptions.plan`).
- **Veřejný label „Management“** odpovídá interně **`team`** — přejmenování je prezentační; refaktor DB enumů záměrně neproběhl.
- Parsování tieru z uloženého řetězce: `tryParseInternalTierFromStoredPlan` v `plan-catalog.ts`.

---

## 4) Trial

- **Délka:** 14 kalendářních dní (`TRIAL_DURATION_DAYS` v `plan-catalog.ts`).
- **Capabilities a limity:** shodné s **Pro** (`getTrialPlanDefinition()` → definice `pro` v katalogu).
- **Persistované pole:** `tenants.trial_started_at`, `trial_ends_at`, `trial_plan_key` (např. `pro`), `trial_converted_at` po přechodu na placené předplatné přes Stripe.
- **Stripe checkout trial** (dny na ceně) je **jiný koncept** než workspace trial — oba mohou koexistovat; dokumentace chování: `docs/billing-plan-architecture.md`.

---

## 5) Internal admin

- **Účel:** plný přístup pro vybrané interní účty (owner / provoz), **mimo veřejný pricing**.
- **Mechanismus:** allowlist `AIDV_INTERNAL_ADMIN_EMAILS`, `AIDV_INTERNAL_ADMIN_USER_IDS` (`internal-admin.ts`).
- **Chování:** všechny capabilities zapnuté; limity typu `EffectiveLimits` s `bypass: true`; precedense v `computeEffectiveAccessContext` před předplatným a workspace trialem.
- **UI:** badge v profilu / billing bloku — není nabídka tarifu.

---

## 6) Cílová capability logika

- **Kanonické klíče:** `PLAN_CAPABILITY_KEYS` v `plan-catalog.ts` (CRM, Google, klientský portál, AI vrstvy, tým, reporty).
- **Pravda o produktu:** boolean matrix je **zdroj pro budoucí enforcement**; dokud nejsou napojené všechny surface, zůstává i hrubý model `EntitlementKey` v `entitlements.ts`.
- **Sync do tenant settings:** část klíčů má odvozené defaulty v `defaultTenantSettings` u každé definice plánu; další klíče jsou v `FUTURE_TENANT_SETTING_KEYS` (rozšíření registry ve Fázi 2).
- **Restricted:** konzervativní `RESTRICTED_CAPABILITIES` — upřesní se při produktovém rozhodnutí pro „upgrade required“ stav.

---

## 7) Cílové ceny (produktové rozhodnutí)

Měsíční základ (před slevou):

| Plán | Cílová cena |
|------|-------------|
| Start | **990 Kč / měsíc** |
| Pro | **1 990 Kč / měsíc** |
| Management | **3 490 Kč / měsíc** |

**Roční fakturace:** sleva **20 %** oproti součtu 12× měsíční ceny (stejná logika jako dnes u „ročně −20 %“ na webu).

**Poznámka k implementaci:** skutečné částky v UI a ve Stripe musí být v jednom okamžiku sjednoceny (env / Price IDs); do té doby platí, že **kód může obsahovat starší čísla v komponentách** — viz backlog Fáze 5–6.

---

## 8) Backlog pro web (nezbytně zaznamenat, neřešit hned celé)

Detailní backlog positioning a plánovaných sekcí: **`docs/website-positioning-backlog.md`**.  
Regression checklist (QA Fáze 7): **`docs/pricing-regression-checklist.md`**.

- **Pricing copy** — současné popisy balíčků jsou slabé vs. reálná diferenciace z capability matrixu.
- **Tón / délka** — část landingu je vizuálně a textově přepálená; cíl: střídmější marketing, více konkrétních benefitů vázaných na funkce.
- **Důkazní materiály** — chybí dostatek **reálných ukázek UI** a funkčních screenshotů (CRM, portál, kalendář, AI review, týmové přehledy).
- **Není součástí tohoto dokumentu** — kompletní redesign landing page ani plná výměna assetů; jde o záměr a prioritu pro pozdější iterace.

---

## 9) Rozdělení do fází

| Fáze | Obsah |
|------|--------|
| **0–1** | Plan catalog, public labely (Start / Pro / Management), mapování na interní tiery, `EffectiveAccessContext`, workspace trial + internal admin architektura, minimální DB pro trial, dokumentace. |
| **2** | Granulární entitlements podle `PlanCapabilities` + sladění s `tenant_settings` / provisioning defaultů. |
| **3** | Usage accounting, měření spotřeby vůči `PlanLimits` / token budget. |
| **4** | Server-side guards na API a kritické akce podle capabilities a limitů. |
| **5** | Pricing UI v aplikaci (workspace billing), CRM/billing přehledy, konzistentní upgrade / restricted stavy v UI. |
| **6** | Web copy, landing pricing sekce, méně přepálený marketing, reálné ukázky a screenshoty (backlog §8). |
| **7** | QA, regresní testy billing/access/trial/stripe flows. |

---

## Relevantní soubory a moduly pro další fáze

**Billing / plány / přístup**

- `apps/web/src/lib/billing/plan-catalog.ts`
- `apps/web/src/lib/billing/access-resolution.ts`
- `apps/web/src/lib/billing/resolve-effective-access.ts`
- `apps/web/src/lib/billing/internal-admin.ts`
- `apps/web/src/lib/billing/subscription-state.ts`
- `apps/web/src/lib/entitlements.ts`
- `apps/web/src/lib/stripe/billing-types.ts`
- `apps/web/src/lib/stripe/price-catalog.ts`
- `apps/web/src/lib/stripe/workspace-billing.ts`
- `apps/web/src/lib/stripe/subscription-sync.ts`
- `apps/web/src/lib/stripe/server.ts` (Stripe klient / dostupnost)
- `apps/web/src/app/api/stripe/checkout/route.ts`
- `apps/web/src/app/api/stripe/portal/route.ts`
- `apps/web/src/app/api/stripe/webhook/route.ts`

**DB**

- `packages/db/src/schema/subscriptions.ts`
- `packages/db/src/schema/tenants.ts`
- `packages/db/src/schema/tenant-settings.ts`
- `packages/db/migrations/tenant_trial_billing_2026-04-11.sql` (a další migrace dle Fáze 2–3)

**Nastavení tenantů**

- `apps/web/src/lib/admin/settings-registry.ts`
- `apps/web/src/lib/admin/effective-settings-resolver.ts` (pokud se bude syncovat z plánu)

**Provisioning / uživatel**

- `apps/web/src/lib/auth/ensure-workspace.ts`

**UI (ceník, billing, copy)**

- `apps/web/src/app/components/billing/WorkspaceStripeBilling.tsx`
- `apps/web/src/app/components/PremiumLandingPage.tsx`
- `apps/web/src/app/portal/setup/SetupView.tsx`
- `apps/web/src/app/portal/profile/page.tsx`
- `apps/web/src/app/portal/profile/AdvisorProfileView.tsx`

**Dokumentace**

- `docs/billing-plan-architecture.md`
- `docs/pricing-packaging-roadmap.md` (tento soubor)
