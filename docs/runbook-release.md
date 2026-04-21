# Release runbook — build, upload, smoke, submit, monitoring

Ucelený postup od `git main` až po schválení v App Store + Google Play. Předpokládá, že všechny předchozí runbooky jsou splněny:

- [`release-v1-decisions.md`](release-v1-decisions.md) — scope v1.0.
- [`runbook-apple-signin.md`](runbook-apple-signin.md) — Apple Sign-in aktivní v Supabase.
- [`runbook-push.md`](runbook-push.md) — APNs P8 uploadnutý v push backendu.
- [`runbook-signing.md`](runbook-signing.md) — Android upload keystore + iOS Development Team.
- [`runbook-app-store-connect.md`](runbook-app-store-connect.md) — ASC record vytvořený, Privacy Labels vyplněné.
- [`runbook-play-console.md`](runbook-play-console.md) — Play Console app vytvořená, Data Safety vyplněná.

---

## A. Build pipeline

### A.1 Stable main + env check

```bash
git status                        # musí být čisté
git pull --rebase origin main
pnpm install                      # monorepo root
```

Ověř, že deployment `https://www.aidvisora.cz` je **stabilní production build** (Vercel dashboard). Capacitor appka se připojuje na **tento** produkční URL, takže cokoli rozbitého v aktuálním web buildu = rozbité i v mobilu.

Pre-submission health check:

```bash
# Health endpoint + ping login
curl -sSf https://www.aidvisora.cz/api/health
open "https://www.aidvisora.cz/prihlaseni?native=1"
```

### A.2 Update version metadata

Bumpni jen pokud stoupáš nad 1.0.0. Pro **první** release nech:

- iOS (`apps/web/ios/App/App.xcodeproj/project.pbxproj`): `MARKETING_VERSION=1.0`, `CURRENT_PROJECT_VERSION=1`.
- Android (`apps/web/android/app/build.gradle`): `versionCode=1`, `versionName="1.0"`.

Pro každý nový TestFlight / Internal testing build zvýšit `CURRENT_PROJECT_VERSION` (iOS) a `versionCode` (Android) o +1. `versionName` / `MARKETING_VERSION` se zvyšuje jen u semver změn pro uživatele.

### A.3 Capacitor sync + assets

```bash
cd apps/web
pnpm cap:sync              # propíše web assety + plugin manifest do iOS/Android projektů
pnpm cap:assets            # vygeneruje app icony, splash screens, PWA ikony (brand aware)
```

Výstup ověř:

- `apps/web/ios/App/App/Assets.xcassets/AppIcon.appiconset/` obsahuje všechny velikosti.
- `apps/web/android/app/src/main/res/mipmap-*/` obsahuje všechny hustoty.

---

## B. iOS build + TestFlight

### B.1 Archive v Xcode

```bash
cd apps/web
pnpm cap:open:ios
```

Xcode se otevře s workspace `App.xcworkspace`. V horní liště:

1. Scheme: **App**.
2. Device: **Any iOS Device (arm64)**.
3. Menu **Product → Archive**.
4. Archive trvá 2–5 min. Výstup v Organizer (okno se otevře automaticky).

Pokud archive skončí errorem `No signing certificate` / `Missing provisioning profile`:

- Vyber target `App` → Signing & Capabilities → **Try Again**.
- Pokud stále chyba → Xcode Preferences → Accounts → Manage Certificates → `+ Apple Distribution`.

### B.2 Validate archive

V Organizer:

1. Vyber nejnovější archive.
2. **Validate App**.
3. Zvol distribution method: **App Store Connect**.
4. Automatically manage signing.
5. Upload symbolss = Yes (pro Sentry/ASC crash reporting).
6. Validate vrací report. Fix-forward všechny errory **před** Distribute.

### B.3 Distribute to App Store Connect

V Organizer:

1. Vyber validovaný archive → **Distribute App**.
2. **App Store Connect → Upload**.
3. Automatically manage signing.
4. Wait 5–15 min. Xcode uzavře dialog po úspěchu.

