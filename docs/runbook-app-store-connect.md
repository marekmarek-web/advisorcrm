# App Store Connect — setup pro v1.0

Podklad pro vyplnění App Store Connect recordu, Privacy Labels, metadata a screenshots. Každá sekce obsahuje **přesné texty k vložení** + rozhodovací tabulky.

## 1. Create App record

[https://appstoreconnect.apple.com/apps](https://appstoreconnect.apple.com/apps) → **+ → New App**

| Pole | Hodnota |
|------|---------|
| Platform | iOS |
| Name | **Aidvisora** |
| Primary Language | **Czech** |
| Bundle ID | `cz.aidvisora.app` (musí být registrovaný v Apple Developer → Identifiers) |
| SKU | `aidvisora-app-cz` |
| User Access | Full Access |

Po vytvoření app recordu:

- **App Information** → Category: **Business** (primary), **Finance** (secondary).
- **Age Rating:** 4+ (žádný objectionable content, žádné gambling, žádné adult).
- **Copyright:** `© 2026 Aidvisora s.r.o.`

## 2. Pricing and Availability

| Pole | Hodnota |
|------|---------|
| Price | **Free** (aplikace je zdarma, předplatné se spravuje mimo App Store) |
| Availability | **All Countries or Regions** (nebo jen CZ + SK, dle strategie) |

**Důležité:** V sekci **App Distribution methods** musí být **Public App Store** (ne B2B / Custom App). Pokud bys v budoucnu šel přes custom distribution, změna je jednosměrná.

## 3. App Privacy (Privacy Nutrition Labels)

Toto je **tvrdý blocker** pro submit. App Store Connect → levý sloupec → **App Privacy → Get Started**.

### 3.1 Does this app collect data?

→ **Yes, we collect data from this app**.

### 3.2 Kategorie sbíraných dat

Projdi každou skupinu a vyber Yes/No podle tabulky níže. Pro každý **Yes** potom ASC vyzve doplnit účel (**Purposes**) a zda je linkovaný s uživatelem (**Linked to User**) a zda se používá k trackingu napříč appkami (**Tracking**).

| Category | Typ | Sbíráme? | Linked to User | Tracking | Účel |
|---|---|---|---|---|---|
| **Contact Info** | Name | Yes | Yes | No | App Functionality, Customer Support |
| | Email Address | Yes | Yes | No | App Functionality, Customer Support, Product Personalization |
| | Phone Number | Yes (jen pokud poradce vyplní) | Yes | No | App Functionality |
| | Physical Address | Yes (fakturační pro B2B) | Yes | No | App Functionality |
| **User Content** | Emails or Text Messages | No | — | — | — |
| | Photos or Videos | Yes (naskenované dokumenty) | Yes | No | App Functionality |
| | Audio Data | No | — | — | — |
| | Customer Support | Yes | Yes | No | Customer Support |
| | Other User Content | Yes (dokumenty, poznámky, klientská data) | Yes | No | App Functionality |
| **Identifiers** | User ID | Yes (Supabase uuid) | Yes | No | App Functionality, Analytics |
| | Device ID | Yes (push token, device identifier pro routing) | Yes | No | App Functionality |
| **Usage Data** | Product Interaction | Yes (PostHog events uvnitř WebView) | Yes | No | Analytics, Product Personalization |
| | Advertising Data | No | — | — | — |
| | Other Usage Data | No | — | — | — |
| **Diagnostics** | Crash Data | Yes (Sentry) | Yes | No | App Functionality, Analytics |
| | Performance Data | Yes (Sentry, pageload) | Yes | No | Analytics |
| | Other Diagnostic Data | No | — | — | — |
| **Financial Info** | Payment Info | No (Stripe Checkout jen na webu, card detaily nikdy neprocházejí naší appkou) | — | — | — |
| | Credit Info | No | — | — | — |
| | Other Financial Info | Yes (produktový portfolio klientů: pojistky, investice, úvěry — metadata, ne reálné transakce) | Yes | No | App Functionality |
| **Location** | Precise Location | No | — | — | — |
| | Coarse Location | No | — | — | — |
| **Sensitive Info** | Sensitive Info | No (žádné zdravotní, rasové, politické) | — | — | — |
| **Contacts** | Contacts | No | — | — | — |
| **Browsing History** | Browsing History | No | — | — | — |
| **Search History** | Search History | No | — | — | — |
| **Health & Fitness** | Health, Fitness | No | — | — | — |
| **Other Data** | Other Data Types | No | — | — | — |

**Key otázky z ASC dialogu:**

- "Do you or your third-party partners use data for tracking?" → **No** (žádný tracking přes SDK, žádné advertising IDs, žádný cross-app tracking).
- "Data collected from this app is linked to the user's identity?" → **Yes** pro všechny kategorie výše (Supabase auth).

### 3.3 Privacy Policy URL

```
https://www.aidvisora.cz/privacy
```

## 4. Version Information (v1.0)

### 4.1 App Name + Subtitle

- **Name:** `Aidvisora`
- **Subtitle (max 30):** `CRM pro finanční poradce` (CS i EN, Apple nepovolí separátně, Subtitle je per-locale)

### 4.2 Promotional Text (max 170, per-locale, změnitelný bez review)

**CS:** "Moderní CRM a klientský portál pro finanční poradce. AI asistent, skenování dokumentů, týmová spolupráce a přehled produktů klientů v jedné aplikaci."

**EN:** "Modern CRM and client portal for financial advisors. AI assistant, document scanning, team collaboration and client product overview in one app."

### 4.3 Description (max 4000, per-locale)

**CS:**

```
Aidvisora je moderní CRM a klientský portál pro finanční poradce a jejich týmy. Pokryje celý váš denní workflow v jedné přehledné aplikaci.

CO UMÍ APLIKACE

• Přehled klientů, produktů a portfolia — pojistky, investice, úvěry, penze, hypotéky — metadata, stavy a připomínky na jednom místě.
• AI asistent — sumarizuje dokumenty, připravuje drafty úkolů, hledá souvislosti v klientském spisu.
• Skenování dokumentů kamerou — automatické oříznutí, export do PDF, uložení přímo do klientského spisu.
• Klientská zóna — klient vidí svůj přehled produktů a může poradci posílat požadavky, dokumenty a dotazy.
• Týmová spolupráce — sdílené pohledy, produkce, KPI, manažerské reporty.
• Gmail a Google Drive integrace — e-mailová komunikace a dokumenty přímo v kontextu klienta.
• Push upozornění na nové zprávy, požadavky a připomínky.

BEZPEČNOST A SOUKROMÍ

• Autentifikace přes Supabase s volitelnou dvoufaktorovou ochranou.
• Data jsou šifrovaná při přenosu i v klidu.
• Aplikace nesbírá reklamní identifikátory a nepoužívá tracking napříč aplikacemi.

PŘEDPLATNÉ A SPRÁVA ÚČTU

Správu předplatného, faktur a platebních metod provádějte na webu www.aidvisora.cz. V aplikaci si zobrazíte stav svého předplatného.

PODPORA

support@aidvisora.cz nebo podpora@aidvisora.cz
www.aidvisora.cz
```

**EN:**

```
Aidvisora is a modern CRM and client portal for financial advisors and their teams. It covers your entire daily workflow in a single, focused app.

WHAT THE APP DOES

• Clients, products, and portfolio overview — insurance, investments, loans, pension, mortgages — metadata, states, and reminders in one place.
• AI assistant — summarizes documents, drafts tasks, finds context in the client file.
• Document scanner — camera scan with automatic cropping, PDF export, stored straight into the client file.
• Client portal — clients see their product overview and send requests, documents, and questions to their advisor.
• Team collaboration — shared views, production, KPIs, management reports.
• Gmail and Google Drive integration — email and files in client context.
• Push notifications for new messages, requests, and reminders.

SECURITY AND PRIVACY

• Authentication via Supabase with optional two-factor.
• Data encrypted in transit and at rest.
• No advertising identifiers, no cross-app tracking.

SUBSCRIPTION

Manage your subscription, invoices, and payment methods on www.aidvisora.cz. The app displays the current subscription status.

SUPPORT

support@aidvisora.cz or podpora@aidvisora.cz
www.aidvisora.cz
```

### 4.4 Keywords (max 100 chars, per-locale, comma-separated)

**CS:** `poradce,finance,CRM,pojištění,investice,hypotéka,úvěr,klient,portál,skener`

**EN:** `advisor,finance,CRM,insurance,investment,mortgage,loan,client,portal,scanner`

### 4.5 Support URL + Marketing URL + Privacy Policy URL

| Pole | Hodnota |
|---|---|
| Support URL | `https://www.aidvisora.cz/podpora` (nebo `/kontakt`) |
| Marketing URL | `https://www.aidvisora.cz` |
| Privacy Policy URL | `https://www.aidvisora.cz/privacy` |

Ověř, že všechny tyto URL existují a jsou veřejně dostupné **bez přihlášení**. App Reviewer testuje klikem.

### 4.6 Copyright

`© 2026 Aidvisora s.r.o.`

### 4.7 Contact Information (App Review Contact, ne veřejné)

| Pole | Hodnota |
|---|---|
| First Name | *(jméno ownera)* |
| Last Name | *(příjmení ownera)* |
| Phone | *(telefon pro Apple reviewera)* |
| Email | `support@aidvisora.cz` |

## 5. Screenshots

### Povinné velikosti

Apple vyžaduje pro iPhone **6.7" / 6.9"** display (iPhone 15 Pro Max / 16 Pro Max). Doporučené rozlišení: **1290 × 2796** (nebo **1320 × 2868** pro 16 Pro Max). Minimum **3 screeny**, doporučeno **6–8**.

iPad: pokud `LSRequiresIPhoneOS=true` (a je — viz `Info.plist`), iPad screenshoty **nejsou povinné**. Ověř v Submit flow, pokud by Apple vyžadoval, fallback je zobrazit iPhone screens v iPad mode.

### Doporučená sekvence screenshotů (6 kusů)

1. **Dashboard / Today** — přehled úkolů, schůzek, notifikací (první dojem).
2. **Client detail** — portfolio klienta s produkty.
3. **Scanner** — skenování dokumentu kamerou.
4. **AI assistant** — chat s AI o klientovi.
5. **Client portal** — klientská zóna jak ji vidí klient.
6. **Team overview / KPI** — pro showcase Management tieru.

### Jak je vyrobit rychle

Varianty:

a) **Screenshots z reálného TestFlight buildu** — nejlevnější, stačí screenshot tool z iPhonu (16 Pro Max pokud máš).

