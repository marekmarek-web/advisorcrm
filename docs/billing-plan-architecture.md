# Billing a plány (Fáze 0–1)

Produktové zadání, ceny a backlog k webu: **`docs/pricing-packaging-roadmap.md`**.  
Tento soubor popisuje **technickou architekturu** v kódu.

---

## Veřejné placené plány (pricing / Stripe)

Pouze tři produkty v ceníku a checkoutu:

| Veřejný plán | `publicPlanKey` | Interní tier (Stripe / DB) |
|--------------|-----------------|----------------------------|
| Start        | `start`         | `starter`                  |
| Pro          | `pro`           | `pro`                      |
| Management   | `management`    | `team`                     |

Interní hodnota **`team`** zůstává kvůli zpětné kompatibilitě (env `STRIPE_PRICE_TEAM_*`, metadata checkoutu, parsování `subscriptions.plan`).

**Veřejné labely** pro zobrazení: `getPublicPlanLabelFromTier` / `PUBLIC_DISPLAY_TITLE_BY_TIER` v `plan-catalog.ts`. Checkout metadata (`planLabelCs` v `price-catalog.ts`) používá tyto labely; interní `PlanTier` se nemění.

---

## Speciální access režimy (nejsou veřejné tiery)

Definované jako `SpecialAccessMode` / `EffectiveAccessSource` v `plan-catalog.ts`:

| Režim | Konstanta / zdroj | Účel |
|-------|-------------------|------|
| Interní admin | `internal_admin` | Plný přístup (allowlist env), není v pricing gridu. |
| Workspace trial | `trial` | 14 dní, capability + limity jako **Pro**; metadata na `tenants`. |
| Po vypršení / bez plánu | `restricted` | Konzervativní `RESTRICTED_CAPABILITIES` — příprava na paywall Fáze 2; **data se nemažou**. |

**Stripe checkout trial** (dny u ceny, `getTrialPeriodDays`) je **oddělený** od **workspace trial** (`trial_*` na `tenants`).

---

## `EffectiveAccessContext` (výstup resolveru)

Async: `resolveEffectiveAccessContext` (`resolve-effective-access.ts`).  
Pure: `computeEffectiveAccessContext` (`access-resolution.ts`).

Minimální pole (aktuální typ v `plan-catalog.ts`):

| Pole | Typ | Poznámka |
|------|-----|----------|
| `source` | `EffectiveAccessSource` | `internal_admin` \| `subscription` \| `trial` \| `restricted` |
| `publicPlanKey` | `PublicPlanKey \| null` | U předplatného podle tieru; u admina často `null` |
| `internalTier` | `PlanTier \| null` | `starter` / `pro` / `team` když řídí tier subscription |
| `capabilities` | `PlanCapabilities` | Granulární boolean matrix |
| `limits` | `EffectiveLimits` | `{ bypass: true }` nebo `{ bypass: false, limits: PlanLimits }` |
| `trialInfo` | `TrialInfo \| null` | Workspace trial metadata + `daysRemaining` |
| `isBypassed` | `boolean` | Interní admin (limity neplatí) |
| `isTrial` | `boolean` | `source === "trial"` |
| `isRestricted` | `boolean` | `source === "restricted"` |

### Precedence (pořadí vyhodnocení)

1. **internal admin** — `AIDV_INTERNAL_ADMIN_EMAILS` / `AIDV_INTERNAL_ADMIN_USER_IDS` → `getInternalAdminCapabilities()`, `getInternalAdminLimits()` (`bypass: true`).
2. **Aktivní předplatné** — `getSubscriptionState`: `active` / `trialing` / `past_due` v grace → tier z `subscriptions.plan` přes `tryParseInternalTierFromStoredPlan` (fallback tier `pro` pokud parsování selže).
3. **Aktivní workspace trial** — `trial_ends_at > now` a `trial_converted_at` je NULL → stejné jako **Pro** (`getTrialPlanDefinition()`).
4. **restricted** — `getRestrictedCapabilities()` / `getRestrictedLimits()`.

---

## Source of truth (soubory)

| Oblast | Soubor |
|--------|--------|
| Katalog plánů, matrix, limity, default tenant settings, trial/admin/restricted helpery | `apps/web/src/lib/billing/plan-catalog.ts` |
| Pure resoluce | `apps/web/src/lib/billing/access-resolution.ts` |
| Async resoluce + DB | `apps/web/src/lib/billing/resolve-effective-access.ts` |
| Interní admin allowlist | `apps/web/src/lib/billing/internal-admin.ts` |
| DB subscription row | `apps/web/src/lib/billing/subscription-state.ts` |
| Stripe ceny, `planLabelCs` | `apps/web/src/lib/stripe/price-catalog.ts` |
| `SubscriptionState`, `WorkspaceBillingSnapshot` | `apps/web/src/lib/stripe/billing-types.ts` |
| Hrubé entitlements (stávající flow, Fáze 2 granular) | `apps/web/src/lib/entitlements.ts` |

### `shouldBypassPlanLimits` — dvě rozhraní

- **`plan-catalog.ts`:** `shouldBypassPlanLimits(limits: EffectiveLimits)` — čistá funkce na objekt limitů.
- **`entitlements.ts`:** `shouldBypassPlanLimits({ tenantId, userId, email })` — async, použije `resolveEffectiveAccessContext` a vrátí `ctx.isBypassed` (vhodné pro quota vrstvu).

Exporty z `entitlements.ts` mimo jiné: `resolveEffectiveAccessContext`, `computeEffectiveAccessContext`, `getEffectiveAccessContextForTenant`, `isInternalAdminUser`.

---

## Trial — persistence

Migrace: `packages/db/migrations/tenant_trial_billing_2026-04-11.sql`  
Sloupce: `trial_started_at`, `trial_ends_at`, `trial_plan_key` (např. `pro`), `trial_converted_at`.

- Nový workspace: `ensure-workspace.ts` nastaví 14 dní a `DEFAULT_TRIAL_PLAN` (`pro`).
- Po Stripe syncu: `markTenantTrialConverted` v `subscription-sync.ts` (volá webhook).

Helpery trialu (v `plan-catalog.ts`): `getTrialPlanDefinition`, `getTrialDurationDays`, `isTrialActive`, `getTrialEndsAt`, `getDaysRemainingInTrial`.

---

## Co je hotové ve fázi 0–1

- Oddělení veřejných názvů, interních tierů, special modes a capability/limits katalogu.
- `EffectiveAccessContext` jako základ pro další enforcement.
- Billing UI: tři veřejné tiery v pickeru; labely Start / Pro / Management; workspace trial badge; interní admin badge kde je napojeno (např. profil).
- Bez masivního přepisu všech route guardů — `resolveEntitlements` zůstává pro stávající flow.

## Fáze 2 (odloženo)

- Granulární enforcement podle `PlanCapabilities` + tenant overrides.
- Sync `tenant_settings` z plánových defaultů; rozšíření `SETTINGS_REGISTRY` dle `FUTURE_TENANT_SETTING_KEYS`.
- Quota / usage; plný paywall pro `restricted`.
- Případný přesun admin allowlistu do DB.

## Limity

`PlanLimits` v katalogu jsou **konfigurační** (enforcement až později).  
`EffectiveLimits.bypass === true` = žádné číselné limity (interní admin).
