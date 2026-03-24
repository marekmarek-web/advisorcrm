# Aidvisor — UX/UI plán pro nové prostředí po AI Review extrakci smluv

## Kontext

Cílem je vytvořit nové produkční UX/UI prostředí pro stránku po extrakci dat z AI Review smluv. Vizuálně a layoutově se má držet **1:1 směru z dodaného mocku / prototypu**: horní top bar, vlevo datový a akční panel, vpravo živý náhled nahraného PDF. Současný mock už definuje hlavní kompozici, obsah levého panelu, způsob zobrazení confidence, AI doporučení i PDF viewer toolbar, a tento plán z něj vychází jako ze source of truth.

Zdrojový mock obsahuje:
- top bar s breadcrumb style identitou, akcemi „Zahodit“ a „Schválit do CRM“
- hlavní 2sloupcový layout
- levý panel cca **55 % šířky** pro extrahovaná data a AI doporučení
- pravý panel cca **45 % šířky** pro live náhled PDF
- dokumentovou hlavičku, AI recommendation blok, kontrolní banner a skupiny extrahovaných dat s confidence badge, barevným stavem a inline editací
- viewer toolbar se zoom ovládáním a full-screen akcí
- zvýraznění hodnot uvnitř PDF náhledu

To je jasně vidět v nahraném návrhu `extrakce.txt`. fileciteturn1file1  
Levý panel už v mocku obsahuje blok „AI Analýza a navrhované akce“, kontrolní banner „Vyžadována vaše kontrola“ a skupiny extrahovaných dat s poli, badge a hláškami warning/error. fileciteturn1file2  
Pravý panel v mocku počítá s živým PDF viewerem, toolbar kontrolami a vizuálním zvýrazněním konkrétních extrahovaných hodnot v dokumentu. fileciteturn1file8turn1file10turn1file13

---

## Hlavní produktový cíl

Poradce po nahrání smlouvy nesmí dostat jen „výpis polí“, ale plnohodnotné pracovní prostředí, kde:
- okamžitě vidí, co AI vytáhla
- ví, co je jisté, co je sporné a co chybí
- dostane doporučení, co zkontrolovat a co s klientem dále řešit
- může porovnávat extrakci s originálním PDF vpravo
- může data potvrdit, upravit, nebo zamítnout
- může z AI výstupu rovnou vytvářet další kroky do CRM / úkolů / follow-upů

---

## UX principy

### 1. 1:1 layout fidelity
Implementace se má držet stejného rozvržení jako mock:
- sticky top bar
- fixed split layout
- levý datový panel 55 %
- pravý PDF viewer 45 %
- stejný spacing, card language, barevnost, rounded corners, badge styl a hierarchy

### 2. PDF je vždy primární zdroj pravdy
Levý panel je pracovní vrstva. Pravý panel je zdroj pravdy.  
Všechny warningy, low-confidence pole a AI insighty musí mít vazbu na konkrétní místo v PDF.

### 3. AI musí nejen extrahovat, ale i vést poradce
AI nemá jen ukázat „co našla“. Musí aktivně navrhovat:
- co chybí
- co je rizikové
- co nedává produktově smysl
- co se má ověřit s klientem
- co je příležitost pro další obchod nebo servis

### 4. Editace musí být rychlá a bezpečná
Pole v levém panelu musí být lehce editovatelná, ale zároveň musí být zřejmé:
- co je AI návrh
- co upravil poradce
- co bylo potvrzeno ručně
- co je stále nevyřešené

### 5. Diagnostika nesmí působit technicky
Technické detaily extrakce mají být přeložené do srozumitelného jazyka:
- „nižší jistota čtení“
- „údaj chybí v dokumentu“
- „na straně 2 pravděpodobně nalezena alternativní hodnota“
- „doporučeno manuálně ověřit“

---

## Cílový layout

## A. Top bar

