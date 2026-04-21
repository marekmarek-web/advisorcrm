# Native OAuth — Supabase Allowed Redirect URLs (Delta A20)

**Scope:** manual ENV step v Supabase Dashboard + code-level whitelist v `NativeOAuthDeepLinkBridge`.

Bez této konfigurace selže Sign in with Google / Apple z Capacitor shellu se `redirect_to is not allowed`.

---

## 1. Supabase Dashboard — Allowed Redirect URLs

**Project:** `aidvisora-prod` (a stejně tak `aidvisora-staging`).

Dashboard → Authentication → URL Configuration → **Redirect URLs**.

Přidat *přesně* tyto hodnoty (pozor na trailing slash — Supabase match je prefix-based):

```
https://aidvisora.cz/**
https://www.aidvisora.cz/**
https://aidvisora.vercel.app/**
aidvisora://auth/callback
aidvisora://auth/done
aidvisora://auth/error
```

**Proč dvojí schéma:**
- `https://...` — pro web OAuth flow (cookie-based, běžný PKCE).
- `aidvisora://auth/callback` — Capacitor (iOS + Android) po SFSafariViewController redirectu.

**Site URL** (jiné pole ve stejné obrazovce): `https://aidvisora.cz`.

### Kontrola

Po uložení konfigurace ověřit přes curl:

```bash
curl -I "https://<project-ref>.supabase.co/auth/v1/authorize?provider=google&redirect_to=aidvisora://auth/callback"
# Očekávaný status: 302 s Location hlavičkou
# Pokud 400/403 → redirect URL není whitelisted.
```

---

## 2. iOS / Android registration scheme

Skutečný handler native strany:

- **iOS:** `apps/web/ios/App/App/Info.plist` → `CFBundleURLSchemes = ["aidvisora"]` (a legacy `aidvisor`).
- **Android:** `apps/web/android/app/src/main/AndroidManifest.xml` → `<data android:scheme="aidvisora" />`.

Legacy `aidvisor:` (bez `a`) zůstává jen pro existující beta buildy. Nové verze používají výhradně `aidvisora:`.

---

## 3. Code-level whitelist v `NativeOAuthDeepLinkBridge`

Bridge přijímá pouze:

- `aidvisora:` a `aidvisor:` (ostatní schémata jsou silently dropped).
- Explicitně zpracované paths pod `host = auth`:
  - `auth/callback` — PKCE exchange.
  - `auth/error` — error propagace.
  - `auth/done` — legacy success path.
- Generic fallback — pouze do whitelisted root hosts:
  `portal`, `client`, `pricing`, `ai-review`, `proposal`, `navrhy`, `login`, `register`, `bezpecnost`, `gdpr`.

**Jakýkoliv jiný host** → bridge zaloguje warn a přesměruje na `/portal/today`.
Smyslem je zablokovat externí app, která by se pokoušela nativní shell použít jako
redirector (open redirect přes `aidvisora://admin/...` apod.).

Při rozšíření funkcionality (např. nová sekce `/reports`) **nezapomenout** whitelist rozšířit.

---

## 4. Post-launch kontrola

- [ ] Google OAuth login z iOS TestFlight → landing na `/portal/today` bez chyby.
- [ ] Google OAuth login z Android build → landing na `/portal/today`.
- [ ] Apple OAuth login z iOS (nutné pro App Store submission) → landing OK.
- [ ] Magic-link email klik v prohlížeči mobilu → otevírá v nativní appce přes Universal Link.
- [ ] Pokus o `aidvisora://admin/delete` z externí appky → blokováno, uživatel skončí na `/portal/today`.
