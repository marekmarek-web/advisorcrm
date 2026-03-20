# Phase 6 – WebView bridge + mobile kalendář + klientská AI podpora v shellu

## Cíl vlny

- Doplnit **produkční mobilní kalendář** v advisor `MobilePortalClient` (URL `/portal/calendar`, deep-link pod mobile flagem).
- Zavést **jednotný WebView/native bridge** pro směrové události (`route`, `ready`) pro budoucí app wrappery.
- Integrovat **AI podporu** do klientského mobilního shellu s pozicováním nad bottom nav / FAB.

## Nové / upravené soubory

| Oblast | Soubor |
|--------|--------|
| Bridge | `apps/web/src/app/shared/mobile-ui/webview-bridge.ts` |
| Kalendář | `apps/web/src/app/portal/mobile/screens/CalendarMobileScreen.tsx` |
| Advisor shell | `apps/web/src/app/portal/mobile/MobilePortalClient.tsx`, `MobilePortalApp.tsx` |
| Client shell | `apps/web/src/app/client/mobile/ClientMobileClient.tsx`, `ClientMobileApp.tsx` |
| AI tlačítko | `apps/web/src/app/client/AiSupportButton.tsx` (prop `anchorClassName`) |

## Chování kalendáře (mobile)

- Načte události přes `listEvents` (~62 dní dopředu od dnešního dne).
- Filtry: Dnes / 7 dní / celé okno.
- Karty: čas, typ, klient (odkaz na profil), místo.
- Bottom sheet **Nová schůzka** → `createEvent` (vyžaduje oprávnění zápisu).

## WebView bridge

- Odchozí zprávy mají `source: "aidvisora-web"`.
- Typy: `route` (pathname + search), `ready` (href).
- Kanály: `window.parent.postMessage`, `window.ReactNativeWebView.postMessage` (JSON string), `webkit.messageHandlers.aidvisora`.

## QA (stručně)

- [ ] `/portal/calendar` na mobilu + beta cookie zobrazí mobile kalendář, ne desktop `PortalCalendarView`.
- [ ] Zpět z kalendáře vede do Menu (Nastavení hub).
- [ ] Klient: AI podpora nezakrývá bottom nav; FAB zůstane použitelný.
- [ ] Native: při navigaci v aplikaci přichází `route` eventy.