### Struktura
- vlevo: zpět na seznam smluv
- uprostřed / vlevo: identita stránky „AI Extrakce / název dokumentu“
- vpravo: primární a sekundární akce

### Akce
- Zahodit
- Schválit do CRM
- později lze doplnit:
  - Uložit koncept
  - Označit k ručnímu doplnění
  - Vytvořit follow-up

### UX pravidla
- top bar sticky
- akce stále viditelné
- primární CTA vždy jen jedno
- destructive akce s confirmem

---

## B. Levý panel — pracovní panel poradce

Tento panel zůstane strukturálně velmi blízký mocku. Nesmí se z něj stát přehlcený dashboard. Musí být čitelný, sekvenční a rozhodovací.

### Doporučené pořadí sekcí

#### 1. Hlavička dokumentu
Obsah:
- název souboru
- typ smlouvy / dokumentu
- klient
- čas nahrání
- počet stran
- celkové confidence skóre
- status review

Přidat navíc:
- zdroj dokumentu: upload / mobile scan / email / import
- provider extrakce: internal / adobe / mixed
- datum posledního AI zpracování

#### 2. Executive summary
Nová sekce nad AI doporučeními:
- krátké 2–4 věty „co dokument obsahuje“
- počet nalezených kritických problémů
- počet polí s warning/error
- stručný závěr AI

Příklad:
- Dokument je životní pojistná smlouva
- AI vytěžila 14 z 16 klíčových polí
- 2 pole vyžadují ruční kontrolu
- 1 zásadní obchodní doporučení k dopojištění

Tato sekce bude sloužit jako rychlá orientace ještě před detailními group cards.

#### 3. AI Analýza a navrhované akce
Tato sekce zůstane v podobném stylu jako v mocku. fileciteturn1file2turn1file3

Musí obsahovat více typů doporučení:
- **warning** — chybějící nebo problematická data
- **insight** — logické nebo produktové zjištění
- **opportunity** — příležitost pro další servis / prodej
- **compliance** — chybějící formální náležitost
- **next_step** — konkrétní navržená akce

Každá karta doporučení má mít:
- typ recommendation
- krátký headline
- 1 větu vysvětlení
- vazbu na pole / sekci / stránku PDF
- akce:
  - Vytvořit úkol
  - Přidat do follow-upu
  - Označit jako vyřešené
  - Skrýt / zahodit

#### 4. Kontrolní banner
Stávající banner „Vyžadována vaše kontrola“ zachovat. fileciteturn1file2turn1file7

Rozšířit o:
- počet polí s warning
- počet polí s error
- quick actions:
  - Přejít na první problém
  - Filtrovat jen problematická pole

#### 5. Diagnostika extrakce
Nová samostatná sekce mezi bannerem a skupinami dat.

Obsah:
- kvalita OCR / text layer
- počet nalezených entit
- počet nejasných polí
- počet konfliktů mezi více nalezenými hodnotami
- jestli byla použita fallback logika
- jestli existují strany bez čitelného textu

Formou:
- lidsky srozumitelné systémové hlášky
- malé status rows, ne technický log

Příklad:
- OCR kvalita: dobrá
- Strana 2 obsahuje hůře čitelné částky
- 1 údaj nebyl nalezen
- 2 hodnoty byly doplněny na základě kontextu

#### 6. Skupiny extrahovaných dat
Základ zůstane dle mocku. Skupiny typu:
- smluvní strany
- parametry smlouvy
- krytá rizika
- ostatní ujednání
atd. fileciteturn1file0turn1file7

Každá skupina bude mít:
- název
- ikonu
- počet polí
- optional status count (např. 1 warning, 1 error)

Každé pole bude mít:
- label
- value
- confidence badge
- stav success / warning / error
- vysvětlující message
- vazbu na page + coordinates / anchor v PDF
- možnost editace
- možnost „potvrdit“
- možnost „vrátit na AI návrh“

