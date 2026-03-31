# Aidvisora iOS – App Store Connect a revize

Kanónická kopie Xcode projektu je v **git repozitáři** pod  
`apps/web/ios/` (např. `~/Developer/Aidvisora`). Nepracujte proti duplicitní kopii v `Documents/…`, aby signing a CI nešly mimo sebe.

## 1. Identifikátory (Developer Portal + App Store Connect)

Vytvořte / ověřte v [Apple Developer → Identifiers](https://developer.apple.com/account/resources/identifiers/list):

| Položka | Hodnota |
|--------|---------|
| Hlavní aplikace | `cz.aidvisora.app` |
| Share extension | `cz.aidvisora.app.share` |
| App Group | `group.cz.aidvisora.app` (zapněte u **obou** App ID) |

Capabilities u hlavní aplikace: **Push Notifications**, **App Groups** (stejná skupina jako u extension).

V **App Store Connect** vytvořte aplikaci se stejným Bundle ID `cz.aidvisora.app`, doplňte SKU, název a primární jazyk.

## 2. Signing v Xcode

- Otevřete `apps/web/ios/App/App.xcodeproj`.
- U targetů **App** a **AidvisorShareExtension**: **Signing & Capabilities** → vyberte tým, nechte **Automatically manage signing**.
- Ověřte, že archiv (Release) použije distribuční profil (Organizer po Archive).

## 3. Push (APNs)

- **Release** build používá `App.release.entitlements` s `aps-environment` = **production**.
- V Supabase (nebo jiném backendu) nahrajte **Production** APNs klíč / certifikát a otestujte push z TestFlight buildu, ne z debug zařízení.

## 4. App Privacy (Nutrition Labels) v App Store Connect

Sladěte s chováním aplikace: web v WKWebView (přihlášení, CRM), nativně kamera, galerie, dokumentový scanner, share extension, push.

V repu je `App/PrivacyInfo.xcprivacy` s deklarací API (UserDefaults, file timestamps) dle požadavků Apple. Pokud validace archivu nahlásí další **Required Reason APIs**, doplňte je do manifestu.

Ujistěte se o veřejných URL: **zásady ochrany osobních údajů** a **podpora**.

## 5. Build před archivem

Z `apps/web` (bez `CAPACITOR_SERVER_URL` pro výchozí produkční URL z `capacitor.config.ts`):

```bash
pnpm cap:sync
```

Poté v Xcode: schéma **App**, **Any iOS Device (arm64)** → **Product → Archive** → Validate → Distribute.

Export z příkazové řádky (volitelně, po archivu):

```bash
xcodebuild -exportArchive -archivePath …/App.xcarchive -exportPath …/export -exportOptionsPlist ios/exportOptions-appstore.plist
```

## 6. Poznámky pro App Review (šablona)

Upravte podle reálného testovacího účtu a funkcí.

```
Aidvisora je hybridní aplikace (Capacitor): hlavní obsah je Next.js na https://www.aidvisora.cz v embedded webview po přihlášení.

Nativní funkce:
- Share extension „Aidvisora Share“: sdílení souborů/obrázků do aplikace.
- Kamera a výběr z galerie pro dokumenty.
- Push notifikace (pokud jsou zapnuté).

Testovací účet:
- E-mail: …
- Heslo: …

Deep link / custom URL scheme: aidvisor:// (pokud testujete OAuth nebo návrat z externího prohlížeče).
```

## 7. Export compliance

V `Info.plist` je `ITSAppUsesNonExemptEncryption` = `false` (běžné HTTPS). V App Store Connect při submitu obvykle zvolte odpovídající odpověď k šifrování dle vašeho právního posouzení.

## 8. Xcode: „Missing package product CapApp-SPM“

Obvykle jde o nevyřešené Swift Package závislosti (lokální balíček `CapApp-SPM` táhne Capacitor pluginy z `node_modules`). V repu je **pnpm patch** na `@supernotes/capacitor-send-intent@7.0.0`: (1) `capacitor-swift-pm` **8.x** (kvůli kolizi s document scannerem), (2) název SPM produktu **`SupernotesCapacitorSendIntent`** (upstream exportuje dříve `SendIntent`, což Xcode hlásí jako „product … not found“).

Postup po `git pull`:

1. Z kořene monorepa: `pnpm install` (aplikuje patch).
2. Z `apps/web`: `pnpm cap:sync`.
3. V Xcode: **File → Packages → Reset Package Caches**, pak **File → Packages → Resolve Package Versions**.
4. Znovu **Product → Clean Build Folder** (`Shift + Cmd + K`) a build (`Cmd + B`).
