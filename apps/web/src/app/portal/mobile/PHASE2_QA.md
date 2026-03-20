# Aidvisora Mobile Wave 2 QA and Rollout

## Regression smoke (executed)

- `ReadLints` on changed mobile files: no new IDE diagnostics.
- TypeScript workspace check (`pnpm --filter web exec tsc --noEmit`):
  - fails in pre-existing test files outside Wave 2 scope:
    - `src/lib/ai/__tests__/context-rendering.test.ts`
    - `src/lib/ai/__tests__/team-eval-fixtures.ts`
    - `src/lib/analyses/financial/__tests__/calculations.test.ts`

## Wave 2 matrix

| Area | Scenario | Result |
|---|---|---|
| Client Profile | empty relations/tasks/docs | handled via `EmptyState` |
| Client Profile | populated relations + quick actions | implemented |
| Household | multi-member list + remove | implemented |
| Household | add member via sheet | implemented |
| AI Contracts | upload, queue, detail | implemented |
| AI Contracts | approve/reject/apply | implemented |
| AI Contracts | failed processing fallback | implemented (re-upload retry path) |
| Analyses | list, filter, create draft | implemented |
| Analyses | detail status transitions | implemented |
| Calculators | investment/mortgage/pension/life core flow | implemented |
| Calculators | CTA bridge to tasks/opportunities/analyses | implemented |

## Rollout strategy

- Mobile Wave 2 remains behind existing `mobile_ui_v1` beta gate.
- Recommended staged rollout:
  1. internal team QA on beta cookie,
  2. selected advisors in beta,
  3. broader rollout after monitoring API errors for contracts/analyses flows.