Navíc přidat metadata pole:
- source: AI / OCR / manual
- last_changed_by
- last_changed_at

#### 7. Extra doporučení od AI
Za skupinami dat přidat novou sekci:
- co dále AI doporučuje zobrazit poradci
- obchodní doporučení
- rizikové nesoulady
- co lze porovnat s klientským profilem
- návrh navazujících kroků

Sem spadá například:
- pojistná částka nepokrývá hypotéku
- chybí obmyšlená osoba
- vhodné navrhnout revizi invalidity
- lze porovnat s existujícími smlouvami klienta
- lze vytvořit servisní úkol

#### 8. Další AI návrhy a inteligentní rozšíření
Tady má být prostor pro další funkce, které AI může ukazovat podle typu dokumentu:
- srovnání s daty v CRM
- rozpoznání duplicity s jinou smlouvou
- upozornění na expiraci / výročí
- návrh na doplnění klientských údajů
- vytvoření checklistu callu s klientem
- návrh otázky pro další schůzku
- odhad obchodního potenciálu ze smlouvy

---

## C. Pravý panel — live PDF viewer

Pravý panel musí být skutečně produkční viewer, ne jen placeholder.

### Povinné prvky
- toolbar s názvem souboru
- zoom out / zoom in
- procento zoomu
- full-screen
- scrollování stránek
- page indicators
- skeleton/loading/error state

To vychází přímo z mocku viewer toolbaru. fileciteturn1file8turn1file10

### Povinné interakce
- klik na pole vlevo scrollne PDF na správnou stránku a highlightne oblast
- klik na highlight v PDF označí odpovídající pole vlevo
- warning/error pole mají výraznější highlight
- hover na recommendation může nasvítit související místa v PDF
- full-screen viewer nesmí rozbít levý panel state

### Typy highlightů
- success = jemný indigo highlight
- warning = amber highlight
- error = rose highlight
- multi-match = dashed outline / stacked marker
- recommendation-driven highlight = glow overlay

### Viewer režimy
- standardní režim
- focus mode: zobrazí jen relevantní stránku a aktivní highlight
- compare mode do budoucna: AI text vs originál

### Důležité pravidlo
Pravý panel nesmí být UX mrtvá plocha. Má být živě svázán s levým panelem.

---

## Obsah, který má AI po extrakci nově navrhovat a ukazovat

Toto je zásadní rozšíření proti čisté extrakci polí.

## 1. Missing data recommendations
AI má ukázat:
- co ve smlouvě chybí
- proč je to důležité
- co má poradce s klientem ověřit

## 2. Risk / gap analysis
AI má ukázat:
- jestli krytí dává smysl
- jestli částky nejsou nízké
- jestli dokument obsahuje zjevné mezery
- jestli něco neodpovídá kontextu klienta

## 3. Cross-sell / service opportunity
AI má navrhovat:
- vhodné doplnění krytí
- servisní kontrolu
- sjednání revize
- follow-up call

## 4. Data quality / extraction quality
AI má transparentně vysvětlit:
- co je jisté
- co je nejasné
- co nenašla
- kde použila odhad

## 5. CRM next actions
AI má navrhovat hotové akce:
- vytvořit úkol
- vytvořit poznámku
- označit follow-up
- doplnit klientské pole
- založit servisní příležitost

## 6. Compliance / formal checks
AI má upozornit:
- chybějící údaje
- formální nedostatky
- nepodepsaná místa
- nesrovnalosti mezi stranami dokumentu

## 7. Document intelligence
AI může později navrhovat:
- podobné smlouvy klienta
- změny proti předchozí verzi
- detekci nové vs staré smlouvy
- duplicity
- orientační klasifikaci dokumentu

---

## Informační architektura levého panelu

### Stavová filtrace
Nad skupinami dat přidat rychlé filtry:
- vše
- jen warning
- jen error
- jen manuálně upravené
- jen nepotvrzené

