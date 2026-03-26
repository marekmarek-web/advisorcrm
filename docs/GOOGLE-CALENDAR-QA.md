# Google Calendar integrace – QA a hardening

## Co bylo opraveno (PROMPT 10)

### 1. Auth guardy
- Všechny calendar API route používají `getCalendarAuth(request)` a vrací 401/403 při neautorizovaném přístupu.
- OAuth callback ověřuje CSRF (cookie `calendar_oauth_csrf` vs. state.nonce).

### 2. Token refresh flow
- **Sync route** přepracována na použití `getValidAccessToken()` místo vlastního decrypt + refresh. Jedna cesta pro refresh, konzistentní error kódy (`not_connected`, `refresh_failed`, `decrypt_failed`).
- Přidán **sdílený helper** `calendarTokenErrorResponse(e)` v `api/calendar/auth.ts` – všechny route (events GET/POST, events/[eventId], availability, sync) nyní používají jednotné chybové odpovědi pro token.

### 3. Error handling
- **GET /api/calendar/events**: validace `timeMin`/`timeMax` – při neplatném datu (NaN) vrací 400 s jasnou zprávou; kontrola, že timeMax > timeMin.
- **POST /api/calendar/events**: při selhání `db.insert` (po úspěšném vytvoření události v Google) vrací 502 s uživatelsky srozumitelnou zprávou místo nehandled exception.
- **events/[eventId]**: validace `eventId` (prázdné, délka > 256, znaky `..`, `\`, newline) → 400.
- **Frontend (openEdit)**: při chybě načtení události (GET 404/502) se zobrazí toast místo tichého ignorování.

### 4. Loading stavy
- Již dříve: createSaving, editLoading, editSaving, deletingId – tlačítka a modal se při operaci blokují.
- Žádná další úprava.

### 5. Edge cases
- Sync: parsování body timeMin/timeMax – při neplatném datu fallback na výchozí rozsah (-7 dní / +30 dní).
- GET events: timeMin/timeMax z query – invalid date → 400.

### 6. Race conditions
- Submit tlačítka jsou disabled během createSaving/editSaving; dvojité odeslání formuláře je tak znemožněno.
- Delete: po smazání se volá `fetchEvents()` a `setDeletingId(null)` v `finally` – stav UI je konzistentní.

### 7. Server/client boundaries
- Tokeny a env (GOOGLE_CALENDAR_*, INTEGRATIONS_ENCRYPTION_KEY) zůstávají pouze na serveru.
- Calendar API volání pouze z API routes; frontend volá jen `/api/calendar/*`.

### 8. Environment variables
- V `apps/web/.env.example` jsou vzorové redirect URI pro Google OAuth (lokálně v `.env.local`).
- Potřebné proměnné: `GOOGLE_CALENDAR_CLIENT_ID`, `GOOGLE_CALENDAR_CLIENT_SECRET`, `INTEGRATIONS_ENCRYPTION_KEY`.

### 9. Typing
- Žádné nové chyby; typy v route a komponentách jsou konzistentní.

### 10. Reusable abstractions
- `calendarTokenErrorResponse(e)` – jedna funkce pro mapování token chyb na Response ve všech calendar routech.

### 11. Security
- Validace `eventId` proti path traversal a příliš dlouhému vstupu.
- OAuth state obsahuje userId, tenantId, nonce; callback ověřuje cookie proti nonce.

### 12. UX
- Toast při selhání načtení události v edit modalu (místo prázdného formuláře bez zpětné vazby).
- Srozumitelné chybové hlášky z API (česky tam, kde to dává smysl).

### 13. Dead code / duplicity
- Sync route: odstraněn duplicitní kód pro refresh (decrypt + refreshAccessToken + update DB); nahrazen voláním `getValidAccessToken`.
- Sdílený token error handling snížil duplicitu v 5 souborech.

---

## Další logický krok po Google Calendar integraci

1. **Booking flow** – využití volných termínů: z výběru slotu z availability přejít k vytvoření schůzky (předvyplněný čas) a propojení s klientem; případně veřejný odkaz „Rezervuj si termín“ pro klienty.
2. **AI asistent** – napojení na kalendář: „Naplánuj schůzku s Janem Novákem příští týden“ → volání availability + create event s contactId; nebo doporučení „Máš volno ve středu 14:00“.
3. **Sync obousměrně** – při úpravě/smazání události v našem portálu aktualizovat i záznam v tabulce `events` (např. při DELETE v Google smazat nebo označit odpovídající řádek v `events`), aby detail klienta a reporty zůstaly konzistentní.
4. **Pravidelná synchronizace** – cron job (nebo na pozadí) volající sync v definovaných intervalech, aby `events` v DB odpovídaly Google kalendáři.

---

## Zbývající doporučená vylepšení (neimplementováno)

- **Rate limiting** na calendar API route (ochrana před zneužitím).
- **Retry** u volání Google API při přechodné chybě (např. 503).
- **Logování** neúspěšných token refreshů a DB insertů (např. do strukturovaného logu) pro diagnostiku.
- **Smazání lokálního eventu** při DELETE v Google – dnes se pouze maže v Google; řádek v `events` s daným `googleEventId` zůstane (sync ho při příštím běhu neaktualizuje, protože událost už v Google není). Možné: při DELETE v naší aplikaci zároveň smazat nebo označit řádek v `events`.
- **OAuth callback**: po úspěchu mazat CSRF cookie (již se maže v `redirectToSetup`).
- **E2E testy** pro kritické flow: připojení kalendáře, vytvoření události, odpojení.
