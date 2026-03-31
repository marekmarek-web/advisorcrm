# Mobilní UX / QA průchod — iOS a Android (Capacitor)

Dokument doplňuje plán P0 stabilizace. Slouží jako **checklist a backlog** pro manuální ověření na zařízeních a emulátorech. Po nasazení fixů znovu projít řádky v sekci „Po opravách“.

## Prostředí

| Prostředí   | URL / build        | Poznámka                          |
|------------|--------------------|-----------------------------------|
| Produkce   | www.aidvisora.cz   | Primární reprodukce uživatelských hlášení |
| Staging    | dle nasazení       | Potvrzení oprav před produkcí     |

## Platformy

- **iOS:** Capacitor (Xcode Simulator + fyzické zařízení), ověřit také chování po redirectu z přihlášení (`allowNavigation` / WebView).
- **Android:** Capacitor (emulátor + zařízení), Chrome WebView.

## Matice flow (projít obě platformy)

| Modul | Cesta | P0 kontroly |
|-------|--------|-------------|
| Přehled | `/portal/today` | Rychlé první KPI; žádný nekonečný skeleton; AI widget neblokuje hlavní vlákno |
| Úkoly | `/portal/tasks` | Seznam po startu; badge; vytvoření úkolu |
| Klienti | `/portal/contacts` | Seznam, detail, nový klient |
| Obchody | `/portal/pipeline` | Seznam, přesun fáze (vyžaduje `ensureDefaultStages`) |
| Finanční analýzy | `/portal/analyses`, `/portal/analyses/financial` | Nová analýza, uložení bez klienta, Viewer/Advisor oprávnění, chybové hlášky |
| Sken | `/portal/scan` | Náhled + upload **bez** vybraného klienta; quick upload |
| Dokumenty | `/portal/documents` | Viditelnost dokumentů bez `contactId` |
| AI (web drawer) | Floating AI v desktop/mobile web shell | Panel nepřekrývá celý viewport; lze dostat k hlavnímu menu |
| AI (mobil app) | `/portal/ai` | Scroll historie nahoru; klávesnice + viewport |
| Kalkulačky | `/portal/calculators/...` | Investice: dock + vstupy na malé výšce obrazovky |
| Přihlášení | `/prihlaseni` | Žádný skok do Safari mimo WebView (iOS) |

## Prioritizovaný backlog (stav k poslední iteraci kódu)

### P0 — blokery / kritické

1. **Client-side exception na produkci** — sledovat konzoli Safari/WebView a Vercel logy; `portal/error.tsx` zobrazuje uživatelsky srozumitelnou zprávu pro RSC chyby.
2. **Finanční analýza** — ověřit role Viewer + Advisor: `financial_analyses:read/write` v `rolePermissions`; při chybě musí UI ukázat přeloženou zprávu (`ERR_FA_*`).
3. **Capacitor navigace (iOS)** — `server.allowNavigation` + rozumné `server.url` (bez prefix-only path); regrese = Safari mimo appku.

### P1 — silná degradace UX

4. **Defer hydratace** — mobilní portál spouští hromadné načtení hned po mountu; hlídat počet paralelních requestů na slabší síti.
5. **Dokumenty bez klienta** — filtry ve výpisu dokumentů musí ukázat „obecné“ soubory (`misc`), jinak uživatel „ztratí“ upload.

### P2 — doladění

6. **Auto-save FA** — toast při `ERR_FA_*` max 1× / 90 s (šetření spamu); případně indikátor „Ukládám…“.
7. **AI drawer výška** — `top-[calc(var(--safe-area-top)+3.25rem)]` může na některých layoutech nesedět; sladit s reálnou výškou `.wp-portal-top-header` / `MobileHeader`.

## Po každém releasu

- [ ] Smoke na iOS (login → přehled → analýza → uložit → scan bez klienta).
- [ ] Smoke na Android (stejné).
- [ ] Zkontrolovat Sentry / logy pro `digest` / `Server Components` v prvních 24 h.
