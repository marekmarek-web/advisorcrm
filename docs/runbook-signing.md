# Release signing — iOS + Android

Cílem je mít podepsaný distribučně-ready build pro obě platformy **před** kroky App Store Connect / Play Console upload.

## Android — upload keystore (povinné)

### 1. Vygenerovat upload keystore

Google Play používá **Play App Signing**: ty držíš **upload key**, Google drží **app signing key**. Upload key slouží k podepsání každého AAB, který uploaduješ do Play Console. Pokud upload key ztratíš, dá se resetovat přes Play Support.

```bash
# Z kořene repa (nebo odkudkoli) — výstupní .jks ulož mimo git.
keytool -genkey -v \
  -keystore aidvisora-upload.jks \
  -alias aidvisora-upload \
  -keyalg RSA \
  -keysize 2048 \
  -validity 10000
```

Zadej heslo ke keystore a ke klíči. Doporučuji **stejné heslo pro oba**, uložit do 1Password.

Common Name si vyplň libovolně — Aidvisora s.r.o., Praha, Česká republika. Tyto hodnoty neovlivňují nic funkčně, jen metadata v certifikátu.

### 2. Umístění souboru v projektu

```bash
# Přesuň keystore přímo k appce (ignorován přes apps/web/android/.gitignore: *.jks).
mv aidvisora-upload.jks apps/web/android/app/aidvisora-upload.jks
```

### 3. Vytvořit `key.properties`

```bash
cp apps/web/android/key.properties.example apps/web/android/key.properties
# Edituj hesly:
#   storeFile=app/aidvisora-upload.jks
#   storePassword=<heslo ke keystore>
#   keyAlias=aidvisora-upload
#   keyPassword=<heslo ke klíči>
```

`key.properties` je v `.gitignore`, takže se necommitne. `key.properties.example` zůstává jako šablona.

### 4. Ověření build

```bash
cd apps/web/android
./gradlew clean bundleRelease
ls app/build/outputs/bundle/release/
# Očekávaný výstup: app-release.aab
```

`app-release.aab` je **podepsaný** tvým upload keyem a připravený na upload do Play Console Internal Testing.

Pokud build skončí s varováním `key.properties not found — release AAB will be UNSIGNED.`, pak jsi krok 3 neudělal nebo cesta k souboru není shodná s tou, co v `build.gradle` řídí načtení properties.

### 5. Backup

- `.jks` soubor + heslo ulož na **dvě nezávislá místa** (1Password + iCloud Drive, nebo USB v trezoru). Ztráta = nutnost requestnout reset upload keyem u Google.
- SHA-1 fingerprint otisku se dá dohledat z Play Console → App integrity, ale lokálně ho taky ověř:
  ```bash
  keytool -list -v -keystore apps/web/android/app/aidvisora-upload.jks -alias aidvisora-upload
  ```

## iOS — Development Team + Distribution cert (povinné)

### 1. Apple Developer Program

- Ověř, že máš aktivní Apple Developer Program enrollment (99 USD/rok) pro právní entitu **Aidvisora s.r.o.** (IČO 05474434).
- Pokud ne, enrolluj na [https://developer.apple.com/programs](https://developer.apple.com/programs) — pro firemní entitu potřebuješ D-U-N-S Number (Dun & Bradstreet, grátis, ale trvá pár dní schválení).

### 2. Nastavení Team v Xcode

```bash
open apps/web/ios/App/App.xcworkspace
```

Uvnitř Xcode:

1. V levém panelu klikni na kořenový **App** project (modrá ikona).
2. Vlevo vyber target **App** → záložka **Signing & Capabilities**.
3. Nahoře **Team** → vyber svůj Apple Developer Team (Aidvisora s.r.o.).
4. Zaškrtnuté nech **Automatically manage signing**. Xcode si sám vygeneruje Distribution cert + Provisioning profile, pokud chybí.
5. V seznamu Capabilities ověř:
   - **Push Notifications** (mělo by tam být; jinak **+ Capability** → Push Notifications).
   - **App Groups** (`group.cz.aidvisora.app`).
   - **Sign In with Apple** — **přidat** pokud chybí (jinak Apple reviewer v 4.8 flagu).
6. **Opakuj kroky 2–5 pro target `AidvisorShareExtension`** — team musí být stejný, App Group také.

### 3. Verifikace v `project.pbxproj`

Po uložení by měl `apps/web/ios/App/App.xcodeproj/project.pbxproj` obsahovat na obou targetech řádek:

```
DEVELOPMENT_TEAM = ABCD1234;
```

kde `ABCD1234` je tvůj 10znakový Team ID. Pokud tam zůstane prázdno, Xcode si to z GUI přepsal jen v mezipaměti — uprav a save znovu (File → Save nebo Cmd+S).

### 4. Verifikace build

```bash
cd apps/web
pnpm cap:sync ios
```

Pak v Xcode: **Product → Archive**. Při úspěšném archivu se otevře Organizer. Pokud Xcode hlásí `No Accounts` nebo `No signing certificate`, znamená to, že:

- Apple Developer account není přihlášený v Xcode → Settings → Accounts → **+** → Apple ID.
- Provisioning profile se nevygeneroval → v Signing & Capabilities klikni **Try Again**, případně **Download Manual Profiles**.

### 5. Export Options

Už existuje [`apps/web/ios/exportOptions-appstore.plist`](../apps/web/ios/exportOptions-appstore.plist) — ověř že `method = app-store` a `teamID` odpovídá.

### 6. Backup

- Distribution Cert (Apple managed) → je bezpečně v Apple Developer Portal. Local backup není nezbytný pro Automatic Signing.
- Apple Developer Program enrollment + Admin přístup → uložit do 1Password.

## CI/CD poznámka

Pro v1.0 stačí **ruční build z lokálního Macu** (Xcode Archive) + **lokální Gradle bundleRelease**. Automatizace přes Fastlane / EAS / GitHub Actions je na v1.1+.

Pokud chceš později přidat CI:

- **iOS:** Fastlane `match` na managed certs + Xcode Cloud nebo GitHub Actions s `xcodebuild`.
- **Android:** Gradle release v GitHub Actions, keystore jako secret (Base64 encoded).

## Definition of done

- [ ] Android: `apps/web/android/app/aidvisora-upload.jks` vygenerovaný, `apps/web/android/key.properties` vyplněný, `./gradlew bundleRelease` produkuje podepsaný AAB.
- [ ] iOS: oba targety (`App`, `AidvisorShareExtension`) mají v Signing & Capabilities nastaven Team, Automatic signing ON, Push + App Groups + Sign In with Apple capabilities.
- [ ] iOS: **Product → Archive** projde bez errorů a vyrobí `.xcarchive` v Organizer.
