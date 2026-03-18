# Aidvisor Mobile App (Capacitor Phase 1)

## Co je implementovano

Aidvisor bezi jako jedna codebase:

- Web: standardni Next.js app (`apps/web`)
- iOS/Android: Capacitor shell s WebView nad stejnou serverovou URL

V Phase 1 pouzivame **remote URL mode**. Native app nenačita staticky export Next.js, ale otevre nasazeny web server (SSR + API + middleware + auth zustava beze zmeny).

## Proc remote URL mode

Aplikace pouziva:

- Next.js App Router (server components)
- API routes
- middleware auth guardy
- server-side session handling

Tyto casti by pri statickem exportu nefungovaly. Remote URL mode je nejcistsi a nejmensi zasah.

## Predpoklady

- Node.js 20+
- `pnpm`
- iOS: Xcode + CocoaPods (macOS)
- Android: Android Studio + SDK

## Dulezite soubory

- `apps/web/capacitor.config.ts` - centralni Capacitor konfigurace
- `apps/web/capacitor-app/index.html` - fallback/loading webDir
- `apps/web/src/lib/capacitor/platform.ts` - runtime platform utilities
- `apps/web/src/lib/capacitor/useNativePlatform.ts` - React hook pro klientsky kod

## Lokalne spusteni webu

Z rootu repozitare:

```bash
pnpm dev
```

Nebo primo pro web app:

```bash
pnpm --filter web dev
```

## iOS workflow

1) Spustit web server:

```bash
pnpm --filter web dev
```

2) Syncnout Capacitor projekt na lokalni URL:

```bash
pnpm --filter web cap:dev
```

3) Otevrit iOS projekt:

```bash
pnpm --filter web cap:open:ios
```

4) V Xcode vybrat simulator/device a Run.

## Android workflow

1) Spustit web server:

```bash
pnpm --filter web dev
```

2) Syncnout Capacitor projekt na lokalni URL:

```bash
pnpm --filter web cap:dev
```

3) Otevrit Android projekt:

```bash
pnpm --filter web cap:open:android
```

4) V Android Studio vybrat emulator/device a Run.

## Produkcni build + sync

V Phase 1 app shell cte URL z `CAPACITOR_SERVER_URL`.

- Pokud promenna neni nastavena, default je `https://www.aidvisora.cz`.
- Pro produkcni sync lze pouzit:

```bash
pnpm --filter web cap:sync
```

Pri zmene `capacitor.config.ts`, pluginu nebo web fallback assets vzdy znovu spustte `cap:sync`.

## Auth a session v mobile shellu

- Login flow zustava stejny jako na webu.
- Session/cookies zustavaji funkcni (WebView beha na stejne origin URL).
- Middleware a server-side auth logika se nemeni.

Poznamka: Google OAuth v embedded WebView muze byt omezeny policy Google. Toto je planovano na Phase 2 (native sign-in nebo system browser flow).

## Minimal native UX poznamky (TODO pro dalsi faze)

- TODO: finalni `appId` (bundle/application id)
- TODO: app ikony a splash assets
- TODO: status bar plugin konfigurace

## Otevrene body pro Phase 2

- Native Google Sign-In nebo OAuth pres system browser
- Push notifikace
- Deep linking / universal links / app links
- Share target
- Kamera/scan flow
- Offline UX a retry strategie
- CI/CD build pipeline pro App Store a Google Play
