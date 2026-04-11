# Pricing / plány — regression checklist (Fáze 7)

Účel: ruční smoke pass před releasem a mapování na **automatizované testy** v `apps/web/src/lib/billing/__tests__/`.

Související dokumentace: `docs/pricing-packaging-roadmap.md`, `docs/billing-plan-architecture.md`, `docs/website-positioning-backlog.md`.

---

## 1) Automatizované testy (spouštět v CI / lokálně)

```bash
pnpm --filter web exec vitest run src/lib/billing/__tests__/
pnpm --filter web exec tsc --noEmit
pnpm --filter web lint
pnpm --filter web build
```

| Soubor | Co pokrývá |
|--------|------------|
| `pricing-phase7-regression.test.ts` | Veřejné labely, mapování Team→Management, trial 14 dní, effective access (Start/Pro/Management/trial/admin/restricted), capability matrix, upgrade CTA detail, quota bypass |
| `plan-access-phase4.test.ts` | Capability gating (Start vs Pro vs Management, trial=Pro, admin) |
| `plan-phase2-granular-entitlements.test.ts` | Plan defaults / tenant overrides |
| `public-pricing.test.ts` | Ceny 990/1990/3490, roční −20 % |
| `subscription-usage-quota.test.ts` | `computeRemainingQuota`, `QuotaExceededError` |

**Fixtures (bez DB):** `apps/web/src/lib/billing/__tests__/fixtures/pricing-plan-fixtures.ts`

---

## 2) Ruční checklist — pricing a labely

- [ ] **Workspace billing** (`WorkspaceStripeBilling`): tři tarify Start / Pro / Management; ceny odpovídají `public-pricing.ts`.
- [ ] **Landing** (`PremiumLandingPage` #cenik): jen tři sloupce; žádný samostatný „Admin“ tarif.
- [ ] **Stripe checkout** metadata: `planLabelCs` / popisky používají `getPublicPlanLabelFromTier` (Start, Pro, Management).
- [ ] **Uložený plán v DB** (`formatStoredSubscriptionPlanLabel`): zobrazení **Management** místo starého „Team“ v textu.

---

## 3) Effective access context

- [ ] **Pořadí zdrojů:** internal admin → aktivní předplatné → aktivní workspace trial → restricted (`billing-plan-architecture.md`).
- [ ] **Trial:** `source === "trial"`, limity jako Pro (`getTrialPlanDefinition()`).
- [ ] **Restricted:** po vypršení trialu bez předplatného; `isRestricted === true`.

---

## 4) Capability matrix (guard logika)

| Scénář | Očekávání |
|--------|-----------|
| Start | `ai_review` false; `client_portal_messaging` false; `google_calendar` true |
| Pro | `ai_review` true; messaging + service requests true |
| Management | `team_overview`, `team_production`, `reports_advanced` true |
| Internal admin | všechny klíče true (`getInternalAdminCapabilities`) |
| Restricted | konzervativní matice (`getRestrictedCapabilities`) |

---

## 5) Quota foundations

- [ ] Start: `aiReviewPagesPerMonth === 0` v katalogu.
- [ ] Internal admin: `EffectiveLimits.bypass === true` → `computeRemainingQuota` vrací `bypassed: true`.
- [ ] End-to-end **spotřeba v DB** není v tomto checklistu — vyžaduje integrační test nebo staging.

---

## 6) Locked states / upgrade CTA

- [ ] API odpovědi 403 s JSON `planAccess` / `quota` (`plan-access-http.ts`) pro blokované akce.
- [ ] `PlanAccessError.detail` obsahuje `upgradeTargetSuggestion` / labely pro UI (`plan-access-errors.ts`).
- [ ] Ne všechny routy musejí být guardované — viz **Known gaps**.

---

## 7) Trial a admin override

- [ ] **Trial badge:** text 14denní trial + úroveň Pro (`ACCESS_MODE_UI_LABEL`, billing UI).
- [ ] **Admin:** badge „Admin access“, nikoli veřejný tarif (`WorkspaceStripeBilling`, profil).
- [ ] **ensure-workspace:** nový tenant dostane trial podle `TRIAL_DURATION_DAYS` a `DEFAULT_TRIAL_PLAN`.

---

## 8) Restricted a data

- [ ] **Produktová politika:** po přechodu na restricted se data **nemažou** automaticky (enforcement paywallu je Fáze 2+).
- [ ] Automatický test ověřuje jen **konzervativní capabilities** u `restricted`, ne mazání v DB.

---

## 9) Known gaps (otevřené / follow-up)

| Gap | Poznámka |
|-----|----------|
| Ne všechny API routy mají capability guard | Část starších endpointů může spoléhat na `entitlements` / role — průběžně doplňovat dle Fáze 4. |
| E2E proti reálné DB + Stripe | Unit testy nepokrývají webhook, portal, checkout end-to-end. |
| UI parsování `planAccess` v klientovi | Jednotné upgrade modaly napříč portálem nejsou všechny napojené. |
| Restricted UX | Plný paywall a messaging pro uživatele ve `restricted` může být rozšířen později. |
| Flaky CI | Pokud se objeví flaky testy závislé na čase, sjednotit `now` v testech (fixní `Date`). |

---

## 10) Test matrix (shrnutí)

| Režim | Zdroj pravdy v testech |
|-------|-------------------------|
| Start | `PAID_SUBSCRIPTION_START` + `computeEffectiveAccessContext` |
| Pro | `PAID_SUBSCRIPTION_PRO` |
| Management | `PAID_SUBSCRIPTION_MANAGEMENT` |
| Trial | `trialWorkspaceNew()` + inactive subscription |
| Internal admin | `isInternalAdmin: true` |
| Restricted | `trialWorkspaceExpired()` + inactive subscription |