### Sticky mini nav
V delších dokumentech přidat sticky přepínač sekcí:
- Summary
- AI akce
- Diagnostika
- Extrahovaná data
- Další doporučení

### Collapsible groups
Každá group card:
- expand / collapse
- pamatuje si state
- umí zobrazit count problémů

---

## Interakční pravidla

## 1. Klik zleva doprava
Kliknutí na:
- pole
- warning hlášku
- recommendation
musí posunout viewer na správné místo v PDF a zvýraznit oblast.

## 2. Klik zprava doleva
Kliknutí na highlight nebo vybraný text v PDF musí aktivovat příslušné pole vlevo.

## 3. Potvrzení hodnoty
Pole musí mít možnost:
- potvrdit hodnotu
- označit jako ručně opravenou
- vrátit na AI návrh

## 4. Bulk actions
Později doplnit:
- potvrdit všechny success fields
- projít jen problematická pole
- schválit bez doporučení
- schválit a vytvořit úkoly

## 5. Undo / audit
Manuální editace musí být auditovatelná:
- kdo změnil
- co změnil
- kdy změnil

---

## Datový model pro UI

## Document level
- id
- fileName
- documentType
- clientName
- uploadTime
- pageCount
- globalConfidence
- reviewStatus
- extractionProvider
- processingStatus

## Recommendation
- id
- type
- severity
- title
- description
- linkedFieldIds[]
- linkedPage
- linkedBoundingBoxes[]
- actionState
- dismissed
- createdAt

## Extracted field
- id
- groupId
- label
- value
- normalizedValue
- confidence
- status
- message
- page
- boundingBox
- sourceType
- isConfirmed
- isEdited
- originalAiValue
- manualValue
- updatedBy
- updatedAt

## Diagnostics
- ocrQuality
- extractionCoverage
- unresolvedFieldCount
- warningCount
- errorCount
- conflictingValueCount
- pagesWithoutReadableText
- notes[]

---

## Komponentový návrh

## Layout shell
- `AIReviewExtractionShell`
- `AIReviewTopBar`
- `AIReviewSplitLayout`

## Levý panel
- `DocumentMetaHeader`
- `ExecutiveSummaryCard`
- `AIRecommendationsCard`
- `ReviewAttentionBanner`
- `ExtractionDiagnosticsCard`
- `ExtractedGroupCard`
- `ExtractedFieldRow`
- `ExtraRecommendationsCard`
- `ReviewFiltersBar`
- `ReviewSectionNav`

## Pravý panel
- `PDFViewerShell`
- `PDFViewerToolbar`
- `PDFPageCanvas`
- `PDFHighlightLayer`
- `PDFPageNavigator`
- `ViewerLoadingState`
- `ViewerErrorState`

## Shared
- `ConfidenceBadge`
- `FieldStatusPill`
- `ActionChip`
- `LinkedAnchorIndicator`
- `EmptyState`
- `SkeletonState`

---

## Doporučené technické chování

## State
- aktivní pole
- aktivní PDF highlight
- active page
- zoom level
- filter state
- collapse state skupin
- dismissed recommendations
- unsaved changes state

## Performance
- virtualizace delších seznamů polí
- lazy render PDF pages
- debounce při synchronizaci hover/click stavů
- memoizace highlight mapy

## Accessibility
- focus states
- keyboard navigace mezi poli
- tooltipy i bez hover-only logiky
- dostatečný kontrast pro warning/error
- full-screen viewer ovladatelný klávesnicí

---

## Responsive strategie

Desktop je primární. Tohle prostředí má být navrženo především pro velké obrazovky, protože poradce musí současně číst data i PDF.

### Desktop
- plný split 55 / 45

### Tablet landscape
- split zůstává
- mírně užší spacing
- group cards více stackované

### Tablet portrait / small laptop
- přepnutí na režim:
  - levý panel hlavní
  - viewer jako dock / overlay / toggle

