# Mock ingestion protocol — Aidvisora mobile

**Účel:** Jednotný postup převodu **TSX mocků z nástrojů typu GPT Canvas / Gemini Canvas** na produkční mobilní Aidvisoru. Mock je vždy **design reference**, nikoli hotový produkční kód.

Související dokumentace: [mobile-chrome-contract.md](./mobile-chrome-contract.md), [prototype-v1-handoff.md](./prototype-v1-handoff.md).

---

## 1. Kam ukládat TSX mocky

- Cesta: `docs/mobile-redesign/references/{screen-name}-mock-v{n}.tsx`
- Příklady: `deals-mock-v1.tsx`, `tasks-mock-v2.tsx`
- `{screen-name}`: anglické nebo krátké produktové jméno obrazovky (např. `deals`, `dashboard`, `calendar`).
- `{n}`: verze mocku (při každé větší iteraci designu zvýšit).

**Pravidlo:** Mock v repu slouží jen jako **archiv reference** a vstup pro handoff; **neimportuje se** do `apps/web` jako runtime kód.

---

## 2. Jak se mock převádí (pořadí)

1. **Handoff dokument** — vždy první stabilní výstup: `docs/mobile-redesign/handoffs/{screen-name}-handoff.md`
2. **Produkční implementace** — až po schválení / sladění handoffu
3. **Nikdy** nejdřív copy-paste celého mocku do aplikace

**Důvod:** Mock často obsahuje `PhoneShell`, fake routing, `seed` data a jednorázové styly. Produkce musí sedět na `MobilePortalClient`, `route-helpers`, server actions a sdílené `mobile-ui` primitives.

---

## 3. Co se smí z mocku „vytěžit“

- **Layout** — skladba sekcí, grid vs. stack
- **Spacing** — mezery mezi bloky, padding karet
- **Vizuální hierarchie** — co je hero, co sekundární
- **Struktura karet** — hlavička, meta, akce
- **Barvy a gradienty** — mapovat na **tokeny** v `globals.css` / Tailwind konzistentně s mobile foundation
- **Typografická škála** — velikosti nadpisů, labely
- **Záměr interakce** — tap → detail, sheet pro sekundární akci
- **Bottom sheet UX** — handle, výška, primární akce
- **Empty / loading / error** — copy a struktura (bez falešných dat)

---

## 4. Co se nesmí převzít

| Zakázáno | Proč |
|----------|------|
| `PhoneShell` / rámeček telefonu | Host je jen `MobileAppShell` |
| Fake `StatusBar` / notch strip | Produkcí řeší OS / safe-area |
| Mock data pole jako „produkční“ data | Vždy reálné zdroje (actions / API) |
| Lokální routing přes `useState(screen)` | Next.js URL + `route-helpers` |
| Fake mutace (`setTimeout`, čistě lokální `setState`) | Server actions / existující toasty |
| Vlastní ikonová sada ze mocku | `lucide-react` / existující brand komponenty (např. `AiAssistantBrandIcon`) |
| Duplicitní top/bottom chrome uvnitř screenu | Jeden shell v `MobilePortalClient` |
| `<style>` s inline `@keyframes` v komponentách | Sdílené animace / `tailwindcss-animate`, existující `BottomSheet` |
| Nový paralelní shell vedle mobilního portálu | Zakázáno |

---

## 5. Povinný výstup po každém mock screenu

**Soubor:** `docs/mobile-redesign/handoffs/{screen-name}-handoff.md`

Minimální sekce:

1. **Screen purpose** — k čemu má obrazovka sloužit (jedna věta + kontext uživatele)
2. **Exact visual hierarchy** — pořadí bloků od shora dolů (odpovídá mocku screenshot / hierarchy)
3. **Reusable components** — navrhované názvy + mapování na `MobileCard`, `BottomSheet`, atd.
4. **Data sources** — jaké entity / actions/API (ne hardcoded řádky)
5. **Interactions** — tap, long press, navigace, otevírání sheetu
6. **States** — loading, empty, error, částečná data
7. **Production constraints** — práva rolí, desktop parity, bez změny DB bez migrace
8. **Acceptance criteria** — měřitelné OK pro QA (390–430 px, žádný clip pod tab barem)
9. **Explicitně nekopírovat z mocku** — seznam jako v tabulce výše

---

## 6. Produkční implementace musí vždy

- Používat **existující mobile shell** (`MobilePortalClient` + `MobileHeader` / `MobileBottomNav`)
- Používat **sdílené primitives** z `apps/web/src/app/shared/mobile-ui/`
- **Neměnit** desktop layout webového portálu mimo záměr (oddělené layouty)
- Zachovat **business logiku** — stejné server actions / služby jako u stávajícího screenu
- **Žádná fake produkční data** v produkční cestě
- Po změně: **lint** a **testy** dotčených souborů (viz tým / CI)

---

## 7. Checklist před merge

- [ ] Handoff MD existuje a odpovídá poslední verzi mocku v `references/`
- [ ] Žádný import mock TSX v `apps/web`
- [ ] Shell: jedna horní lišta, jedna spodní nav, centrální + podle kontraktu
- [ ] SQL: pokud úkol nezahrnoval DB změny, v PR uveďte „žádná migrace“

---

**Související soubory v kódu**

- `apps/web/src/app/portal/mobile/MobilePortalClient.tsx`
- `apps/web/src/app/portal/mobile/route-helpers.ts`
- `apps/web/src/app/shared/mobile-ui/primitives.tsx`
- `docs/mobile-redesign/mobile-chrome-contract.md`
