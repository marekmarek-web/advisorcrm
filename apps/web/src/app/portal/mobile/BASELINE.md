# Mobile V1 Baseline (Advisor Portal)

This document locks the baseline for the first production mobile wave (`mobile_ui_v1`) and maps what is reused, refactored, or replaced.

## Scope (Wave 1)

- Dashboard (`/portal/today`)
- Tasks (`/portal/tasks`)
- Contacts (`/portal/contacts` + contact detail entry)
- Pipeline (`/portal/pipeline`)
- Menu hub (entry points to secondary modules)

## Reuse vs Refactor vs Replace

- **Reuse (domain/data layer)**
  - `apps/web/src/app/actions/dashboard.ts`
  - `apps/web/src/app/actions/tasks.ts`
  - `apps/web/src/app/actions/contacts.ts`
  - `apps/web/src/app/actions/pipeline.ts`
  - Existing auth + permission guards in actions (`requireAuthInAction`, `hasPermission`)

- **Refactor (presentation and interaction)**
  - Replace desktop-first shell behavior on mobile with dedicated app shell.
  - Replace dense/hover-first interactions with touch-first cards, sheets, sticky actions.
  - Convert pipeline from board-dominant mobile experience to stage/list-first flow.

- **Replace (for mobile wave)**
  - Mobile rendering path under `apps/web/src/app/portal/mobile/*` routed by feature flag.
  - Shared mobile primitives under `apps/web/src/app/shared/mobile-ui/*`.

## Parity Checklist (Wave 1)

Each module must keep:

- **Data truth parity**: same server actions and tenant-scoped data as desktop.
- **State coverage**: loading, empty, error, permission denied fallback.
- **Mutation coverage**:
  - Tasks: create/update/complete/reopen/delete.
  - Pipeline: create/move/update/delete.
  - Contacts: read/search/filter + deep-link to detail route.
- **Navigation parity**:
  - bottom nav for primary sections
  - back navigation for subviews
  - deep-link compatibility with existing `/portal/*` routes.

## Explicit Non-Goals in Wave 1

- No desktop replacement.
- No domain duplication (mobile must call existing actions).
- No breaking route changes for current desktop users.
