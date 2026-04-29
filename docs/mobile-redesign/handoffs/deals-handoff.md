# Handoff — Obchody (mobile pipeline)

**Zdroj design reference:** [`references/deals-mock-v1.tsx`](references/deals-mock-v1.tsx) — pouze vstupní mock, **nezapisovat** do runtime bundle.

**Produkční cesta:** `/portal/pipeline` (tab **Obchody**), mobilní vrstva v [`MobilePortalClient.tsx`](../../apps/web/src/app/portal/mobile/MobilePortalClient.tsx); data přes `@/app/actions/pipeline` jako dnes [`PipelineScreen`](../../apps/web/src/app/portal/mobile/screens/PipelineScreen.tsx).

---

## 1. Screen purpose

**Mobilní pipeline poradce** — přehled aktivních obchodních příležitostí podle CRM fází, rychlé souhrnné KPI, zvýraznění prioritního „fokus“ obchodu a spolehlivý přesun mezi fázemi bez desktopové tabulky.

---

## 2. Exact visual hierarchy (shora dolů — podle mocku)

1. **Shared top chrome** (globální `MobileHeader` v shellu — menu / hledání / AI / notifikace; na hub route bez duplicitního titulu ve středu, hlavní H1 níže).
2. **Sekční lead** (`Pipeline poradce` + velký **Obchody** jako H1 v obsahu screenu).
3. **KPI / souhrn (bento)** — tři bloky:
   - velký „Potenciál pipeline“ (počet případů + **očekávaný objem** v krátkém peněžním formátu v rohu),
   - **Rizikové** (počet ke kontrole),
   - **Ve fokusu** (počet prioritně).
4. **Focus deal card** (`FocusDealCard`) — tmavá premium karta: priorita „Fokus obchody“, badge rizik, název, klient • částka, další krok, CTA „Otevřít detail“.
5. **Barevná mřížka fází pipeline** (`PipelinePhaseHeroCard` × 5 — mapování na reálné fáze z API) — tap přepíná filtr aktivní sekce („all“ vs jedna fáze).
6. **Sekční nadpis** „Seznam obchodů“ + podtitul aktivní filtrování.
7. **Skupiny po fázích** (`PipelinePhaseSection`) — každá sekce má barevný **hero** pruh + seznam **`MobileDealCard`**.
8. **`MoveDealStageSheet`** — bottom sheet: kontext případu, aktuální fáze, seznam dostupných fází s krátkým podtitulem („Šla nabídka“, … z real dat).

Mock navíc ukazuje **HTML5 drag&drop** a **sekundární** sheet „Nový obchod“ — v produkci **nepřepisovat** tyto části z mocku; viz sekce níže.

---

## 3. Reusable komponenty (návrh názvů)

| Návrh | Role |
|--------|------|
| `DealsSummaryCard` | Agreguje celý horní KPI bento (není jen jedna karta; může být složený grid z dílčích buněk mapovaných z API). |
| `FocusDealCard` | Jeden výrazný prioritní případ + CTA detail. |
| `PipelinePhaseHeroCard` | Klikací dlaždice fáze (číslo, název, objem/count, gradient). |
| `PipelinePhaseSection` | Obálka sekce jedné fáze + list karet případů. |
| `MobileDealCard` | Řádek/karta obchodu: titul, **kategorie** (typ případu), klient, zkrácená hodnota, další krok, badge termínu/rizika, postranní akce **Přesunout fázi**. |
| `MoveDealStageSheet` | Výběr cílové fáze — implementovat přes existující `BottomSheet` / `MobileActionSheet` z [`primitives`](../../apps/web/src/app/shared/mobile-ui/primitives.tsx), ne inline `<style>` keyframes z mocku. |

---

## 4. Data fields (mapování na produkci)

| UI v mocku | Produkční zdroj (orientačně) |
|------------|-------------------------------|
| Celkový počet případů | součet řádků příležitostí v pipeline / `pipeline.length`-sum counts |
| Očekávaný „potenciál“ (Kč, zkráceně) | agregace `expectedValue` (nebo ekvivalent) napříč aktivními případy |
| Rizikové (count) | business pravidlo: overdue, flag z úkolů, SLA — **definovat přesně** při implementaci nad existujícími sloupci/API (mock používá `risky?: boolean`). |
| Ve fokusu (count) | nepočítat z mock pravidel; vycházet z reálných risk/overdue/SLA dat nebo bezpečného fallbacku |
| Focus deal (**řádek**) | deterministický výběr z reálných dat: risk/overdue → nejvyšší `expectedValue` → nejbližší `nextStep`/termín → empty state |
| Fáze (`id`, `name`, vizuální barva **`index`/pořadí**) | `StageWithOpportunities` z `getPipeline()` — barvy mapovat na pořadí/paletu, ne natvrdo mock enum |
| Počet a objem ve fázi | agregace z příležitostí ve fázi |
| Riziko ve fázi (mock) | `riskCount` per stage — pokud API nemá, dopočítat nebo skrýt |
| Karta obchodu: titul, kategorie, klient, částka, další krok | `title`, `caseType`/typ, `contactName`, `expectedValue`, vlastní pole next step pokud existuje |
| Přesun fáze | existující `updateOpportunityStage` (již v appce) |

