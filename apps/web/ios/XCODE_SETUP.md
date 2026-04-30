# Aidvisora iOS - Xcode lokalni prostredi

Tento navod je pro **lokalni beh a debug v Xcode**. Pro App Store / TestFlight pouzij `APP_STORE.md`.

## 1. Jedina spravna cesta projektu

- Kanonicka cesta iOS projektu je `~/Developer/Aidvisora/apps/web/ios/App/App.xcodeproj`.
- Neotevirej duplicitni kopie z `Documents/...`.
- Pro otevreni pouzivej bud:
  - Finder -> `apps/web/ios/App/App.xcodeproj`
  - nebo z terminalu v `apps/web`: `pnpm cap:open:ios`

## 2. Dva rezimy iOS behu

### Produkcni web v appce

Pouzij, kdyz chces rychle overit:

- ze se appka otevre,
- nativni shell,
- deep linky,
- OAuth navrat,
- share extension,
- build v simulátoru nebo na iPhonu.

Postup:

```bash
cd ~/Developer/Aidvisora/apps/web
pnpm cap:sync
```

Tento rezim nacita `https://www.aidvisora.cz/prihlaseni?native=1`.

### Lokalni frontend pres localhost

Pouzij, kdyz ladis webovy frontend a chces hned videt lokalni zmeny v appce.

Postup:

```bash
cd ~/Developer/Aidvisora/apps/web
pnpm dev
```

V druhem terminalu:

```bash
cd ~/Developer/Aidvisora/apps/web
pnpm cap:dev
```

Tento rezim prepne WebView na LAN adresu Macu, napr. `http://192.168.0.106:3000/prihlaseni?native=1`.
Pro iOS simulator lze pouzit `pnpm cap:dev:sim`, ktery necha `http://127.0.0.1:3000/prihlaseni?native=1`.

## 3. Doporuceny postup pri kazdem otevreni Xcode

1. Zkontroluj, ze jsi v kanonicke kopii repa.
2. Po `git pull` nebo zmene zavislosti spust `pnpm install` z korene repa.
3. Rozhodni rezim:
   - produkce v appce -> `pnpm cap:sync`
   - fyzicky iPhone -> `pnpm dev` a pak `pnpm cap:dev`
   - iOS simulator -> `pnpm dev` a pak `pnpm cap:dev:sim`
4. Otevri `App.xcodeproj`.
5. V Xcode proved:
   - `File > Packages > Reset Package Caches`
   - `File > Packages > Resolve Package Versions`
   - `Product > Clean Build Folder`
6. Zvol scheme `App`.
7. Pak teprve `Run`.

## 4. Co v Xcode pouzivat

- Primarni scheme/target: `App`
- Vedlejsi target: `AidvisorShareExtension`
- Pro bezny debug nepouzivej `Release`
- Pro OAuth, kameru, share extension a push preferuj fyzicky iPhone
- Pro rychly UI/build debug staci simulator

## 5. Signing pro lokalni beh

U obou targetu:

- `Signing & Capabilities`
- `Automatically manage signing`
- stejny `Team`

To plati pro:

- `App`
- `AidvisorShareExtension`

## 6. Swift Package Manager a caste chyby

Pokud Xcode hlasi chyby kolem `CapApp-SPM`, postupuj vzdy takto:

```bash
cd ~/Developer/Aidvisora
pnpm install
cd apps/web
pnpm cap:sync
```

Pak v Xcode:

1. `File > Packages > Reset Package Caches`
2. `File > Packages > Resolve Package Versions`
3. `Product > Clean Build Folder`
4. `Cmd + B`

Poznamka: repo uz obsahuje patch pro `@supernotes/capacitor-send-intent`, takze po `pnpm install` musi byt Swift dependencies konzistentni.

### 6.1. „failed extracting … grpc.zip“ / `fatalError` u balíčku `grpc` (CapApp-SPM)

Firebase iOS SDK tahá **binární** `gRPC` (`grpc-binary`); stažení je ~100 MB. Když se zip stáhne dočasně do polovičního stavu, Swift PM při extrakci spadne a v Issue Navigatoru uvidíš **Missing package product CapApp-SPM** (následek, ne příčina).

1. V kořeni monorepa: `pnpm --filter web run ios:reset-spm` (smaže hlavně `~/Library/Caches/org.swift.swiftpm/artifacts`).
2. `pnpm install` a z `apps/web`: `pnpm cap:sync`.
3. V Xcode: **File → Packages → Reset Package Caches** → **Resolve Package Versions** → **Clean Build Folder** → build.

