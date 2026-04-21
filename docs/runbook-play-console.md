# Google Play Console — setup pro v1.0

Podklad pro vytvoření Play Console app recordu, vyplnění Data Safety, Content Rating, store listing a upload první AAB do Internal testing.

## 1. Create app

[https://play.google.com/console](https://play.google.com/console) → **Create app**.

| Pole | Hodnota |
|------|---------|
| App name | **Aidvisora** |
| Default language | **Czech (čeština) — cs-CZ** |
| App or game | **App** |
| Free or paid | **Free** (předplatné spravujeme mimo Play) |
| Declarations | Zaškrt "Developer Program Policies" + "US export laws" |

Po vytvoření:

- **Dashboard** ukáže checklist — projdi po pořadě.

## 2. App content (pre-release questionnaires)

Levé menu → **Policy → App content**. Všechny položky musí být **Complete** předtím, než půjdeš na submit.

### 2.1 Privacy policy

```
https://www.aidvisora.cz/privacy
```

### 2.2 Ads

→ **No, my app does not contain ads.**

### 2.3 App access

→ **All or some functionality in my app is restricted.**

Přidej test credentials:

- Username: `reviewer-advisor@aidvisora.cz`
- Password: *(silné heslo, z 1Password)*
- Instructions: "Pro plný přístup k poradcovskému prostředí. Pro klientskou zónu: reviewer-client@aidvisora.cz / <heslo>."

### 2.4 Content rating

Vyplň IARC questionnaire. Pro Aidvisoru (business/finance CRM) všechno **No**, výsledkem je **Everyone / PEGI 3 / USK 0**.

Klíčové otázky:

- Violence: **No**
- Sexual content: **No**
- Profanity: **No**
- Controlled substances: **No**
- Gambling: **No**
- User-generated content: **Yes** (klient/poradce nahrávají dokumenty). Pak přidej moderation policy — viz `/privacy` a `/terms`.
- Does the app collect personal information? **Yes** — odkaz na privacy policy.
- Does the app share info with third parties? **Yes** (Supabase, Sentry, AI providers — pro provoz služby).

### 2.5 Target audience

| Pole | Hodnota |
|---|---|
| Age groups | **18 and over** |
| Appeals to children? | **No** |
| Mixed audience warning? | **N/A** (příklad: finanční data dětí do 18 nezpracováváme) |

### 2.6 News app

→ **No** (není to news app).

### 2.7 COVID-19 contact tracing and status app

→ **No**.

### 2.8 Data safety

**Tvrdý blocker.** Vyplň kompletně.

#### 2.8.1 Data collection and security — společné otázky

- "Does your app collect or share any of the required user data types?" → **Yes**
- "Is all of the user data collected by your app encrypted in transit?" → **Yes**
- "Do you provide a way for users to request that their data is deleted?" → **Yes** (mají právo přes `/portal/setup` nebo e-mail support@aidvisora.cz)
- "Committed to following Google Play Families policy?" → **N/A** (aplikace není určena pro děti).

#### 2.8.2 Data types — vyplnění

Pro každý typ volíš:

- **Collected** / **Shared**
- **Optional** vs **Required**
- **Processed ephemerally** (pokud ne, trvalé úložiště)
- **Purposes** (checkboxy)

| Data Type | Collected | Shared | Optional? | Ephemeral? | Purposes |
|---|---|---|---|---|---|
| **Personal info** | | | | | |
| Name | Yes | No | Required | No | Account management, App functionality |
| Email address | Yes | No | Required | No | Account management, App functionality, Customer support, Developer communications |
| User IDs | Yes | No | Required | No | Account management, App functionality, Analytics |
| Address | Yes (fakturace, volitelná) | No | Optional | No | Account management |
| Phone number | Yes (volitelné) | No | Optional | No | Account management |
| Race and ethnicity | No | — | — | — | — |
| Political or religious beliefs | No | — | — | — | — |
| Sexual orientation | No | — | — | — | — |
| Other info | No | — | — | — | — |
| **Financial info** | | | | | |
| User payment info | No | No | — | — | — (Stripe Checkout jen na webu, karty nikdy neprocházejí Play buildem) |
| Purchase history | No | No | — | — | — |
| Credit info | No | — | — | — | — |
| Other financial info | Yes (produktové metadata klientů — pojistky, investice, úvěry) | No | Required | No | App functionality |
| **Health and fitness** | | | | | |
| Health info | No | — | — | — | — |
| Fitness info | No | — | — | — | — |
| **Messages** | | | | | |
| Emails | No | — | — | — | — (nenahráváme uživatelské emaily, Gmail OAuth pracuje mimo Data Safety) |
| SMS or MMS | No | — | — | — | — |
| Other in-app messages | Yes (zprávy mezi poradcem a klientem) | No | Required | No | App functionality |
| **Photos and videos** | | | | | |
| Photos | Yes (dokumenty naskenované kamerou) | No | Required | No | App functionality |
| Videos | No | — | — | — | — |
| **Audio files** | No | — | — | — | — |
| **Files and docs** | | | | | |
| Files and docs | Yes (uploadované PDF / obrázky / dokumenty) | No | Required | No | App functionality |
| **Calendar** | No | — | — | — | — |
| **Contacts** | No | — | — | — | — |
| **App activity** | | | | | |
| App interactions | Yes (PostHog events) | No | Optional | No | Analytics, App functionality |
| In-app search history | No | — | — | — | — |
| Installed apps | No | — | — | — | — |
| Other user-generated content | Yes (poznámky, úkoly, klientský spis) | No | Required | No | App functionality |
| Other actions | No | — | — | — | — |
| **Web browsing** | No | — | — | — | — |
| **App info and performance** | | | | | |
| Crash logs | Yes (Sentry) | No | Required | No | App functionality, Analytics |
| Diagnostics | Yes (Sentry perf) | No | Required | No | Analytics |
| Other app performance | No | — | — | — | — |
| **Device or other IDs** | | | | | |
| Device or other IDs | Yes (push token, platform id pro routing) | No | Required | No | App functionality |

**Sharing note:** Žádný řádek nemá `Shared = Yes`, protože subprocesory (Supabase, Sentry, AI providers) jsou v Google Play Data Safety interpretované jako **service providers**, ne "sharing for commercial purposes". Pokud by Google v review chtěl přepsat → reklasifikuj na Shared a v Purposes přidej "App functionality".

### 2.9 Government apps

→ **No**.

### 2.10 Financial features

Pokud Play Console zobrazí otázku ohledně "financial features" (v 2026 to zobrazuje u appek v Finance kategorii):

- "Does your app offer financial products or services?" → **Informational only** (pokud je k dispozici).
- Zvol **Business tool** nebo nejblíže "CRM / tool for professionals".
- **Nezaklikni** "brokerage / trading / direct purchase" — Aidvisora tyto funkce neposkytuje.

## 3. Store listing

Levé menu → **Grow → Store presence → Main store listing**.

### 3.1 App details

| Pole | Hodnota |
|---|---|
| App name | **Aidvisora** |
| Short description (max 80) | **Moderní CRM pro finanční poradce. AI asistent, skener dokumentů, klientský portál.** |
| Full description (max 4000) | *(viz níže)* |

### 3.2 Full description (CS)

```
Aidvisora je moderní CRM a klientský portál pro finanční poradce a jejich týmy. Pokryje celý váš denní workflow v jedné přehledné aplikaci.

CO UMÍ APLIKACE
• Přehled klientů, produktů a portfolia (pojistky, investice, úvěry, penze, hypotéky).
• AI asistent — sumarizuje dokumenty, připravuje drafty úkolů, hledá souvislosti v klientském spisu.
• Skenování dokumentů kamerou s automatickým oříznutím a exportem do PDF.
• Klientská zóna — klient vidí přehled svých produktů a posílá poradci požadavky, dokumenty, dotazy.
• Týmová spolupráce — sdílené pohledy, produkce, KPI, manažerské reporty.
• Gmail a Google Drive integrace.
• Push upozornění (plně podporováno v budoucí verzi této aplikace pro Android).

BEZPEČNOST A SOUKROMÍ
• Autentifikace přes Supabase s volitelnou dvoufaktorovou ochranou.
• Data jsou šifrovaná při přenosu i v klidu.
• Aplikace nesbírá reklamní identifikátory a nepoužívá tracking napříč aplikacemi.

PŘEDPLATNÉ
Správu předplatného, faktur a platebních metod provádějte na webu www.aidvisora.cz. V aplikaci si zobrazíte stav svého předplatného.

PODPORA
support@aidvisora.cz nebo podpora@aidvisora.cz
www.aidvisora.cz
```

### 3.3 Graphics assets

| Asset | Požadavek | Zdroj |
|---|---|---|
| App icon | 512 × 512 px, PNG, 32-bit (alpha OK) | Odvoď z `apps/web/ios/App/App/Assets.xcassets/AppIcon.appiconset/AppIcon-512@2x.png` (jen resize na 512). |
| Feature graphic | 1024 × 500 px, JPG/PNG 24-bit (no alpha) | Vyrobit v Figmě — brand barvy, claim "CRM pro finanční poradce" + screenshot / gradient. |
| Phone screenshots | min. 2, max. 8, 1080 × 1920 až 7680 × 7680, 16:9 nebo 9:16 | 6 kusů (viz iOS runbook sekce 5). |
| 7-inch tablet screenshots | Optional | Skip pro v1.0. |
| 10-inch tablet screenshots | Optional | Skip pro v1.0. |
| Promo video (YouTube URL) | Optional | Skip pro v1.0. |

### 3.4 Tags

V sekci **Store listing** → **Tags**: vyber **3 tagy** nejlépe odpovídající appce. Doporučeno: **Business**, **Productivity**, **Finance**.

### 3.5 Categorization

- Application type: **Applications**
- Category: **Business**

### 3.6 Contact details

| Pole | Hodnota |
|---|---|
| Email | `support@aidvisora.cz` |
| Phone | *(volitelné)* |
| Website | `https://www.aidvisora.cz` |
| Privacy policy | `https://www.aidvisora.cz/privacy` |

## 4. Testing tracks

Doporučený flow: **Internal testing → Closed testing → Open testing / Production**.

### 4.1 Internal testing

- Setup → **Testing → Internal testing → Create new release**.
- Upload `app-release.aab` (podepsaný upload keyem).
- Play Console ti nabídne **Play App Signing** — akceptuj (Google přegeneruje app signing key, ty dál používáš svůj upload key k upload AAB).
- Add testers: max. 100 e-mailů v seznamu nebo Google Group. Stačí do začátku interní tým.
- Release notes (CS):
  ```
  První interní verze pro smoke test před Closed testing.
  ```

### 4.2 Closed testing (po úspěšném Internal smoke)

- **Testing → Closed testing → Create track**.
- Jméno tracku: `alpha`.
- Max. 20–50 externích testerů (kolegové z brance, pilot zákazníci).
- Min. **14 dní** s alespoň **12 testery** (Google vyžaduje před Production), pokud zakládáš **osobní** dev účet (pro Personal Developer Account od listopadu 2023).
  - **Pro Organization account** (doporučeno pro Aidvisora s.r.o.): tento požadavek **neplatí** — Production lze spustit přímo z Internal/Closed.

### 4.3 Production

Až po smoke testu (viz [`runbook-release.md`](runbook-release.md)).

## 5. App signing

Při prvním uploadu Play nabídne:

- **Use Play App Signing (recommended).**

Akceptuj. Google si z tvého AAB odvodí app signing cert, ty si dál držíš upload key (viz [`runbook-signing.md`](runbook-signing.md)).

Pokud bys v budoucnu potřeboval vygenerovat APK pro Huawei AppGallery nebo Samsung Galaxy Store, můžeš to udělat z Play Console z "App Bundle Explorer" a exportovat už podepsaný APK.

## 6. Permissions declarations

Pokud Play zdetekuje v manifestu oprávnění typu **MANAGE_EXTERNAL_STORAGE**, **READ_MEDIA_**, **POST_NOTIFICATIONS** atd., vyplní ti automaticky dotazník. Pro Aidvisoru v manifestu ([`AndroidManifest.xml`](../apps/web/android/app/src/main/AndroidManifest.xml)):

- `INTERNET` — implicit.
- `CAMERA` — "The camera is used to scan documents and photograph attachments for client files."
- `POST_NOTIFICATIONS` — "Push notifications alert advisors to new client requests and messages."

Žádné nebezpečné permissiony nad rámec. Special permission questionnaire by neměl vyskočit.

## 7. Submission checklist

- [ ] App record vytvořen, package `cz.aidvisora.app` alokovaný.
- [ ] Data Safety kompletně vyplněná.
- [ ] Content Rating questionnaire → IARC cert vygenerovaný.
- [ ] Target Audience = 18+ only.
- [ ] Privacy Policy URL aktivní (`/privacy` MUSÍ obsahovat novou sekci 13 — už je).
- [ ] Store listing: Short description, Full description CS, App icon 512×512, Feature graphic 1024×500, 6 screenshotů.
- [ ] Contact details vyplněné.
- [ ] Internal testing track vytvořený + první AAB uploadovaný.
- [ ] Play App Signing akceptovaný.
- [ ] Internal smoke test proveden (viz [`runbook-release.md`](runbook-release.md)).
- [ ] Submit Closed testing → po 3–5 dnech stabilního testu **Submit to Production**.

## 8. Odhad času

- Vyplnění Play Console (všechny sekce) = **2–3 hodiny** (s hotovými texty a screenshoty).
- Screenshot + Feature graphic v Figmě = **0.5 dne** (bonus pokud už jsou iOS screens, Android reuse frame).
- Internal testing setup + upload = **1 hodina**.
- Play review pro Internal testing = **hodin až 1 den**.
- Play review pro Production = **1–3 dny** (rychlejší než Apple).
