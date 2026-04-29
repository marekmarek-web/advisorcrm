# Push notifications — truth of record (2026-04-23, unified FCM)

**Architektura v1.0 / v1.1:** FCM (Firebase Cloud Messaging HTTP v1) pro **obě platformy**.

- **iOS:** zapnuto. Klient i server mluví FCM; APNs funguje jen jako transport mezi Applem a Firebase (APNs P8 se uploaduje **do Firebase console**, NE do Vercel env).
- **Android:** v1.0 gated v `usePushNotifications.ts` (`isSupportedPlatform = platform === "ios"`) dokud nepropadne `apps/web/android/app/google-services.json`. Server side FCM cesta je identická, takže pro v1.1 stačí přidat `google-services.json` a shodit gate.

**Token shape:** klient ukládá FCM registration token (ne APNs device token, ne Firebase JWT) do `localStorage["aidvisor.push.token"]` a do `/api/push/devices`. Backend (`apps/web/src/lib/push/send.ts`) posílá `messages:send` na `https://fcm.googleapis.com/v1/projects/<project_id>/messages:send` s OAuth2 bearer tokenem z service accountu.

> **Historie:** do 2026-04-22 runbook tvrdil, že backend spotřebovává `APNS_*` env s P8 klíčem. To **neplatí**. Jediná APNs P8 existence je v Firebase console → iOS apps → Cloud Messaging → APNs Authentication Key (pro APNs → FCM relay). Backend žádné `APNS_*` env nečte.

---

## iOS — povinné kroky před TestFlight buildem

### 1. Firebase project + iOS app