b) **Fastlane snapshot** nebo **Screenshots.app** — automatizované, ale pro v1.0 overkill.

c) **Marketing screenshoty s framem + textem** (Figma / Canva) — zaberou půl dne, ale vizuálně lepší a konzistentní s landing page. Drž jednotný font a barvy s [`PremiumLandingPage.tsx`](../apps/web/src/app/components/PremiumLandingPage.tsx).

### Text v overlay (doporučeno ke screenshotu, krátký claim)

1. "Celý den v jednom přehledu"
2. "Klient a jeho portfolio"
3. "Naskenuj dokument kamerou"
4. "AI asistent pro každého poradce"
5. "Klientská zóna pro vaše klienty"
6. "Týmová výkonnost v reálném čase"

## 6. App Previews (video, optional)

Přeskoč pro v1.0. Jsou nice-to-have, ne povinné.

## 7. TestFlight — External testers

Přeskočit pokud chceš jít rovnou na submit. Interní TestFlight stačí pro smoke test (viz [`runbook-release.md`](runbook-release.md)).

## 8. App Review Information

### 8.1 Demo Account

| Pole | Hodnota |
|---|---|
| Sign-in required | **Yes** |
| Username | `reviewer-advisor@aidvisora.cz` *(vytvoř před submitem)* |
| Password | *(silné heslo v 1Password)* |
| Additional information | *(viz Notes)* |

