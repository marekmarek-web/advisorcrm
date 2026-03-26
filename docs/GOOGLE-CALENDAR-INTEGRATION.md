# Google Calendar integrace

## Přehled

Poradci mohou v Nastavení → Integrace propojit svůj Google účet. Události z Google Kalendáře se synchronizují do Aidvisora (kalendář v portálu). Sync se spouští ručně tlačítkem „Sync s Google“ v kalendáři nebo v Nastavení. Hlavní kalendář (den/týden/měsíc) zobrazuje události z databáze; při připojeném Google účtu se nové/upravené/smazané události z hlavního kalendáře zároveň odesílají do Google (obousměrná vazba po syncu).

## Konfigurace

### 1. Google Cloud Console

1. Vytvořte nebo vyberte projekt na [Google Cloud Console](https://console.cloud.google.com/).
2. Povolte **Google Calendar API** (APIs & Services → Library → Calendar API → Enable).
3. V **APIs & Services → Credentials** vytvořte **OAuth 2.0 Client ID** typu „Web application“.
4. Do **Authorized redirect URIs** přidejte:
   - `http://localhost:3000/api/integrations/google-calendar/callback` (vývoj)
   - `https://www.aidvisora.cz/api/integrations/google-calendar/callback` (produkce)
5. Zkopírujte Client ID a Client Secret do proměnných prostředí.

### 2. Proměnné prostředí (apps/web)

V `.env.local` (nebo na Vercel / hostingu) nastavte:

| Proměnná | Popis |
|----------|--------|
| `GOOGLE_CALENDAR_CLIENT_ID` | OAuth 2.0 Client ID z Google Cloud Console |
| `GOOGLE_CALENDAR_CLIENT_SECRET` | OAuth 2.0 Client Secret |
| `INTEGRATIONS_ENCRYPTION_KEY` | Klíč pro šifrování tokenů (32 B hex = 64 znaků, nebo alespoň 32 znaků). Vygenerovat: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` |

Vzor je v `apps/web/.env.example` (lokálně zkopírovat do `.env.local`).

### 3. Databáze

Spusťte migrace:

- `packages/db/migrations/add_user_google_calendar_integrations.sql` – tabulka pro OAuth tokeny
- `packages/db/migrations/add_events_google_calendar_fields.sql` – sloupce `google_event_id`, `google_calendar_id` v tabulce `events`

## Tok (OAuth)

1. Uživatel v Nastavení → Integrace klikne u Google Calendar na „Připojit Google účet“ → `GET /api/integrations/google-calendar/connect`.
2. Backend ověří přihlášení a oprávnění (`events:*`), vygeneruje state (userId, tenantId, nonce) a CSRF cookie, přesměruje na Google OAuth2.
3. Uživatel se přihlásí u Google a povolí scope `calendar.events`.
4. Google přesměruje na `GET /api/integrations/google-calendar/callback?code=...&state=...`. Backend ověří CSRF, shodu session s state, vymění code za tokeny, uloží je (šifrované) do `user_google_calendar_integrations` a přesměruje na Nastavení s `?calendar=connected`.
5. V Kalendáři může uživatel kliknout na „Sync s Google“ – načtou se události z Google Calendar a vytvoří/aktualizují se záznamy v tabulce `events` (s `google_event_id`).

## Zobrazení a zápis událostí

- **Hlavní kalendář** (Portal Kalendář) načítá události ze server action `listEvents` z tabulky `events` (včetně událostí stažených ze syncu).
- **Vytvoření události** v hlavním kalendáři: pokud je Google Calendar připojen, událost se vytvoří i v Google a do `events` se uloží s `google_event_id` a `google_calendar_id`. Pokud není připojen, uloží se jen do DB.
- **Úprava / smazání** události, která má `google_event_id`: změna se provede i v Google Calendar (pokud je integrace aktivní).
- **Stav integrace** (Připojeno/Odpojeno) na stránce Nastavení → Integrace načítá `GET /api/calendar/status`; k načtení stavu stačí oprávnění `events:read` (např. role Viewer).

## OAuth cesty

- **Používejte:** `GET /api/integrations/google-calendar/connect` (a callback `/api/integrations/google-calendar/callback`). Na tyto cesty odkazuje UI.
- **Legacy:** `GET /api/calendar/oauth/start` přesměruje na `/api/integrations/google-calendar/connect`. Callback `/api/calendar/oauth/callback` zůstává funkční pro staré redirect URI.

## Bezpečnost

- Client ID a Client Secret jsou pouze na serveru (env), nikdy ne do frontendu.
- Access a refresh tokeny se ukládají šifrované (AES-256-GCM) s `INTEGRATIONS_ENCRYPTION_KEY`.
- OAuth callback ověřuje CSRF (state + cookie).
- Route `/api/integrations/google-calendar/connect` a `/api/integrations/google-calendar/callback` vyžadují přihlášení a oprávnění `events:*`. Callback navíc ověřuje, že session userId odpovídá userId ve state (ochrana proti záměně účtu).
- Access tokeny se nikdy neposílají do frontendu; používá je jen backend (sync, refresh).
