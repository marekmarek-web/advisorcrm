# Aidvisora Mobile Wave 4 Baseline and Gap

## Scope delivered

- Client mobile-first parity under existing `mobile_ui_v1` beta gating.
- Cross-portal unread/badge orchestration for client notifications and advisor messages.
- Reuse existing server actions/API as source of truth.

## Reuse map

- Shell and routing entry:
  - `client/layout.tsx` (now conditionally renders mobile shell for mobile+beta).
  - `client/mobile/ClientMobileApp.tsx`, `client/mobile/ClientMobileClient.tsx`.
- Reused actions:
  - `actions/client-dashboard.ts`
  - `actions/client-portal-requests.ts`
  - `actions/contracts.ts`
  - `actions/documents.ts`
  - `actions/messages.ts`
  - `actions/portal-notifications.ts`
  - `actions/contacts.ts`
  - `actions/households.ts`
- Reused API download routes:
  - `/api/documents/[id]/download`
  - `/api/messages/attachments/[id]/download`

## Gap closures (Wave 4)

- Added dedicated mobile client shell and tab/subview behavior for:
  - `/client`
  - `/client/messages`
  - `/client/documents`
  - `/client/requests`
  - `/client/profile`
  - `/client/portfolio` + `/client/contracts`
  - `/client/notifications`
- Added client-focused shared primitives to `shared/mobile-ui/primitives.tsx`:
  - `ChatMessageBubble`
  - `MobileDocumentItem`
  - `RequestStatusCard`
  - `ProfileFieldRow`
- Added client unread message badge source:
  - `getUnreadAdvisorMessagesForClientCount()` in `actions/messages.ts`.
- Added `uploadSource` handling for client upload in `actions/documents.ts`.

## State and guard parity checklist

| Area | Loading | Empty | Error | Permission | Retry/feedback |
|---|---|---|---|---|---|
| Dashboard | yes | yes | yes | action guards | yes |
| Messages | yes | yes | yes | contact ownership checks | yes |
| Documents | yes | yes | yes | client ownership + visibility | yes |
| Requests | yes | yes | yes | `client_zone:request_create` guard | yes |
| Profile/Household | yes | yes | yes | client-only profile/household actions | yes |
| Notifications | yes | yes | yes | client-only notification actions | yes |

## Known follow-up candidates

- Dedicated per-message attachment preview list in mobile chat.
- Optional split of `ClientMobileClient` into per-screen files for finer chunking.