Současně připrav druhý účet pro klientskou zónu:

- `reviewer-client@aidvisora.cz` — přihlášení do `/client` zóny.

Ověř, že oba účty mají předvyplněná testovací data (min. 3 klienti u advisora, 2–3 produkty u klienta, 1 pending request).

### 8.2 Notes (text pro App Reviewera)

```
Aidvisora je hybridní aplikace postavená nad platformou Capacitor. Vlastní obsah se načítá ze zabezpečeného webového rozhraní www.aidvisora.cz v nativním WebView. Architektura umožňuje sdílet stejnou business logiku a kvalitu UX mezi webem a mobilní aplikací při zachování nativních schopností zařízení (kamera, push notifikace, share extension, deep linky).

NATIVNÍ FUNKCE:
- Kamera a Document Scanner (autocrop, export do PDF).
- Push notifikace přes APNs (upozornění na zprávy od klientů).
- Share Extension (přijetí PDF nebo obrázku z jiné aplikace).
- Deep linky s custom schematem aidvisora:// pro návrat z OAuth (Google, Apple).
- Biometrické přihlášení (Face ID / Touch ID) je připraveno na v1.1.

PŘIHLÁŠENÍ (TESTOVACÍ ÚČET):
• Advisor: reviewer-advisor@aidvisora.cz / <heslo>
• Klient: reviewer-client@aidvisora.cz / <heslo>
Doporučujeme ověřit obě role.

SIGN IN WITH APPLE:
Apple je dostupný jako Sign in option (tlačítko "Apple" na obrazovce přihlášení).

PŘEDPLATNÉ:
V mobilní aplikaci není žádná cesta k zahájení nebo změně placeného předplatného. Aplikace zobrazuje pouze status existujícího předplatného. Správa probíhá výhradně na webu www.aidvisora.cz. Důvod: respektování App Store Review Guideline 3.1.1 — jsme B2B/B2C SaaS s předplatným, které se sjednává mimo mobilní aplikaci.

DEEP LINK TEST:
Custom scheme aidvisora://auth/callback se používá při OAuth návratu ze Safari Custom Tab. Můžete test na iPhone Simulator příkazem:
  xcrun simctl openurl booted "aidvisora://auth/callback?code=test"

KONTAKT:
support@aidvisora.cz
```

