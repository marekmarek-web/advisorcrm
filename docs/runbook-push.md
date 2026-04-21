# Push notifications — setup pro v1.0

v1.0 scope:

- **iOS:** zapnuto (APNs).
- **Android:** vypnuto (hook pro Android vrací `isSupported = false`, viz [`usePushNotifications.ts`](../apps/web/src/lib/push/usePushNotifications.ts) řádky ~77–82).

v1.1+ plán: Firebase + FCM pro Android.

## iOS (povinné před TestFlight buildem)

### 1. Vygenerovat APNs Auth Key (P8)

1. [https://developer.apple.com/account/resources/authkeys/list](https://developer.apple.com/account/resources/authkeys/list) → **+**.
2. Název: "Aidvisora APNs Auth Key".
3. Zaškrtnout **Apple Push Notifications service (APNs)**.
4. Register → **Download** P8 (jen jednou!). Ulož do 1Password (nebo jinam mimo git).
5. Poznač **Key ID** (10 znaků, sloupec v tabulce po uložení).
6. Poznač **Team ID** (vpravo nahoře v portálu).

### 2. Upload do push backendu

Aidvisora má `/api/push/devices` a custom push sender backend. Ověř, která proměnná prostředí obsahuje APNs key — typicky:

- `APNS_AUTH_KEY` = obsah P8 souboru (včetně `-----BEGIN PRIVATE KEY-----`).
- `APNS_KEY_ID` = z kroku 1.5.
- `APNS_TEAM_ID` = z kroku 1.6.
- `APNS_BUNDLE_ID` = `cz.aidvisora.app`.
- `APNS_ENVIRONMENT` = `production`.

Nastav v:

- **Vercel prod env** (`vercel env add APNS_…` nebo přes dashboard → Settings → Environment Variables → Production).
- Po přidání proveď redeploy production deploymentu, aby env byly propagovány.

Pokud se používá jiný sender (např. Supabase Functions / vlastní server), nastav ekvivalentní proměnné tam.

### 3. Entitlements

Verifikované v repu — nic se nemění:

- [`apps/web/ios/App/App/App.release.entitlements`](../apps/web/ios/App/App/App.release.entitlements) má `aps-environment = production`.
- [`apps/web/ios/App/App/App.entitlements`](../apps/web/ios/App/App/App.entitlements) má `aps-environment = development` (pro dev build).
- `UIBackgroundModes` v [`Info.plist`](../apps/web/ios/App/App/Info.plist) obsahuje `remote-notification`.

### 4. Provisioning profil

- Při Automatic Signing v Xcode se Push capability propaguje do profilu automaticky.
- Ověř: Xcode → target `App` → Signing & Capabilities → sekce **Push Notifications** je přidaná (jinak klikni **+ Capability** → Push Notifications).

### 5. TestFlight smoke test

1. Na fyzickém iPhonu pokud je to první install, OS zobrazí dialog "Aidvisora by chtěla zasílat upozornění" → povolit.
2. V aplikaci musí v `localStorage` přibýt klíč `aidvisor.push.token` (hex APNs token).
3. V backendu musí být záznam v tabulce push zařízení s tímto tokenem.
4. Pošli test notifikaci (např. přes událost, která běžně push generuje — nová zpráva od klienta).
5. Ověř, že notifikace dorazí jak v popředí, tak v zamčeném stavu.

## Android (v1.0 NE, v1.1 ANO)

Pro v1.0 **neprovádět** — push v JS je gated. Build neobsahuje Firebase a `PushNotifications.register()` se nevolá, takže nehrozí nativní crash.

Pro v1.1 postup:

1. [https://console.firebase.google.com](https://console.firebase.google.com) → Create project "Aidvisora Mobile" (nebo stejné jméno jako dnes).
2. Přidat Android app: package `cz.aidvisora.app`.
3. Stáhnout `google-services.json`, uložit do `apps/web/android/app/`.
4. **Commit do gitu pouze přes šablonu** (viz [`.gitignore`](../.gitignore) + připravená `apps/web/android/app/google-services.example.json`). Reálný soubor drž mimo repo nebo jen pro zaměstnance s přístupem.
5. Odebrat podmínku `platform === "ios"` v [`usePushNotifications.ts`](../apps/web/src/lib/push/usePushNotifications.ts) (vrátit `platform === "ios" || platform === "android"`).
6. Vygenerovat Firebase Cloud Messaging **Server Key** (Project Settings → Cloud Messaging) a přidat do push backendu (`FCM_SERVER_KEY` nebo preferovaně Firebase Admin SDK service account JSON).
7. `pnpm cap:sync android` → rebuild AAB → Internal testing.
8. Smoke test Android push zahrnout do [`runbook-release.md`](runbook-release.md) sekce Internal smoke.

## Troubleshooting

- **iOS: `APNs error: no valid "aps-environment" entitlement`** → Xcode Signing & Capabilities → Push Notifications capability chybí, přidat.
- **iOS: `BadDeviceToken` při push send** → používáš sandbox token proti production endpointu nebo naopak. `APNS_ENVIRONMENT` musí odpovídat buildu (TestFlight builds = production).
- **iOS: notifikace nechodí a backend říká "success"** → ověř, zda uživatel nemá iOS **Focus mode** aktivní a zda notifikace pro appku nejsou silenced v Settings → Notifications → Aidvisora.