Kdyby to pořád nešlo, agresivně: zavři Xcode, `rm -rf ~/Library/Caches/org.swift.swiftpm`, znovu otevři projekt a nech znovu stáhnout balíčky. Ověř také **dost místa na disku** a stabilní síť (VPN/firewall občas kouše `dl.google.com`).

## 7. Kriticka env promenna na Vercelu

Pro spravny beh OAuth a nativniho navratoveho flow **musi byt na Vercelu nastavena** tato promenna:

```
NEXT_PUBLIC_APP_URL=https://www.aidvisora.cz
```

**Proc je to dulezite:**
- Po Google OAuth vraci Capacitor deep link `aidvisora://auth/callback?code=...`
- `NativeOAuthDeepLinkBridge` potrebuje znat kanonickou HTTPS URL, aby navigoval WebView spravne
- Bez teto promenne nebo pri `capacitor://localhost` origin vznika bila obrazovka
- Promena je `NEXT_PUBLIC_*` → vkompiluje se pri buildu → po nastaveni treba **Redeploy** na Vercelu

Kde nastavit: Vercel → Project → Settings → Environment Variables → `NEXT_PUBLIC_APP_URL` = `https://www.aidvisora.cz` → Save → Redeploy.

## 8. Kratky rozhodovaci tahak

- Chci jen spustit iOS appku: `pnpm cap:sync`
- Chci ladit frontend lokalne: `pnpm dev` + `pnpm cap:dev`
- Xcode hlasi SPM chybu: reset caches + resolve packages + clean build
- Appka se sestavi, ale auth nefunguje: neni to primarne Xcode problem

## 9. Ladeni Capacitor WebView (logy, JS, sit, vykon)

Tato cast odpovida postupu z planu **iOS WebView / prihlaseni** — Xcode konzole casto ukaze jen systemovy sum (`RTIInputSystemClient`, `WebKit.Networking`, `Connection interrupted`). Skutecne JS chyby a sit patri do **Safari Web Inspectoru**.

### 9.1 Safari Web Inspector (Console + stack trace)

1. Na Macu: **Safari → Settings → Advanced →** zapni **Show features for web developers**.
2. Spust appku ve **simulatoru** nebo na **iPhonu** (USB).
3. V Safari menu **Develop**:
   - Simulator: **Develop → Simulator →** vyber stranku (WebView).
   - Zarizeni: **Develop →** (název připojeného iPhonu) **→** vyber WebView.
4. Otevri zalozku **Console** a reprodukuj nacteni `https://www.aidvisora.cz/prihlaseni?native=1` (nebo localhost rezim).
5. Pri hlaskach typu **JS Eval error** v Xcode hledej v konzoli **prvni cervenou chybu se stack trace** (soubor a radek) — bez toho nejde chybu priradit ke konkretnimu kodu.

### 9.2 Simulator vs. fyzicke zarizeni

- **Simulator** je pomocny, ale WebView a sit tam byvaji **hlucnejsi** (sekani, falesne vypadky). Pokud se problem **na iPhonu neprojevuje**, jde casto o prostredi simulátoru, ne o produkcni bug.
- OAuth, kamera, deep linky: **preferuj iPhone** (viz sekce 4).

### 9.3 Korelace casovani (kdy presne to spadne)

Pri reportu chyby poznamenej:

- **Cold start** aplikace vs. az po **tap do inputu** vs. po **navigaci** v portalu.
- Pomaha to spojit problem s hydrataci, klavesnici, nebo konkretni strankou.

### 9.4 Sit a „sekani“ — zalozka Network

Ve Web Inspectoru otevri **Network** behem reprodukce:

- Padaji **document** nebo **hlavni JS** chunky, nebo jen API?
- Opakuje se **plne nacteni** stranky, nebo jen pomale XHR?

To rozlisi **skutecny vypadek spojeni** od **tezkeho JS** na hlavnim vlakne.

### 9.5 „Offline“ banner vs. systemova obrazovka

- Pokud je presny text **„Offline – zkontrolujte připojení“**, jde o **React `OfflineBanner`** v mobilnim portalu (`OfflineBanner` v `apps/web/src/app/shared/mobile-ui/primitives.tsx`). Ve WKWebView byva `navigator.onLine` **nespolehlivy**; v appce je proto **debounce** offline signalu na nativnich platformach (delší na iOS).
- **Debug log** online/offline a visibility (s casovou znackou): v Safari konzoli spust  
  `localStorage.setItem("aidv_debug_network","1")`  
  a reloadni WebView; v konzoli uvidis radky `[OfflineBanner] …`. Vypnuti: `localStorage.removeItem("aidv_debug_network")`.
- Pokud text **neni** z banneru, jde spis o **WebKit / chybu nacteni dokumentu** — sleduj Network a pripadne cervene chyby v Console.
