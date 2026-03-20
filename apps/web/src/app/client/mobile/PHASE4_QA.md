# Aidvisora Mobile Wave 4 QA Matrix

## Functional checks

| Scenario | Expected |
|---|---|
| Mobile + beta cookie on `/client` | renders `ClientMobileApp` shell |
| Desktop or beta off | renders existing desktop client shell |
| `/client/messages` deep-link | messages view opens, unread advisor messages are marked/read and badge refreshes |
| Send message with attachments | message persists, optional files upload via `sendMessageWithAttachments` |
| `/client/documents` upload | file uploads with `uploadSource`, list refreshes |
| `/client/requests` create | new request appears in list with status label |
| `/client/profile` save profile | `clientUpdateProfile` persists values |
| Add household member | client household refreshes after success |
| `/client/notifications` mark-read | unread badge decreases and item state updates |
| `/client/portfolio` | contract list renders card-first mobile view |

## State coverage

- Loading: route loads and mutation refreshes.
- Empty: no messages, no docs, no requests, no notifications, empty household.
- Error: all mutation/load failures surface in `ErrorState` or inline error.
- Permission: all sensitive actions rely on existing server action guards.
- Retry: route-level refresh/reload paths are available.

## Regression smoke

- Advisor mobile shell behavior unchanged under `/portal`.
- Client desktop shell remains unchanged for non-mobile or beta-off.
- Existing API download routes still used for documents/message attachments.

## Rollout sequence (unchanged)

1. Internal beta (`mobile_ui_v1_beta=1`)
2. Selected clients/advisors
3. Wider beta under same `mobile_ui_v1` mode
