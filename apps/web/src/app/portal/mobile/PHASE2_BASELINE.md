# Aidvisora Mobile Wave 2 Baseline and Gap

## Reuse map (server/domain source of truth)

- Client Profile
  - `actions/contacts.ts`: `getContact`
  - `actions/tasks.ts`: `getTasksByContactId`
  - `actions/pipeline.ts`: `getPipelineByContact`
  - `actions/documents.ts`: `getDocumentsForContact`
  - `actions/households.ts`: `getHouseholdForContact`
- Household
  - `actions/households.ts`: `getHousehold`, `addHouseholdMember`, `removeHouseholdMember`
  - `actions/pipeline.ts`: `getOpportunitiesByHousehold`
  - `actions/financial-analyses.ts`: `getFinancialAnalysesForHousehold`
- AI Contracts and Documents
  - API routes: `/api/contracts/review`, `/api/contracts/review/[id]`, `/api/contracts/upload`
  - `actions/contract-review.ts`: approve/reject/apply + client match decisions
- Analyses
  - `actions/financial-analyses.ts`: list, detail, create draft, set status
- Calculators
  - `lib/calculators/*`: engines for investment/mortgage/pension/life
  - CTA bridge to CRM mutations remains in mobile shell (`createTask`, `createOpportunity`)

## Mobile gaps resolved in Wave 2

- Added deep-link compatible subview rendering for:
  - `/portal/contacts/[id]`
  - `/portal/households/[id]`
  - `/portal/contracts/review` and `/portal/contracts/review/[id]`
  - `/portal/analyses` and analysis detail by query param (`id`)
  - `/portal/calculators` and `/portal/calculators/[slug]`
- Added Wave 2 primitives for CRM summary, household cards, document states, analyses cards, calculator cards and CTA cards.
- Added dedicated mobile screens for each Wave 2 domain module while keeping desktop routes unchanged.

## Parity checklist (Wave 2)

| Module | Loading | Empty | Error | Permission/Forbidden | Conflict/Retry | Mutation feedback |
|---|---|---|---|---|---|---|
| Client Profile | yes | yes | yes | inherited from actions | n/a | task/opportunity create entry |
| Household | yes | yes | yes | inherited from actions | n/a | add/remove member with reload |
| AI Contracts/Documents | yes | yes | yes | API 401/403 surfaced | upload retry via re-upload | approve/reject/apply feedback |
| Analyses | yes | yes | yes | inherited from actions | n/a | create/status update feedback |
| Calculators | local instant | n/a | n/a | n/a | input correction by user | CTA bridge to task/opportunity/analyses |

## Remaining known limitations

- AI contract retry is technically implemented as re-upload because backend route does not expose explicit reprocess endpoint.
- Analyses detail uses a focused mobile detail layer (status/progress workflow) and keeps advanced multi-step desktop editor outside Wave 2 scope.