### B.4 TestFlight processing

- App Store Connect → tvá app → **TestFlight** → sekce **Builds** po 5–15 min zobrazí nový build ve stavu **Processing**.
- Dalších 5–30 min potrvá **Beta Review** (automatický + někdy manuální pro první build).
- Po schválení: přidej sebe do **Internal testers** (TestFlight → Testers → Internal) a dostaneš push do TestFlight iOS appky.

---

## C. Android build + Internal testing

### C.1 Build release AAB

```bash
cd apps/web/android
./gradlew clean bundleRelease
```

Výstup: `apps/web/android/app/build/outputs/bundle/release/app-release.aab`.

Ověř:

```bash
ls -lh apps/web/android/app/build/outputs/bundle/release/app-release.aab
# ~10-25 MB typical velikost

# Verifikace podpisu
keytool -printcert -jarfile apps/web/android/app/build/outputs/bundle/release/app-release.aab
```

Výstup by měl ukázat certifikát s fingerprint shodující se s tvým upload keystore.

### C.2 Upload do Play Console Internal testing

- Play Console → **Testing → Internal testing → Create new release**.
- Drag & drop `app-release.aab`.
- Release name: `1.0 (1)` (odvozené z versionName + versionCode).
- Release notes (CS):
  ```
  První release pro interní smoke test.
  - Hybrid Capacitor shell nad www.aidvisora.cz
  - Login: email + Google + Apple
  - Klientská zóna, poradcovský portál
  - Skener dokumentů, share intent
  - Push notifikace v této verzi pouze pro iOS (Android v další verzi)
  ```
- **Save → Review release → Start rollout to Internal testing**.

### C.3 Play Internal processing

- AAB projde automatickou kontrolou (2–5 min).
- Přidej sebe do Internal testers (předtím si vytvoř **Google Group** s testery nebo zadej jednotlivé emaily).
- Otevři Play Console **Testing → Internal testing → "Copy link"** → opt-in URL pro testery.
- Na Android zařízení klikni opt-in link → nainstaluj z Play Store.

---

## D. Internal smoke test

Proveď na **obou platformách paralelně**. Každý bod musí projít bez crashů a blockujících chyb.

### D.1 Login flow

| Test | iOS | Android |
|---|---|---|
| Email + heslo → poradcovský login | ☐ | ☐ |
| Email + heslo → klientský login | ☐ | ☐ |
| Google OAuth → návrat do appky (deep link) | ☐ | ☐ |
| Apple Sign-in → návrat do appky (deep link) | ☐ | n/a |
| Logout → obrazovka přihlášení | ☐ | ☐ |
| MFA challenge (pokud je zapnuté) | ☐ | ☐ |

### D.2 Advisor workspace

| Test | iOS | Android |
|---|---|---|
| Dashboard / Today render | ☐ | ☐ |
| List klientů, otevření detailu | ☐ | ☐ |
| Přidat nového klienta | ☐ | ☐ |
| Nahrát dokument přes file picker | ☐ | ☐ |
| Naskenovat dokument kamerou | ☐ | ☐ |
| AI asistent — odeslat zprávu a dostat odpověď | ☐ | ☐ |
| Otevřít Stripe billing → vidím jen read-only status (žádné "Zahájit předplatné") | ☐ | ☐ |
| Klik "www.aidvisora.cz/portal/setup" odkaz → otevře prohlížeč (ne WebView) | ☐ | ☐ |

### D.3 Client zone

| Test | iOS | Android |
|---|---|---|
| Přihlášení klienta do `/client` | ☐ | ☐ |
| Přehled produktů | ☐ | ☐ |
| Poslat poradci požadavek (text + dokument) | ☐ | ☐ |
| Poradce vidí požadavek v `/portal` | ☐ | ☐ |

### D.4 Native features

