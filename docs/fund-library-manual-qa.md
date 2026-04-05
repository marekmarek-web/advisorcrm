# Fondová knihovna — ruční QA v prohlížeči

Základ pro **finální browser QA pass** před / po nasazení. Reálný tenant, přihlášený poradce (kde je potřeba i **Admin/Director** pro whitelist, je to uvedeno).

**Kde v UI:** Nastavení portálu → záložka **Fondy** (`SetupView` → `FundLibrarySettings`).

---

## Předpoklady (jednorázově)

- [ ] **DB:** `pnpm db:migrate` bez chyby (obsahuje `0020_fund_library_settings`), **nebo** ekvivalent (`fund_library_settings_2026-04-06.sql` / `pnpm db:apply-schema`).
- [ ] Sloupec `advisor_preferences.fund_library` (jsonb) a tabulka `fund_add_requests` + index `fund_add_requests_tenant_created_idx` existují na cílové DB.

---

## 1. Nastavení — save / load (tenant + poradce)

### 1a. Tenant whitelist (jen role s oprávněním)

- [ ] Jako **Admin/Director:** otevřít **Fondy**, u několika fondů změnit zaškrtnutí whitelistu firmy, **Uložit nastavení firmy**, toast úspěch.
- [ ] **Hard refresh** (nebo znovu otevřít Nastavení → Fondy): stav checkboxů whitelistu **sedí** se uloženým.
- [ ] Jako běžný poradce (bez oprávnění): vidíš informativní text, že whitelist upravuje admin — **žádná chyba**.

### 1b. Advisor — zapnutí/vypnutí fondů a pořadí

- [ ] V sekci **Můj výběr** přepnout **alespoň 2 fondy** vypnuto/zapnuto (toggle).
- [ ] **Změnit pořadí** šipkami nahoru/dolů u 2–3 řádků.
- [ ] **Uložit moje fondy**, toast úspěch.
- [ ] **Refresh stránky:** pořadí řádků a stav toggle **odpovídá** před uložením.
- [ ] Ověřit, že v seznamu jsou **jen fondy povolené tenantem** (po předchozím whitelist testu).

---

## 2. Fronta „Chci přidat fond“

- [ ] Otevřít modal **Chci přidat fond**, vyplnit povinný **název**, volitelně další pole, odeslat.
- [ ] Toast úspěch; záznam se objeví v **Požadavky na nové fondy** se statusem **Nový**.
- [ ] Změnit stav v selectu (např. **Nový → Řeší se**), počkat na dokončení — **refresh**: stav **zůstane**.
- [ ] (Volitelně) druhý požadavek — fronta řazení od nejnovějšího, oba čitelné.

---

## 3. Finanční analýza — bez fondů / s více fondy

### 3a. Bez dostupných / zapnutých fondů

- [ ] V Nastavení vypnout **všechny** fondy v **Můj výběr** (nebo nastavit whitelist tak, že effective seznam je prázdný) → uložit.
- [ ] Otevřít **Finanční analýzu** → krok se strategií / investicemi: **žádný crash**, žádné fondy mimo politiku (prázdný nebo srozumitelný empty stav dle aktuálního UI).

### 3b. S více zapnutými fondy

- [ ] Zapnout **alespoň 3** fondy, uložit, otevřít FA.
- [ ] V investičním kroku jsou k dispozici **očekávané** fondy (shoda s whitelistem + zapnutím).
- [ ] Loga: načtení **nebo** po chybě obrázku **iniciály** (žádná rozbitá stránka).

---

## 4. Legacy analýza

- [ ] Otevřít **existující analýzu** uloženou se **starým `productKey`** (např. `ishares`, `world_etf`, jiný legacy alias dle vašich dat).
- [ ] Název fondu a chování odpovídá **kanonickému** fondu (např. MSCI World pro `ishares` / `world_etf`).
- [ ] Uložení / obnovení stránky **neztratí** data nepředvídatelně (žádná 500).

---

## 5. HTML výstup

- [ ] Z FA vygenerovat **HTML report** (náhled / tisk / export dle vašeho flow).
- [ ] Sekce **detail produktu** u fondu s investicí: hero + galerie se vykreslí **nebo** po `onerror` zmizí prvek **bez rozbití** layoutu.
- [ ] Žádná 404 na běžně použitých cestách k placeholderům (`/logos/funds/_placeholder.svg`, `/report-assets/_placeholders/…`) při normálním průchodu.

---

## 6. PDF výstup

- [ ] Stejná analýza → **PDF** (tlačítko / generátor dle produkce).
- [ ] PDF se **vygeneruje bez chyby** (žádný nekonečný spinner / 500).
- [ ] V tabulkách investic jsou u log **textové fallbacky** (očekávané chování — PDF builder záměrně necpá `<img>` z URL).

---

## 7. Regrese (krátce)

- [ ] Přepnutí záložek v Nastavení po uložení Fondů **nehází** chybu.
- [ ] Dva různí poradci na stejném tenantu (pokud testujete): vlastní **Můj výběr** se nemíchá s druhým uživatelem (whitelist sdílený, pořadí/zapnutí per user).

---

## Release smoke test (~5 min po deployi)

Rychlá kontrola na **produkční** URL, jeden tenant, jeden uživatel s právem uložit fondy.

1. **DB:** migrace fondové knihovny na produkci už proběhly (neověřuješ SQL z UI — jen pokud máte runbook).
2. **Nastavení → Fondy:** uložit **jednu** změnu (toggle nebo pořadí) → refresh → **stav drží**.
3. **Chci přidat fond:** odeslat krátký testovací požadavek → viditelný ve frontě.
4. **FA:** otevřít rozpracovanou analýzu, přidat jednu investici do **povoleného** fondu → uložit bez chyby.
5. **PDF:** jednou vygenerovat z téže analýzy → soubor stáhnout / otevřít.

Pokud bod 2–5 projde, fondová knihovna je z pohledu smoke **OK**; hlubší průchod dělej podle sekcí výše.

---

## Blocker vs. non-blocker (orientační)

| Blocker (zastaví releasu funkčnost) | Non-blocker |
|-------------------------------------|-------------|
| Chybějící migrace → 500 při uložení fondů / frontě | Placeholder raster u hero/galerie u části fondů |
| Save whitelist nebo „Moje fondy“ neuloží / nepersistuje | Kosmetika textů v modalu požadavku |
| FA padá nebo ukazuje nepovolené fondy po uložení nastavení | PDF bez obrázkových log v tabulce (záměr) |
| PDF generátor háže 500 | Staré `.svg` zástupci vedle JPG ve `report-assets` (úklid později) |
