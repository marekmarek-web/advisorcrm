# Phase 7 – Návrh scope + šablona vzhledu kalkulačky

## Návrh Phase 7 (co by mohla obsahovat)

- **Mobilní přihlášení** – flow podle `mobile ui/login.txt` (formulář, zapamatovat, zapomenuté heslo) s mobile-first layoutem.
- **Vzhled kalkulaček** – sjednocený design podle šablony níže (ty doplníš vzhled; já pak napojím na stávající logiku).
- **Drobné parity** – chybějící deep-linky, zpětné navigace, konzistence ikon a barev s Mobile UI mockupem.
- **QA + příprava na širší rollout** – finální checklist před zapnutím mobile jako default pro mobilní zařízení (volitelně).

---

## Šablona vzhledu kalkulačky (pro tvůj design)

Níže je přesná struktura obrazovky kalkulačky, jak ji kód očekává. Můžeš vytvořit vzhled (Figma / obrázek / popis) podle těchto bloků; já pak sladím komponenty s tvým designem.

---

### 1) Seznam kalkulaček (hub)

**Umístění:** první obrazovka po kliku na „Kalkulačky“ v Menu.

**Obsah:**
- Nadpis sekce: **„Kalkulačky“**
- Řada karet (4 položky):
  - **Investiční kalkulačka** – krátký popis (volitelně), tlačítko akce „Otevřít“
  - **Hypoteční kalkulačka** – idem
  - **Penzijní kalkulačka** – idem
  - **Životní pojištění** – idem

**Co potřebuju od tebe (vzhled):**
- Jak má vypadat jedna karta (ikona + barva dle typu: investice = zelená, hypotéka = modrá, penze = fialová, život = růžová – nebo tvá paleta).
- Výška karty, zaoblení, stín, zda má být na celou šířku nebo mřížka 2×2.
- Styl tlačítka „Otevřít“ (primární / sekundární / outline).

**Referenční mockup z Mobile UI:**  
`CALCULATORS_MOCK` – ikona + title + barva (např. `text-emerald-600 bg-emerald-50`).

---

### 2) Detail jedné kalkulačky (fullscreen sheet)

Otevře se jako **fullscreen sheet** (overlay přes obsah). Uvnitř:

#### Blok A: Nadpis
- **Název kalkulačky** (např. „Investiční kalkulačka“) – jeden řádek, výrazný.

#### Blok B: Vstupy (formulář)
- **3–5 vstupních polí** v jednoduchém vertikálním seznamu.
- Každé pole: **label** (název) + **input** (číslo nebo výběr).
- Min. výška tap targetu: **44px**.
- Příklady labelů podle typu:
  - **Investice:** Počáteční vklad, Měsíční vklad, Horizont (roky), Profil (dropdown: Konzervativní / Vyvážený / Růstový …).
  - **Hypotéka:** Výše úvěru, Vlastní zdroje, Splatnost (roky).
  - **Penzije:** Věk, Důchodový věk, Čistý příjem, Cílová renta.
  - **Život:** Čistý příjem, Výdaje domácnosti.

**Co potřebuju od tebe:**
- Styl inputu (border, radius, padding, font-size).
- Zda mají být labely nad polem nebo placeholder uvnitř.
- Zda přidat jednotky vedle pole (Kč, roky) – a kde (vpravo v inputu / pod labelem).

#### Blok C: Výsledky (shrnutí)
- **1–3 hlavní metriky** z výpočtu (např. „Bilance: 1 234 567 Kč“, „Splátka: 15 000 Kč“, „Gap: 5 000 Kč“).
- Zobrazené jako **badge/chip** nebo malá karta (success = zelená, warning = oranžová, info = modrá).

**Co potřebuju od tebe:**
- Jak vizuálně oddělit „vstupy“ a „výsledky“ (čára, pozadí, mezera).
- Styl jedné metriky (badge vs. řádek s číslem).

#### Blok D: CTA (další business krok)
- Nadpis: **„Další business krok“** (nebo tvůj copy).
- Volitelný podnadpis: „Uložte výsledek do workflow klienta.“
- **4 tlačítka** (může být mřížka 2×2 nebo 2 řádky po 2):
  - **Úkol** (primární – vytvoří úkol s návazností na propočet).
  - **Opportunity** (sekundární – vytvoří příležitost).
  - **Analýza** (terciární – přechod na analýzy).
  - **Uložit kontext** nebo **Zavřít** (nízká prominence).

**Co potřebuju od tebe:**
- Barva a styl primárního vs. sekundárního tlačítka.
- Zda má být celý CTA blok v jiném pozadí (např. jemně indigo) nebo jen oddělený mezerou.

---

### 3) Společné požadavky (všechny kalkulačky)

- **Mobilní first:** vše čitelné a klikatelné na šířce ~360px, bez vodorovného scrollu.
- **Touch:** min. 44px výška u tlačítek a inputů.
- **Scroll:** obsah detailu se může vertikálně scrollovat (nadpis sheetu zůstane nahoře).
- **Zavření:** křížek nebo „Zpět“ v hlavičce fullscreen sheetu (už v kódu je).

---

### 4) Co můžeš dodat (aby to šlo snadno napojit)

- **Figma / obrázek** – jeden screen „Hub“ + jeden screen „Detail“ (klidně jen pro jednu kalkulačku jako vzor).
- **Tailwind třídy** – pokud chceš přímo navrhnout (např. „rounded-2xl bg-slate-50 p-4“).
- **Popis:** „Primární tlačítko: plná barva indigo-600, sekundární: bílý background + indigo border“ atd.

Jakmile máš hotový vzhled (obrázek nebo spec), pošli mi ho a já upravím `CalculatorsHubScreen.tsx` a příslušné primitives (`CalculatorCard`, `ResultCtaCard`), aby odpovídaly tvému designu bez změny logiky (engine, CTA akce, data).
