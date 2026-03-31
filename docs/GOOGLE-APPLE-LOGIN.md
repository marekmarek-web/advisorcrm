# Přihlášení přes Google a Apple (Supabase)

Tento dokument řeší **OAuth konfiguraci a návrat přihlášení**. Pokud se iOS aplikace normálně sestaví a spustí, ale login nebo návrat do aplikace selhává, je to typicky problém auth/web vrstvy, ne obecného Xcode setupu. Pro samotné lokální Xcode prostředí viz `apps/web/ios/XCODE_SETUP.md`.

## 1. Google

### V Google Cloud Console

1. Jdi na [console.cloud.google.com](https://console.cloud.google.com).
2. Vytvoř nebo vyber **projekt** (např. „Aidvisora“).
3. **APIs & Services** → **Credentials** → **Create Credentials** → **OAuth client ID**.
4. Pokud se zeptá na „OAuth consent screen“: **Configure consent screen** → External (nebo Internal pro G Workspace) → vyplň název aplikace a ulož.
5. Znovu **Create Credentials** → **OAuth client ID**:
   - **Application type:** Web application
   - **Name:** např. „Aidvisora Web“
   - **Authorized JavaScript origins** (odkud se spouští přihlášení – **bez cesty, bez lomítka na konci**):
     - Produkce: `https://tvuj-projekt.vercel.app` (např. `https://aidvisora-xxx.vercel.app`)
     - Vývoj: `http://localhost:3000`
   - **Authorized redirect URIs** (kam Google pošle uživatele – zde **celá callback URL**):
     - `https://paoayamrcanxhsvkmdni.supabase.co/auth/v1/callback`  
     (bez lomítka na konci; pro jiný projekt zkopíruj z Supabase → Authentication → Providers → Google → „Callback URL“.)
6. **Create** → zobrazí se **Client ID** a **Client Secret**. Nech si je (Client Secret zobrazíš jen jednou).

**Chyba „Invalid Origin: URIs must not contain a path or end with /“:** Pole **Authorized JavaScript origins** smí obsahovat jen doménu (např. `https://tvuj-projekt.vercel.app`), **ne** cestu ani `/auth/v1/callback`. Callback URL patří **jen** do **Authorized redirect URIs**.

### V Supabase

1. **Authentication** → **Providers** → **Google**.
2. **Enable Sign in with Google** = zapnuto (zelený přepínač).
3. **Client IDs:** vlož svůj **Client ID** z Google (stačí jeden pro Web).
4. **Client Secret (for OAuth):** vlož **Client Secret** z Google.
5. **Save**.

### V aplikaci

Přihlášení přes Google už v kódu je (tlačítko „Přihlásit se přes Google“). Po uložení v Supabase bude fungovat.

**Produkce:** V Supabase → **Authentication** → **URL Configuration** musí být v **Redirect URLs** tvoje app URL (např. `https://tvuj-projekt.vercel.app/**`), aby Supabase po přihlášení přes Google věděl, kam uživatele poslat.

**iOS (Capacitor):** OAuth po `/auth/native-bridge` přesměruje na **`aidvisora://auth/callback?code=…`**. V `Info.plist` musí být v `CFBundleURLSchemes` jak **`aidvisor`**, tak **`aidvisora`** (jinak Safari hlásí „address is invalid“).

**Android vs iOS:** Stránka `/auth/native-bridge` používá jako druhý krok URL typu **`intent://…`** jen na **Androidu** (Chrome Custom Tabs). Na iOS by `intent://` bylo neplatné a rozbilo návrat do aplikace.

**Bílá obrazovka po návratu:** Na produkci musí být na Vercelu nastavené **`NEXT_PUBLIC_APP_URL`** (např. `https://www.aidvisora.cz`) — po `exchangeCodeForSession` aplikace přesměrovává na tuto doménu; pokud by se použil `window.location.origin` z iOS WebView (`capacitor://…`), stránka se nenačte.

---

## 2. Apple (Sign in with Apple)

### V Apple Developer

1. Účet na [developer.apple.com](https://developer.apple.com) (placený program, cca 99 USD/rok).
2. **Certificates, Identifiers & Profiles** → **Identifiers** → **+** → **Services IDs** → vytvoř nový (např. „Aidvisora Sign in with Apple“).
3. Zapiš **Identifier** (budeš ho dávat do Supabase jako Service ID).
4. Zaškrtni **Sign in with Apple** → **Configure**:
   - **Primary App ID:** vyber svou aplikaci (nebo vytvoř App ID).
   - **Domains:** tvoje doména (např. `tvuj-projekt.vercel.app` nebo `www.aidvisora.cz`).
   - **Return URLs:** např. `https://paoayamrcanxhsvkmdni.supabase.co/auth/v1/callback` (callback z Supabase → Providers → Apple).
5. V **Keys** vytvoř nový klíč, zaškrtni **Sign in with Apple** → **Configure** (vyber App ID) → stáhni `.p8` soubor (jen jednou) a zapiš **Key ID** a **Services ID**.

### V Supabase

1. **Authentication** → **Providers** → **Apple**.
2. Zapni **Enable Sign in with Apple**.
3. **Client IDs:** čárkou oddělený seznam – **Services ID** (identifier z Apple → Services IDs) a pro nativní appku i **Bundle ID** (např. `cz.aidvisora.app`). Řetězec musí **přesně** odpovídat Apple (bez překlepů).
4. **Secret Key (for OAuth):** Supabase očekává **JWT** (jeden dlouhý řetězec ve třech částech oddělených tečkami), **ne** přímý obsah souboru `.p8` (PEM). Chyba „Secret key should be a JWT“ znamená, že v poli je PEM nebo něco jiného než JWT.
   - JWT vygeneruj z `.p8` pomocí [nástroje v dokumentaci Supabase – Login with Apple](https://supabase.com/docs/guides/auth/social-login/auth-apple) (sekce *Configuration* / generátor client secret; v Safari občas nefunguje – použij Chrome nebo Firefox).
   - Do generátoru zadáš **Team ID**, **Key ID**, **Client ID** (= stejný **Services ID** jako v Supabase Client IDs) a **private key** = celý obsah `AuthKey_XXX.p8`.
   - Apple JWT secret **vyprší** (max. cca 6 měsíců) – pak je potřeba vygenerovat nový JWT a znovu uložit v Supabase.
5. Ostatní pole v dashboardu (např. Key ID / Team ID) doplň podle aktuálního UI Supabase, pokud je vyžaduje.
6. **Save**.

Na `/prihlaseni` jsou tlačítka Google a Apple a volají `supabase.auth.signInWithOAuth` stejně jako u Google (web → `/auth/callback`, Capacitor → `/auth/native-bridge`).

---

## 3. Backtest / kontrolní seznam (konfigurace)

Před ostrým náborem ověř v Supabase a Apple Developeru:

| Kontrola | Kde |
|----------|-----|
| **Redirect URLs** obsahují produkční URL aplikace (a případně `http://localhost:3000/**` pro lokál) | Supabase → Authentication → URL Configuration |
| **Services ID** v Apple = stejný řetězec jako v Supabase **Client IDs** | Apple Identifiers → Services IDs vs. Supabase → Apple |
| U Services ID: **Return URLs** = přesná **Callback URL** z Supabase (Apple provider) | Apple → Sign in with Apple → Web |
| **Secret Key** v Supabase = platný **JWT**, ne PEM z `.p8` | Supabase → Apple; při chybě viz výše |
| JWT secret není po expiraci (kalendář cca každých 6 měsíců) | — |

**Automatický smoke v repu:** `pnpm test:e2e` v `apps/web` kontroluje, že `/prihlaseni` načte stránku a zobrazí tlačítka Google a Apple. Kompletní přihlášení přes Apple vyžaduje ruční klik v prohlížeči na produkci/stagingu.

---

## Shrnutí

| Kde | Co |
|-----|-----|
| **Google** | Cloud Console → OAuth client (Web) → Redirect URI = Supabase callback → Client ID + Secret do Supabase |
| **Apple** | Developer → Services ID + klíč `.p8` → do Supabase Client IDs + **JWT secret** (z `.p8` přes generátor), ne raw PEM |
| **Supabase** | Redirect URLs musí obsahovat produkční URL aplikace |
