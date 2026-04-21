# Apple Sign-in — aktivace (v1.0)

Kód je hotový. Chybí jen **runtime aktivace** ve třech venkovních systémech. Bez toho Apple button v `MobileLoginView` vrátí chybu `"provider is not enabled"` ze Supabase. App Store Review Guideline **4.8** navíc vyžaduje Sign in with Apple, pokud je v appce Google login → **bez toho je iOS build automaticky reject**.

## Kde je kód v repu

- Tlačítka (ikonové i textové "Apple"): [`apps/web/src/app/components/auth/MobileLoginView.tsx`](../apps/web/src/app/components/auth/MobileLoginView.tsx) řádky 310–320 a 331–346.
- OAuth handler: [`apps/web/src/app/components/auth/useAidvisoraLogin.ts`](../apps/web/src/app/components/auth/useAidvisoraLogin.ts) funkce `handleOAuthSignIn("apple")` (řádek ~398).
- Deep link callback: [`apps/web/src/app/components/NativeOAuthDeepLinkBridge.tsx`](../apps/web/src/app/components/NativeOAuthDeepLinkBridge.tsx) — obsluhuje `aidvisora://auth/callback?code=…`.
- Bridge route: [`apps/web/src/app/auth/native-bridge/route.ts`](../apps/web/src/app/auth/native-bridge/route.ts).

Native flow: Apple login → Safari Custom Tab → Apple → Supabase → `aidvisora://auth/callback` → `NativeOAuthDeepLinkBridge` provede `supabase.auth.exchangeCodeForSession(code)`.

## Externí aktivace (nutná před TestFlight buildem)

### A. Apple Developer Portal

1. Otevři [https://developer.apple.com/account/resources/identifiers/list](https://developer.apple.com/account/resources/identifiers/list).
2. Ujisti se, že u **App ID** `cz.aidvisora.app` je v Capabilities **Sign In with Apple** zaškrtnuté. Save.
3. Vytvoř (nebo zvol) **Services ID**:
   - Identifier doporučuji `cz.aidvisora.app.signinwithapple` (nebo podobný — NEMŮŽE to být stejný string jako Bundle ID).
   - Popis: "Aidvisora — Sign in with Apple".
   - Checkni **Sign In with Apple** a klikni **Configure**:
     - Primary App ID: `cz.aidvisora.app`
     - **Domains and Subdomains:** `<project-ref>.supabase.co` (nahraď reálným ref z Supabase URL)
     - **Return URLs:** `https://<project-ref>.supabase.co/auth/v1/callback`
   - Save + Continue + Register.
4. Vytvoř **Sign in with Apple private key** (Keys → +):
   - Název "Aidvisora SIWA key".
   - Zaškrtni **Sign in with Apple** → Configure → vyber Primary App ID `cz.aidvisora.app`.
   - Register → stáhni **P8 soubor** (jen jednou!). Ulož mimo git.
   - Poznač **Key ID** (10 znaků).
   - Poznač **Team ID** (10 znaků, v pravém horním rohu portálu).

### B. Supabase dashboard

1. `Authentication → Providers → Apple → Enable`.
2. Vyplň:
   - **Services ID (Client ID):** `cz.aidvisora.app.signinwithapple` (z kroku A.3).
   - **Secret Key:** Supabase si ho vygeneruje ze tří údajů, které vložíš:
     - Apple Team ID (A.4).
     - Apple Key ID (A.4).
     - Apple Private Key (obsah P8 souboru — celý včetně `-----BEGIN PRIVATE KEY-----`).
   - **Callback URL (pro Apple):** Supabase zobrazí — zkopíruj a ověř, že je `https://<project-ref>.supabase.co/auth/v1/callback`. Musí se shodovat s Return URL v kroku A.3.
3. Save.
4. `Authentication → URL Configuration` — ověř, že **Additional Redirect URLs** obsahují:
   - `https://www.aidvisora.cz/**` (pro web flow)
   - `https://www.aidvisora.cz/auth/native-bridge` (pro native flow z Capacitoru; Supabase redirectuje na tuto URL, odkud `/auth/native-bridge/route.ts` vygeneruje `aidvisora://auth/callback?code=…` deep link).

### C. Smoke test (před buildem pro TestFlight)

1. `pnpm dev` + `pnpm cap:dev` → build na fyzickém iPhonu.
2. Na `/prihlaseni?native=1` → tlačítko **Apple**.
3. Safari Custom Tab otevře Apple login.
4. Po přihlášení se dialog zavře a WebView skočí na `/portal/today` (poradce) nebo `/client` (klient).
5. Ověř `supabase.auth.getUser()` v konzoli Safari Web Inspectoru.

## Pokud Apple backend během review reject odmítne

**Fallback plán** (ne-preferovaný, ale funkční):

- Skrýt Google OAuth button v native iOS (guard přes `isIosPlatform()` v [`MobileLoginView.tsx`](../apps/web/src/app/components/auth/MobileLoginView.tsx)).
- Tím odpadá povinnost Apple Sign-in (Guideline 4.8 se aktivuje jen když je třetí-stranový social login přítomen).
- Email + heslo zůstává jediný login v iOS appce. UX je horší, ale není reject risk.
- Android nedotčen, tam Google login zůstává.

## Ověření v Xcode

- Entitlements **nepotřebují** `com.apple.developer.applesignin` položku — Apple Sign-in v Capacitoru jede přes OAuth redirect (Safari Custom Tab), ne přes nativní `ASAuthorizationController`. Tzn. nechat entitlementy jak jsou.
- Pokud by se v budoucnu přešlo na native SignInWithApple plugin (např. `@capacitor-community/apple-sign-in`), pak ano — přidat entitlement a regenerovat provisioning profil.

## Definition of done pro tento todo

- [ ] Apple Developer: App ID má Sign In with Apple + Services ID vytvořen s Return URL na Supabase + P8 key vygenerován.
- [ ] Supabase Authentication → Providers → Apple = Enabled, s validními údaji.
- [ ] Supabase URL Configuration obsahuje `www.aidvisora.cz` a `www.aidvisora.cz/auth/native-bridge`.
- [ ] Smoke test v Capacitor buildu na iPhonu proběhl bez chyby a session vznikla v Supabase.