1. [console.firebase.google.com](https://console.firebase.google.com) → project `Aidvisora Mobile` (nebo stávající).
2. Add app → iOS → Bundle ID `cz.aidvisora.app`.
3. Stáhnout `GoogleService-Info.plist` → umístit do `apps/web/ios/App/App/GoogleService-Info.plist`.
4. **NEtrackovat v gitu** (`.gitignore` to už drží). Distribuce přes CI secret `GOOGLE_SERVICE_INFO_PLIST_B64` (base64 plistu).
5. Ve Xcode target `App` se plist musí objevit v **Copy Bundle Resources**. `pnpm --filter web cap:sync:ios` + otevřít Xcode po doplnění.

### 2. APNs P8 → Firebase console

1. [developer.apple.com/account/resources/authkeys/list](https://developer.apple.com/account/resources/authkeys/list) → **+** → "Aidvisora APNs Auth Key".
2. Zaškrtnout **Apple Push Notifications service (APNs)** → Register → Download P8 (jen jednou, ulož do 1Password „Aidvisora / Apple").
3. Poznač **Key ID** (10 znaků) a **Team ID** (vpravo nahoře v Apple Developer portalu).
4. Firebase console → Project Settings → **Cloud Messaging** → sekce **Apple app configuration** → **APNs Authentication Key** → **Upload**.
   - Upload P8, vyplň Key ID + Team ID.
   - Potvrzení: „APNs Authentication Key uploaded".
5. **Žádný APNs klíč se nenahrává do Vercelu.** Starší env `APNS_AUTH_KEY` / `APNS_KEY_ID` / `APNS_TEAM_ID` / `APNS_BUNDLE_ID` / `APNS_ENVIRONMENT` v produkci **být nesmí** — pokud existují, smaž je (`vercel env rm APNS_...`).

### 3. AppDelegate + entitlements (stav repa)

- `apps/web/ios/App/App/AppDelegate.swift` volá `FirebaseApp.configure()` **jako první věc v** `application(_:didFinishLaunchingWithOptions:)` (ne v `AppDelegate.init()` — kvůli pořadí s `UIApplication.shared.delegate` a Firebase AppDelegate Swizzleru). Platí jen při přítomnosti `GoogleService-Info.plist` v bundle.
- `App.release.entitlements` má `aps-environment = production`, `App.entitlements` `development`.
- `Info.plist` `UIBackgroundModes` obsahuje `remote-notification`.
- Xcode → target `App` → Signing & Capabilities → **Push Notifications** capability musí být přidaná (pokud chybí, **+ Capability** → Push Notifications; Automatic Signing pak propaguje do provisioning profilu sama).

### 4. Backend env (Vercel production)

Jediné povinné env pro push sender:

```
FCM_SERVICE_ACCOUNT_JSON=<celý JSON service accountu; uvozovky escapované>
```

Získání:
1. Firebase console → Project Settings → **Service accounts** → **Generate new private key** → stáhne JSON.
2. V Vercelu: `vercel env add FCM_SERVICE_ACCOUNT_JSON production` a paste celý JSON jako plain text (Vercel to drží jako single secret).
3. Redeploy production, aby env byla propagována.

Volitelné ops:

```
PUSH_KILL_SWITCH=0|1      # 1/true/on = backend přestane volat FCM (bez redeploy)
```

### 5. Pre-build assertion

Před Xcode Archive / `./gradlew assembleRelease` běží fail-fast kontrola (volaná i z `cap-smoke.sh`):

```bash
node apps/web/scripts/assert-fcm-config.mjs                  # dev (missing → WARN)
node apps/web/scripts/assert-fcm-config.mjs --require-release # CI (missing → FAIL)
node apps/web/scripts/assert-fcm-config.mjs --platform=ios   # jen iOS větev
```

Ověřuje existenci a tvar `GoogleService-Info.plist` + `google-services.json`.

### 6. Runtime smoke (fyzický iPhone, TestFlight build)

Viz [`docs/ios/push-smoke-checklist.md`](ios/push-smoke-checklist.md) — minimální checklist, který musí projít před klikem **Submit for Review**.

---

## Android — co udělat pro v1.1 (v1.0 záměrně NE)

1. [console.firebase.google.com](https://console.firebase.google.com) → přidat Android app: package `cz.aidvisora.app`.
2. Stáhnout `google-services.json` → `apps/web/android/app/google-services.json` (mimo git, CI secret `GOOGLE_SERVICES_JSON_B64`).
3. V `apps/web/src/lib/push/usePushNotifications.ts` změnit:
   ```ts
   const isSupportedPlatform = platform === "ios" || platform === "android";
   ```
4. `pnpm cap:sync android` → rebuild AAB → Internal testing.
5. Zahrnout Android push do smoke checklistu ([`docs/ios/push-smoke-checklist.md`](ios/push-smoke-checklist.md) → varianta Android).

Backend se **neupravuje** — tatáž FCM cesta pro Android, tentýž `FCM_SERVICE_ACCOUNT_JSON`.

---

## Troubleshooting (FCM HTTP v1 error → co to znamená)

Klasifikace je přesně definovaná v `apps/web/src/lib/push/send.ts` (`classifyFcmError`).

| FCM error body | Klasifikace | Co backend udělá | Ruční akce |
|---|---|---|---|
| `UNREGISTERED` / `"status": "NOT_FOUND"` | **token_dead** | Revokuje `user_devices` row (`revokedAt = now()`). | Nic; klient si při dalším spuštění vyžádá nový token. |
| `INVALID_ARGUMENT` | **config** | **NErevokuje** device. Sentry `push.fcm.config_error`. | Zkontroluj, že klient posílá FCM token, ne APNs device token. Historicky to byl bug, který tiše mazal iOS řádky. |
| `SENDER_ID_MISMATCH` | **config** | NErevokuje. Sentry alert. | `FCM_SERVICE_ACCOUNT_JSON.project_id` neodpovídá Firebase projektu, ze kterého klient vzal token. Musí být stejný project pro `GoogleService-Info.plist` + service account. |
| `THIRD_PARTY_AUTH_ERROR` | **config** | NErevokuje. | APNs klíč ve Firebase console expiroval / chybí / nesouhlasí Team ID. Reupload P8. |
| `QUOTA_EXCEEDED` / `UNAVAILABLE` / `INTERNAL` | **transient** | Retry 1×, pak failed (bez revoke). | Pokud perzistuje, Google status page. |

Další běžné problémy:

- **iOS: `no valid "aps-environment" entitlement`** → Push Notifications capability chybí v Xcode Signing & Capabilities. Přidat.
- **iOS: klient hodí „Push nelze aktivovat (Firebase není nakonfigurován)"** → chybí `GoogleService-Info.plist` v bundle, nebo `FirebaseApp.configure()` nezavolán. Zkontroluj `assert-fcm-config.mjs` + build log.
- **iOS: notifikace nechodí, backend říká `sent`** → Focus mode / Settings → Notifications → Aidvisora silenced / DoNotDisturb. Není to bug.
- **iOS: BadDeviceToken** — už se **nepozná** na backendu, protože backend APNs přímo nekontaktuje. Pokud to vidíš v Firebase logu, znamená to, že APNs P8 ve Firebase console je sandbox-only a ty střílíš production token (nebo naopak). P8 pokrývá OBĚ (sandbox + production), takže reupload se správným Team ID.

---

## Ops kill-switch

Pokud backend začne propagovat špatné tokeny nebo řeší incident:

```bash
vercel env add PUSH_KILL_SWITCH production   # hodnota: 1
# žádný redeploy není potřeba — funkce to čte z process.env při každém requestu
```

Po obnovení nastav na `0` nebo smaž proměnnou.

---

## Zkrácený link-graph

- Klient: [`apps/web/src/lib/push/usePushNotifications.ts`](../apps/web/src/lib/push/usePushNotifications.ts) (FCM token path).
- Backend sender: [`apps/web/src/lib/push/send.ts`](../apps/web/src/lib/push/send.ts) (FCM HTTP v1).
- Routing + validation: [`apps/web/src/lib/push/routing.ts`](../apps/web/src/lib/push/routing.ts), [`apps/web/src/lib/security/validation.ts`](../apps/web/src/lib/security/validation.ts).
- Pre-build assert: [`apps/web/scripts/assert-fcm-config.mjs`](../apps/web/scripts/assert-fcm-config.mjs).
- Smoke: [`apps/web/scripts/cap-smoke.sh`](../apps/web/scripts/cap-smoke.sh), [`docs/ios/push-smoke-checklist.md`](ios/push-smoke-checklist.md).
- Store pack: [`docs/launch/store-submission-launch-ops-pack-2026-04-23.md`](launch/store-submission-launch-ops-pack-2026-04-23.md) §IV.E.
- Privacy: [`docs/legal/app-store-privacy-labels.md`](legal/app-store-privacy-labels.md), [`docs/legal/dpa-register.md`](legal/dpa-register.md) řádky 8–9.
