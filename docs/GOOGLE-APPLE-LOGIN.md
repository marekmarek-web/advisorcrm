# Přihlášení přes Google a Apple (Supabase)

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
3. Vyplň údaje z Apple Developeru:
   - **Services ID** (Identifier ze Services IDs),
   - **Secret Key** (obsah souboru `.p8`),
   - **Key ID**, **Team ID**, **App Bundle ID** (z Apple účtu).
4. **Save**.

V aplikaci pak přidáš tlačítko „Přihlásit se přes Apple“ a voláš `supabase.auth.signInWithOAuth({ provider: 'apple', ... })` stejně jako u Google.

---

## Shrnutí

| Kde | Co |
|-----|-----|
| **Google** | Cloud Console → OAuth client (Web) → Redirect URI = Supabase callback → Client ID + Secret do Supabase |
| **Apple** | Developer → Services ID + Key (.p8) → údaje do Supabase |
| **Supabase** | Redirect URLs musí obsahovat produkční URL aplikace |