## 9. Export Compliance

App Store Connect → Version → **Export Compliance**:

- "Does your app use encryption?" → **Yes**
- "Does your app qualify for any exemptions in Category 5 Part 2?" → **Yes, standard encryption (HTTPS)**
- Po odeslání se v `Info.plist` nastaví `ITSAppUsesNonExemptEncryption = false` (už je v projektu — ověř v [`Info.plist`](../apps/web/ios/App/App/Info.plist)).

## 10. Content Rights

- "Does your app contain, show, or access third-party content?" → **No** (naše vlastní content, user-generated od zákazníků, subprocesory).

## 11. Ads

"Does your app contain third-party advertisements?" → **No**.

## 12. Submission checklist

- [ ] App record vytvořen, Bundle ID přiřazen.
- [ ] App Icon 1024×1024 uploadovaná (`AppIcon-512@2x.png` je v repu).
- [ ] Screenshots 6.7"/6.9" × 6 kusů uploadované.
- [ ] Name, Subtitle, Description, Keywords v CS i EN vyplněné.
- [ ] Privacy Policy URL aktivní.
- [ ] Age Rating 4+.
- [ ] App Privacy Labels kompletně vyplněné (sekce 3.2).
- [ ] Export Compliance = Yes + HTTPS only.
- [ ] Category: Business + Finance.
- [ ] Pricing: Free, regiony zvoleny.
- [ ] Demo account credentials uvedené, otestované.
- [ ] Review notes (sekce 8.2) vyplněné.
- [ ] TestFlight build přidaný k verzi a prošel TestFlight Beta Review.
- [ ] **Submit for Review**.

## 13. Odhad času

- Vyplnění ASC = **3–5 hodin** (s hotovými texty a screenshoty).
- Screenshot výroba = **1 den** (pokud jdeš přes Figmu framy).
- TestFlight Beta Review = **24–48 h**.
- App Review = **24–72 h** typicky, až **7 dní** v edge case.
- První submit má **~40 % šanci na reject**; přičti 1 rework round = **+3–5 dní**.