| Test | iOS | Android |
|---|---|---|
| Push notifikace přijatá v popředí | ☐ | n/a |
| Push přijatá v zamčeném stavu | ☐ | n/a |
| Share extension: v Safari/Gmail sdílet PDF → appka ho nahraje | ☐ | ☐ |
| Deep link `aidvisora://` klikem na notifikaci otevře správnou obrazovku | ☐ | ☐ |
| Kamera permission dialog + deny flow (soft-ask UI se zobrazí) | ☐ | ☐ |

### D.5 Stability

| Test | iOS | Android |
|---|---|---|
| Background → foreground nevyhodí white screen déle než 1 s | ☐ | ☐ |
| Ztráta sítě → graceful error toast (žádný crash) | ☐ | ☐ |
| Sentry web dashboard ukazuje nové error events pro daný release | ☐ | ☐ |

### D.6 Blocker identifikace

Pokud **kterákoli** položka selže:

- Rollback plán: oprav, bumpni `CURRENT_PROJECT_VERSION` / `versionCode` o +1, rebuildni, re-uploaduj do TestFlight / Internal.
- **Nikdy** neupload rozbitý build do **Production** ani pro **App Review**.

---

## E. Submit for review

### E.1 iOS → App Review

1. App Store Connect → tvá app → **App Store → [tvá verze 1.0]**.
2. V **Build** sekci klikni **+ → vyber TestFlight build** (ten co prošel smoke).
3. Proveď závěrečnou kontrolu všech polí:
   - [ ] Description, Keywords, Support URL, Privacy Policy URL vyplněné.
   - [ ] Screenshots 6.7" uploadované (min. 3).
   - [ ] App Privacy Labels = Complete.
   - [ ] Age Rating 4+.
   - [ ] Pricing + Availability: Free + regiony.
   - [ ] Demo account + review notes (viz `runbook-app-store-connect.md` sekce 8).
   - [ ] Export Compliance vyplněné.
4. **Add for Review** → **Submit to App Review**.

Očekávaný timeline:

- `Waiting For Review` — 12–48 h.
- `In Review` — typicky 1–4 h, občas přes noc.
- `Pending Developer Release` (pokud jsi zvolil manual release) nebo rovnou `Ready for Sale`.

### E.2 Android → Production

Pokud máš **Organization Play account**, můžeš jít rovnou z Internal → Production.

Pokud máš **Personal account**, musíš nejdřív projít Closed testing se **12+ testery po 14 dní**:

1. Po 2 týdnech v Internal → promuj build do **Closed testing** (track "alpha").
2. Min. 12 opt-in testerů nainstalovaných.
3. Po 14 dnech otevři **Production → Create new release** → promuj build.
4. Store listing ověř naposled (App content, Data safety, Target audience = all Complete).
5. **Review release → Start rollout to Production**.

Rollout tempo: začni na **10 %** staged rollout, po 24 h stability zvyš na 50 %, po dalších 24 h na 100 %.

---

## F. Post-launch monitoring (72 h)

### F.1 Dashboardy k pravidelné kontrole

| Zdroj | Co sledovat |
|---|---|
| Sentry | Error rate, nové exception groups, regression. Alert threshold: **>5 chyb/hod** pro nový release → zkontroluj. |
| Vercel | Function errors, p95 latency, 5xx rate na `/api/*`. |
| App Store Connect | Analytics → Crashes. Metrics → Sessions, Active devices. |
| Play Console | Vitals → Crash rate, ANR rate. Pre-launch report (automaticky po upload). |
| Supabase | Auth log, DB errors, storage bucket usage. |
| PostHog | Session replay pro první 50 uživatelů — ověř real-user flow. |

### F.2 Alerts (manuální nebo nastavit)

- Sentry: nastav issue alert pro **>10 occurrences in 1 hour** na nový release.
- ASC: Crashes tab → sleduj trend. Jednorázový crash neznamená nic, opakovaný stack trace = P0.
- Play Console Vitals: crash-free users <99 % = hledat issue.

### F.3 Rozhodovací strom

