# Web — positioning backlog (Fáze 6)

Tento dokument doplňuje **`docs/pricing-packaging-roadmap.md`** a **`docs/billing-plan-architecture.md`**.  
Cíl: mít na jednom místě, **co je na webu zatím obecné nebo přepálené**, kde chybí **důkazní vrstva** (ukázky, čísla, workflow), a **co záměrně odložit** na větší iteraci webu — **bez povinného redesignu** landing page.

Poslední lehké sjednocení copy (ceník, FAQ, taglines): viz git historie souborů `plan-public-marketing.ts`, `landing-faq.ts`, `PremiumLandingPage.tsx` (sekce `#cenik`).

---

## 1) Co je na webu teď přepálené nebo příliš obecné

| Oblast | Poznámka |
|--------|------------|
| **Hero a value claims** | Silná adjectiva („komplexní“, „na jedno kliknutí“) bez vždy přiloženého konkrétního scénáře nebo screenshotu. |
| **ROI / kalkulačka** | Odhadní vstupy (hodiny, provize) — užitečné jako ilustrace, ne jako závazné tvrzení; na webu by měly být jasně označené jako **model / orientační**. |
| **Sekce integrací** | Texty typu „další integrace připravujeme“ jsou fér, ale nepřidávají důkaz o tom, co už dnes reálně běží v produkci. |
| **Srovnání rolí (pro-koho)** | Karty jsou motivační spíš než popis konkrétních obrazovek — chybí vazba „tahle role → tento screenshot / tok“. |
| **Ceník — struktura** | Po Fázi 5 jsou ceny a rozdíly Start / Pro / Management sladěné s katalogem; stále ale platí, že **delší, věcný popis workflow** patří spíš do dedikovaných sekcí než do tří sloupců. |

---

## 2) Kde chybí důkazní vrstva

- **Konkrétní čísla z praxe** (např. typický čas na úkol) — jen tam, kde je možné eticky a právně obhájit formulaci.
- **Jménem neanonymizované case study** — zatím často jen obecné testimonial řádky.
- **Audit / GDPR** — obecné věty; chybí stručný „jak to vypadá v aplikaci“ (např. export, souhlasy) s vizuálem.
- **Srovnání s „Excel + e-mail“** — často implicitní; chybí jedna jasná tabulka nebo seznam kroků A vs. B.

---

## 3) Kde chybí konkrétní ukázky funkcí

| Téma | Co doplnit později |
|------|---------------------|
| **CRM (pipeline, kontakty, úkoly)** | Statický nebo krátký screen záznam toku: nový lead → úkol → schůzka. |
| **Kalendář** | Ukázka synchronizace / události v kontextu klienta. |
| **Klientská zóna** | Screen portálu: dokumenty vs. požadavky vs. zprávy (s vazbou na tarif Start vs. Pro). |
| **AI asistent** | Jedna ukázka „před / po“ s anonymizovaným textem — bez slibu konkrétního výstupu pro každého klienta. |
| **AI review smlouvy** | Ukázka extrahovaných polí + krok schválení (anonymizovaná smlouva nebo demo dokument). |
| **Team overview / KPI / produkce** | Screen přehledu v roli Manager — bez reálných jmen klientů. |

---

## 4) Co doplnit později (mimo samotný ceník)

- **Reálné screenshoty z CRM** — vybrat 3–5 stabilních obrazovek (pipeline, detail klienta, úkoly).
- **Reálné screenshoty klientské zóny** — dokumenty; volitelně chat/požadavky u Pro.
- **Ukázka AI review** — realistický výstup (strukturovaná pole, ne „magický“ text).
- **Ukázky team overview / KPI** — jedna statická sada + krátký popis rolí.
- **Přesnější pricing copy** — delší stránka nebo rozbalovací „Co přesně obsahuje Start“ odkazující na `plan-catalog` / `plan-public-marketing`.
- **Méně hype claimů** — nahradit konkrétními přínosy (úspora času na konkrétním kroku, méně ručního přepisování, jedna pravda o datech).

---

## 5) Doporučené budoucí sekce (návrh obsahu)

1. **„Jak vypadá pracovní den v Aidvisoře“** — časová osa: ráno (přehled) → schůzky → follow-up → portál; reálné screeny.
2. **„Co přesně je v Start / Pro / Management“** — tabulka nebo accordion; odkaz na stejný zdroj pravdy jako v aplikaci (`plan-catalog` / marketing konstanty).
3. **„Jak vypadá AI review smlouvy“** — 4–6 kroků + jeden anonymizovaný výstup.
4. **„Jak vypadá klientský portál“** — mobil + desktop náhled; vysvětlení rozdílu Start vs. Pro.
5. **„Jak vypadá manažerský přehled“** — jeden screen KPI + jedna věta o oprávněních rolí.

---

## 6) Kandidáti na assety v repu (nejsou to CRM screenshoty)

Tyto soubory **nejsou** náhradou za produktové screenshoty, ale můžou se hodit jako **ilustrace** nebo pro **PDF/report** narrativ:

| Cesta | Poznámka |
|-------|----------|
| `apps/web/public/logos/Aidvisora logo new.png` | Logo na landing reference. |
| `apps/web/public/report-assets/**` | SVG šablony pro fondy / partnery (Penta, Atris, Creif, …) — vhodné pro sekce o **reportech a výstupech**, ne jako UI produktu. |
| `apps/web/public/report-assets/_placeholders/*` | Placeholdery pro reportové galerie. |
| `apps/web/templates/kontakty-import-sablona.csv` | Důkaz, že import existuje — lze odkázat z onboarding copy (ne nutně vizuál). |

**Demo / mock v kódu:** landing (`PremiumLandingPage.tsx`) obsahuje ilustrativní komponenty (např. mindmap / pipeline mock) — vhodné jako **dočasná náhrada** screenshotů, dokud nejsou hotové reálné exporty z produkce.

---

## 7) Záměrně odloženo (není součástí této fáze)

- Kompletní **redesign** landing page (layout, typografie, nové bloky).
- Profesionální **fotky / video** z produkce.
- A/B testování CTA a měření konverzí.
- Plná **lokalizace** EN (pokud není v roadmapě).

---

## 8) Související zdroje pravdy v kódu

| Obsah | Soubor |
|--------|--------|
| Veřejné ceny a výpočty roční slevy | `apps/web/src/lib/billing/public-pricing.ts` |
| Bullet listy tarifů (web + CRM nápověda) | `apps/web/src/lib/billing/plan-public-marketing.ts` |
| FAQ na landing | `apps/web/src/data/landing-faq.ts` |
| Katalog plánů a capabilities | `apps/web/src/lib/billing/plan-catalog.ts` |