---

## 5. Interactions

- **Tap na kartu obchodu (hlavní plocha)** → navigace na detail případu (`/portal/pipeline/[id]` — stávající pattern).
- **Tap „Fáze“ / přesun** → otevře `MoveDealStageSheet` s reálnými fázemi z pipeline.
- **Tap na hero dlaždici fáze** → filtr seznamu (all / jedna fáze), v mocku toggle stejné fáze vypne filtr.
- **Drag & drop** v mocku (desktop HTML5) — **nepovinné na mobile**; jako primární interakci držet **sheet** (spolehlivé na touch). DnD až jako follow-up pokud už existuje osvědčený pattern (projekt používá `@dnd-kit` jinde — nespouštět na mock).
- **Centrální +** → globální `QuickNewMobileSheet` (Nový úkol … Nahrát smlouvu).
- **Aktivní bottom tab:** Obchody při `/portal/pipeline*` (mapování už v [`pathnameToBottomTab`](../../apps/web/src/app/portal/mobile/route-helpers.ts)).
- **AI** zůstává nahoře v mobile chrome.

---

## 6. Drag & drop

**Nefikovat z mocku.** Pokud vývoj zjistí existující robustní řešení pro touch (např. dnd-kit s mobile sensors), lze jako fázi 2. **Primární** je **MoveDealStageSheet** + reálný `updateOpportunityStage`.

---

## 7. Number formatting

- Žádné zkrácené KPI typu `41...` — vždy **čitelný český formát**:
  - `41 tis. Kč`, `178 tis. Kč`, `1,2 mil. Kč` (logika analogická `moneyShort` v mocku — implementovat sdílenou utilitu v produkční lib, nesahat na řetězcové ellipsis pro částky).

---

## 8. Empty / loading / error

| Stav | Chování |
|------|---------|
| Loading | `MobileLoadingState` / skeleton bloky KPI + karet |
| Prázdný pipeline | strukturovaný empty (bez fake seed dat) |
| Error načtení | `MobileErrorState` / toast + retry nad `getPipeline` |

### Risk / focus fallback

- **Rizikové** a **Ve fokusu** se nesmí dopočítávat z mock dat.
- Pokud existuje reálný risk/overdue/SLA flag v pipeline datech, použij ho.
- Pokud takové pole neexistuje, zobraz bezpečný fallback: `0`, skryj badge, nebo text „Bez rizik“.
- Nehalucinuj rizikové obchody ani focus deals bez dat.
- Focus deal vybírej deterministicky z reálných dat: nejdřív risk/overdue, potom nejvyšší `expectedValue`, potom nejbližší `nextStep`/termín, jinak žádný focus empty state.

---

## 9. Production constraints

- Desktop CRM **nesmí** být rozbit desktop pipeline route — mění se jen **mobilní** screen soubory a sdílené mobile-ui, pokud je to žádoucí.
- **Žádné** změny API/DB bez samostatného úkolu a migrace (tento handoff nepřidává sloupce).
- Copy ve smyslu projektových compliance pravidel (interní CRM asistent — žádná produktová doporučení klientovi z platformy).

---

## 10. Acceptance criteria

- [ ] Obchody na 390–430 px bez horizontálního scrollu celé stránky (povoleny vnitřní stripy).
- [ ] Poslední obsah není useklý pod **floating** bottom nav (padding shellu platí).
- [ ] Společný top/bottom chrome odpovídá kontraktu; **žádný** PagePill ani fake StatusBar.
- [ ] Přesun fáze provádí reálná mutace, případně jasná chybová hláška.
- [ ] Lint/testy dotčených souborů procházejí.

---

## 11. Explicitně nekopírovat z mocku

- `PhoneShell`, `StatusBar`, `PagePill`.
- Lokální `ScreenKey`, `useState` pro výběr screenu — produkční routing přes Next.js.
- `seedDeals` a jakákoli pojmenovaná mock data jako zdroj pravdy.
- `moveDeal` pouze mění lokální `useState`.
- Vestavěný `<style>` **@keyframes** u sheetů — použít sdílený `BottomSheet` z primitives.
- Vlastní `ICONS` / SVG slovníky — použít lucide (`LayoutDashboard`, …) v produkci.
- Nový paralelní shell — vždy jen `MobilePortalClient` + `MobileAppShell`.

---

**Migrace SQL:** žádné — tento handoff neurčuje změny schématu.

---

**Reference v repu:** [`docs/mobile-redesign/references/deals-mock-v1.tsx`](references/deals-mock-v1.tsx)