```
Reject z App Review?
├── Guideline 4.8 (Apple Sign-in) → aktivovat Apple Sign-in (viz runbook), resubmit.
├── Guideline 3.1.1 (IAP) → zkontrolovat, že v native UI opravdu NENÍ Stripe CTA; přidat review note, resubmit.
├── Guideline 4.2 (low functionality) → argumentovat native features (scanner, push, share, deep link); resubmit.
├── Guideline 5.1.1 (privacy labels) → upravit labels v ASC; resubmit (bez rebuild).
└── Jiné → číst detail v rejection message, opravit, resubmit.

Reject z Play?
├── Data safety mismatch → upravit Data Safety form, resubmit (bez rebuild).
├── Content rating mismatch → re-complete IARC questionnaire.
├── Crash na launch → P0, hotfix.
└── Jiné → detail v rejection email.

P0 bug (crash, login broken, data loss)?
├── Ihned fix-forward: bumpni versionCode / CURRENT_PROJECT_VERSION → rebuild → upload → (iOS) Expedited Review request → (Android) staged rollout halt + new release.

P1/P2 bug?
├── Zaloguj v issue trackeru, fix v příštím patch release 1.0.1.
```

### F.4 Expedited Review (iOS)

Jen pro P0 hotfixe (bezpečnost, data loss, crash na launch): App Store Connect → **Contact Us → App Review → Request Expedited Review**. Apple vyřeší za 2–12 h, ale **šetři to** — zneužití = Apple to příště ignoruje.

---

## G. Cheat sheet příkazů

```bash
# Dev & sync
cd apps/web
pnpm cap:sync                              # sync web assets + plugin manifest
pnpm cap:assets                            # regen ikon/splash
pnpm cap:open:ios                          # otevři Xcode
pnpm cap:open:android                      # otevři Android Studio

# Android release build
cd apps/web/android
./gradlew clean bundleRelease              # produ AAB
./gradlew signingReport                    # debug/release signing info

# iOS release archive (alternativa ke GUI)
cd apps/web/ios/App
xcodebuild archive \
  -workspace App.xcworkspace \
  -scheme App \
  -configuration Release \
  -archivePath build/App.xcarchive \
  -destination 'generic/platform=iOS'

xcodebuild -exportArchive \
  -archivePath build/App.xcarchive \
  -exportPath build/ipa \
  -exportOptionsPlist ../exportOptions-appstore.plist

# Dev mode (local Next dev server, Capacitor na iPhone/simulator)
pnpm dev                                    # terminál 1: Next.js dev server
pnpm cap:dev                                # terminál 2: zaktualizuje CAPACITOR_SERVER_URL
pnpm cap:open:ios                           # a Build + Run na device
```

---

## H. Finální checklist před submitem

**v1.0 nejde ven, dokud NEJSOU všechny položky ☑.**

- [ ] Git main stabilní, bez uncommitted changes.
- [ ] Production Vercel deploy je zdravý (health check + ping login).
- [ ] Apple Sign-in aktivní v Supabase (smoke test proběhl).
- [ ] Stripe gate v native UI ověřený v TestFlight buildu.
- [ ] Privacy policy `/privacy` obsahuje sekci 13 "Mobilní aplikace Aidvisora".
- [ ] Android upload keystore + `key.properties` vytvořené, `bundleRelease` produkuje podepsaný AAB.
- [ ] iOS Development Team nastavený na obou targetech, Archive prošel.
- [ ] ASC record vytvořený, Privacy Labels = Complete, Metadata + Screenshots uploadované.
- [ ] Play Console app vytvořená, Data Safety + Content Rating + Target Audience = Complete, Store Listing + Screenshots.
- [ ] TestFlight build schválený v Beta Review, smoke test ☑.
- [ ] Play Internal testing AAB nainstalovaný, smoke test ☑.
- [ ] Review notes + demo accounts zdokumentované a otestované.
- [ ] Sentry a PostHog alerting nastavené.
- [ ] 1Password obsahuje: Apple Developer, App Store Connect, Google Play, Supabase, Stripe, APNs key, Android keystore + passwords.