### Mobile
Není primární cíl této obrazovky.  
Na mobile jen read-only nebo zjednodušené review flow, ne plná parity.

---

## Fázování implementace

## Fáze 0 — UX shell a layout parity
Cíl:
- vyrobit 1:1 layout shell podle mocku
- top bar
- split layout
- základní left/right panel containers
- sticky a scroll behavior

Výstup:
- pixel-faithful structure
- bez hlubší logiky, jen layout foundation

Checklist:
- top bar odpovídá mocku
- levý panel 55 %
- pravý panel 45 %
- scroll funguje odděleně pro oba sloupce
- spacing, border, radii a hierarchy sedí

## Fáze 1 — Levý panel základ
Cíl:
- document header
- AI recommendation card
- review banner
- group cards
- field rows
- confidence badges
- warning/error messages

Checklist:
- group cards vypadají stejně jako mock
- pole umí success/warning/error styly
- badge sedí vizuálně
- inline edit affordance je přítomná

## Fáze 2 — Pravý panel viewer
Cíl:
- reálný PDF viewer
- toolbar
- scroll stránek
- zoom controls
- fullscreen
- page navigation

Checklist:
- viewer nahrává skutečné PDF
- toolbar funguje
- loading/error state existuje
- viewer layout sedí na mock

## Fáze 3 — Propojení pole ↔ PDF
Cíl:
- field-to-highlight linking
- recommendation-to-highlight linking
- click/scroll sync
- active item state

Checklist:
- klik na pole najde místo v PDF
- klik na highlight aktivuje pole
- warning/error highlighty mají jiné vizuální chování
- focus state je čitelný

## Fáze 4 — Diagnostika a executive summary
Cíl:
- doplnit summary a diagnostics cards
- zlepšit orientaci poradce
- přeložit technickou kvalitu extrakce do business jazyka

Checklist:
- summary je krátké a užitečné
- diagnostika není technický spam
- count warning/error sedí
- doporučení mají jasný důvod

## Fáze 5 — AI doporučení a next actions
Cíl:
- rozšířit recommendation engine v UI
- přidat akce do CRM / follow-up / task flow
- doplnit extra AI návrhy

Checklist:
- recommendation typy jsou rozlišené
- každá recommendation má akci
- jde recommendation dismissnout / označit vyřešené
- jsou navázané na PDF nebo data

## Fáze 6 — Editace, potvrzení, audit
Cíl:
- potvrdit / upravit / revertovat pole
- audit changes
- unsaved changes handling

Checklist:
- pole mají confirm/edit/revert flow
- audit metadata se propisují
- uživatel ví, co změnil ručně
- save flow je bezpečný

## Fáze 7 — QA, polish a parity
Cíl:
- pixel polish
- stavové edge cases
- výkon
- accessibility
- regression check

Checklist:
- loading, empty, failed, partial extraction state
- dlouhé hodnoty nezalamují layout
- viewer a left panel se nerozsypou
- full-screen funguje
- keyboard flow funguje
- vizuální parity s mockem dosažena

---

## Stavové scénáře, které musí UI umět

- extraction pending
- OCR pending
- partial extraction
- extraction failed
- document loaded, no fields
- fields loaded, PDF failed
- PDF loaded, fields failed
- missing anchors in PDF
- multiple candidate values
- no recommendations
- too many recommendations
- manual edit unsaved
- field confirmed
- recommendation dismissed
- review approved
- review rejected

---

## Rizika

## 1. Přetížení levého panelu
Když tam dáme summary, recommendations, diagnostics, groups i extra AI návrhy, může to být moc.  
Řešení:
- sekce držet kompaktní
- použít collapsible groups
- použít sticky filtry
- zachovat přísnou hierarchii

## 2. Nejasné propojení s PDF
Pokud nebudou spolehlivé anchors / coordinates, viewer bude působit falešně.  
Řešení:
- fallback na page-level link
- když není bounding box, scrollnout aspoň na stránku a ukázat banner „přesné místo nenalezeno“

