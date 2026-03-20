# Aidvisora Mobile Wave 3 Baseline and Gap

## Reuse map (source of truth)

- Business Plan
  - `actions/business-plan.ts`: `getActivePlan`, `getPlanProgress`, `createBusinessPlan`, `setPlanTargets`, `getVisionGoals`, `upsertVisionGoals`
  - `lib/business-plan/*`: period math, metric helpers, progress/recommendations
- Team Overview
  - `actions/team-overview.ts`: KPI, member metrics, alerts, hierarchy
  - `actions/team-events.ts`: `createTeamEvent`, `createTeamTask`
- Settings/Profile
  - `actions/auth.ts`: `updatePortalProfile`, `updatePortalPassword`, `listSupervisorOptions`
  - `actions/preferences.ts`: avatar, notification prefs, quick actions, report branding
- Notifications/Inbox
  - `actions/messages.ts`: `getConversationsList`, `getUnreadConversationsCount`, `markMessagesRead`
  - `actions/notification-log.ts`: `getNotificationLog`, `getNotificationBadgeCount`

## Gaps addressed in Wave 3

- Mobile subview routing added for:
  - `/portal/business-plan`
  - `/portal/team-overview` (including nested detail paths fallback)
  - `/portal/setup` and `/portal/profile`
  - `/portal/notifications`
- Wave 3 primitives added for KPI, team cards, AI insight, notifications list items, settings groups.
- Notification badge logic moved into mobile shell with inbox + log aggregation.

## Parity checklist (Wave 3)

| Module | Loading | Empty | Error | Permission | Conflict/Retry | Mutation feedback |
|---|---|---|---|---|---|---|
| Business Plan | yes | yes | yes | via existing actions | retry via save rerun | sheet save feedback |
| Team Overview | yes | yes | yes | role-gated actions | retry reload | team task/event feedback |
| Settings/Profile | yes | yes | yes | action guards in auth/preferences | retry + inline error | success/error feedback |
| Notifications/Inbox | yes | yes | yes | contacts/read permission | retry reload | mark-read feedback |

## Known limitations

- Advisor notification log is audit-oriented and does not provide per-item unread/delete mutation.
- Team member deep detail route currently maps to team overview mobile screen (detail-specific mobile sheet can be extended in next iteration).
