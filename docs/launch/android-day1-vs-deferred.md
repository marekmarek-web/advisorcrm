# Android launch — day-1 vs. deferred (Delta A16)

**Owner:** CEO / CTO / product lead.
**Stav:** ⚠ pending rozhodnutí.
**Deadline:** -7 dní před iOS public launch (aby se stihl Play Store review pokud day-1).

---

## Kontekst

Aidvisora je Capacitor hybrid app. Už máme:

- Android projekt v `apps/web/android/` (funguje v emulátoru + sideload).
- Firebase (FCM) credentials a debug/release signing.
- `AndroidManifest.xml` s App Links + deep link schemes (A12+A13).
- Capacitor plugins, které fungují cross-platform.

**Co ještě chybí pro Android day-1:**

1. **Google Play Console** publisher účet ($25 jednorázově) — pokud není.
2. **Play Data Safety** form (analog iOS Privacy Nutrition Labels) — vyplněný manifest.
3. **Content rating** questionnaire (IARC).
4. **App icon + feature graphic** v specifických Play velikostech (1024×500 feature graphic atd.).
5. **Target API level 34+** (Android 14) — ověřit `compileSdk` v `build.gradle`.
6. **Signing key** v safe storage (1 ztracený signing key = ztraceno publikační právo navždy).
7. **Internal testing track** nastavený, reviewer credentials zadány (A27).
8. **Device compatibility matrix** — alespoň Android 10+, test na Samsung S21/S22, Pixel 6+.

**Risk:** Google Play reviewer je rychlejší než Apple (typicky 1–3 dny vs. 1–2 týdny), ale
**odmítnutí je tvrdší** — Data Safety form je přísný a porušení znamená takedown + fine.

---

## Varianta A — Android day-1 (současně s iOS)

**Pro:**
- Jedna marketing kampaň, jeden launch video, jeden press announcement.
- 35 % CZ users má Android (silný pokles za last 5 let, ale pořád 1/3 trhu).
- Jistota, že hybrid build funguje na obou platformách → preventujeme "only on iOS" bug reports.

**Proti:**
- **+3–5 dní práce na Play Data Safety form, content rating, screenshots.**
- Android signing key management — pokud zapomeneme na key escrow, jsme v mrtvé vodě.
- Potřebujeme separátní App Review seed tenant workflow (A27 covers obě platformy).
- Každá incident response musí počítat se dvěma store takedown scénáři.

**Pracnost:** ~4–6 člověko-dní navíc před launch.

---

## Varianta B — Android deferred (+2–6 týdnů)

**Pro:**
- Odsunuté platform-specific issue management.
- Soustředěná pozornost na iOS launch (primary cílová skupina - finanční poradci používají iPhone častěji).
- Menší blast radius při incidentu.
- Web-app funguje už teď → Android users mohou zatím využít `https://aidvisora.cz` přes Chrome mobile.

**Proti:**
- Nečekané "proč není na Androidu" dotazy ze SoMe, support tickets.
- Riziko, že hybrid break v mezičase → Android build vyžaduje re-testing.
- Marketing ztrácí momentum při druhém launch.

**Pracnost:** 0 dní teď, +2–3 dny v budoucnu (regression test + metadata).

---

## Doporučení (assistant opinion — NEFINÁLNÍ)

### Pokud primární target = **finanční poradci 30–55 let v CZ/SK**:
→ **Varianta B (deferred +3 týdny)**.

Důvody:
- iPhone je dominant v segmentu finanční/pojišťovací profesionálů (~65 % podíl).
- iOS App Review je delší (1–2 týdny) → musíme šetřit bandwidth.
- 3 týdny po iOS launch máme real user data → Android release bude informovaný.
- Získáme čas na Android-specific polishing (Samsung keyboard quirks, biometric flow).

### Pokud primární target = **klienti poradců (general population)**:
→ **Varianta A (day-1)**.

Důvody:
- Klienti si nevyberou platformu podle ad preferencí — potřebujeme oba store.
- Client portal feature set je menší → risk profile je nižší.
- Pozdní Android launch v B2C = permanent 35 % user acquisition penalty.

---

## Akční body (pokud jde Varianta A — day-1)

### T-minus 3 týdny
- [ ] Zaplatit $25 Google Play publisher accountu (pokud není).
- [ ] Ověřit `compileSdk = 34` (Android 14+ target API requirement od Aug 2024).
- [ ] Vygenerovat release signing key, uložit do 1Password s duplicate v bezpečnostní schránce.
- [ ] Nahrát key do Play Console → Release → Setup → App signing → Use Play App Signing.

### T-minus 2 týdny
- [ ] Dokončit Data Safety form (podle iOS Privacy Nutrition Label z A14, ale Android-specific!).
  - Sekce: Data collected, Shared with third parties, Security practices.
  - POZOR: Location, Financial info, Personal info, Messages → vysoká scrutinia.
- [ ] Vyplnit Content rating questionnaire (IARC).
- [ ] Připravit screenshots: 1080×1920 px (phone), 1080×1920 px (7-inch tablet), 1080×1920 px (10-inch tablet).
- [ ] Feature graphic 1024×500 px.
- [ ] App icon 512×512 px (high-res).

### T-minus 1 týden
- [ ] Upload APK/AAB na Internal testing track.
- [ ] Otestovat seed reviewer tenantu flow (A27) na Android buildu.
- [ ] Zadat App Review credentials do Play Console.
- [ ] Setup External testing track pro beta testery.

### T-0 (launch day)
- [ ] Promote internal → production track.
- [ ] Monitoring PostHog + Sentry specificky na Android events (error rate, ANR rate).

### Post-launch (T+1 týden)
- [ ] Review první user feedback na Play Store rating.
- [ ] Fixnout top 3 Android-specific bugs.

---

## Akční body (pokud jde Varianta B — deferred)

### Na launch day
- [ ] Na landing page (`https://aidvisora.cz`) napsat: "Android aplikace brzy — zatím využijte web verzi."
- [ ] Email marketing: "iOS app již dostupná, Android přijde v Q2".
- [ ] Support FAQ: "Kdy přijde Android?" → public roadmap URL.

### T+3 týdny po iOS launch
- [ ] Zahájit Android submission pipeline (podle varianty A checklist, jen koncentrovaněji).
- [ ] Target: 3–4 týdny celkem od rozhodnutí do store.

---

## Rozhodnutí

| Datum | Rozhodnutí | Kdo | Poznámka |
|---|---|---|---|
| | | | |

*Vyplnit po jednání.*