## 3. Doporučení budou příliš obecná
AI recommendation blok nesmí generovat jen marketingové fráze.  
Řešení:
- každé doporučení musí být odvozené z konkrétního pole, vztahu nebo absence dat

## 4. Inline edit může rozbít důvěru
Uživatel musí vždy poznat, co je AI hodnota a co ruční úprava.  
Řešení:
- explicitní state badge
- original vs edited hodnota
- audit metadata

---

## Doporučené soubory / oblasti implementace

Názvy ber jako orientační, přizpůsobit podle skutečné struktury projektu.

- `apps/web/src/app/.../ai-review/[id]/page.tsx`
- `apps/web/src/components/ai-review/AIReviewExtractionShell.tsx`
- `apps/web/src/components/ai-review/AIReviewTopBar.tsx`
- `apps/web/src/components/ai-review/left-panel/DocumentMetaHeader.tsx`
- `apps/web/src/components/ai-review/left-panel/ExecutiveSummaryCard.tsx`
- `apps/web/src/components/ai-review/left-panel/AIRecommendationsCard.tsx`
- `apps/web/src/components/ai-review/left-panel/ExtractionDiagnosticsCard.tsx`
- `apps/web/src/components/ai-review/left-panel/ExtractedGroupCard.tsx`
- `apps/web/src/components/ai-review/left-panel/ExtractedFieldRow.tsx`
- `apps/web/src/components/ai-review/right-panel/PDFViewerShell.tsx`
- `apps/web/src/components/ai-review/right-panel/PDFHighlightLayer.tsx`
- `apps/web/src/lib/ai-review/types.ts`
- `apps/web/src/lib/ai-review/mappers.ts`
- `apps/web/src/lib/ai-review/selectors.ts`
- `apps/web/src/lib/ai-review/viewer-linking.ts`

---

## Definition of done

Feature je hotová, když:
- UI zachovává 1:1 layout a styl mocku
- levý panel obsahuje vše důležité z extrakce, doporučení a diagnostiky
- pravý panel ukazuje live PDF a reaguje na interakce
- pole a PDF jsou navázané
- AI ukazuje nejen data, ale i další doporučení a navržené kroky
- poradce může review dokončit bez přepínání do jiné obrazovky
- stavové scénáře jsou pokryté
- nic nepůsobí jako demo nebo placeholder

---

## Finální checklist

- [ ] Zachovat 1:1 top bar, split layout a vizuální jazyk mocku
- [ ] Implementovat levý panel s document header
- [ ] Implementovat executive summary
- [ ] Implementovat AI recommendations card
- [ ] Implementovat review attention banner
- [ ] Implementovat extraction diagnostics
- [ ] Implementovat group cards a field rows
- [ ] Implementovat confidence badge a state styling
- [ ] Implementovat inline edit affordance
- [ ] Implementovat extra AI recommendations / next steps
- [ ] Implementovat live PDF viewer
- [ ] Implementovat toolbar, zoom a full-screen
- [ ] Implementovat page scrolling a loading/error states
- [ ] Propojit pole vlevo s highlighty v PDF
- [ ] Propojit recommendation bloky s PDF
- [ ] Implementovat confirm / edit / revert flow pro pole
- [ ] Implementovat filtery a sticky section navigation
- [ ] Ošetřit partial/failed extraction states
- [ ] Ošetřit missing-anchor fallback v PDF
- [ ] Ověřit desktop/tablet behavior
- [ ] Udělat pixel polish a UX parity pass
- [ ] Udělat regression pass na AI Review flow

---

## Poznámka k implementaci

Tento plán úmyslně drží vizuální a layoutovou věrnost dodanému mocku a jen ho převádí do produkčního, rozšiřitelného prostředí. Není cílem redesign do jiného stylu. Cílem je udělat z aktuálního návrhu reálný pracovní nástroj pro poradce.