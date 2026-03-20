# Aidvisora Mobile Wave 3 QA Matrix

## Scope

- `BusinessPlanScreen`
- `TeamOverviewScreen`
- `SettingsProfileScreen`
- `NotificationsInboxScreen`
- `MobilePortalClient` wave routing and notification badge orchestration

## Functional matrix

| Scenario | Expected result |
|---|---|
| `/portal/business-plan` with existing active plan | KPI cards + recommendations render with current period |
| `/portal/business-plan` without active plan | empty state + target setup flow works |
| Save targets in Business Plan | targets persist and metrics reload |
| Save vision goals | goals persist and reload after sheet close |
| `/portal/team-overview` for allowed role | KPI/member/alerts load and team action creates event/task |
| `/portal/team-overview` for disallowed role | action-level forbidden error is surfaced in mobile error state |
| `/portal/setup` or `/portal/profile` | profile/settings sections load and mutations persist |
| Change password in settings | validates confirmation, updates via server action |
| `/portal/notifications` inbox tab | unread conversations listed and mark-read decreases unread |
| `/portal/notifications` log tab | notification log renders status badges |
| Header bell badge | reflects unread conversations + notification log badge count |

## State coverage

- Loading: initial loads and post-mutation refreshes
- Empty: no plan, no members, no notifications/inbox
- Error: all screens expose `ErrorState` with retry
- Permission: delegated to server actions (`Forbidden` bubble to UI state)
- Retry: available on top-level screen error states

## Regression smoke

- Mobile tabs still work: Dashboard, Tasks, Clients, Pipeline, Menu
- Wave 2 subviews still open/close correctly and back navigation remains consistent
- Feature flag behavior unchanged (`mobile_ui_v1` beta)

## Rollout

1. Internal beta (`mobile_ui_v1_beta=true`) with advisor/admin accounts
2. Selected advisor cohort
3. Broader beta while monitoring mutation errors and permission denials
