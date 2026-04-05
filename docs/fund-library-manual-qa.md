# Fondová knihovna — ruční QA v prohlížeči

Krátký checklist před / po nasazení. Přihlášený poradce, reálný tenant (ne jen demo bypass).

## Databáze (jednorázově před testem UI)

- [ ] `pnpm db:migrate` doběží bez chyby (obsahuje `0020_fund_library_settings`), **nebo** je aplikováno `fund_library_settings_2026-04-06.sql` / `pnpm db:apply-schema` na cílové DB.
- [ ] V `advisor_preferences` existuje sloupec `fund_library` (jsonb).
- [ ] Tabulka `fund_add_requests` existuje s indexem `fund_add_requests_tenant_created_idx`.

## Nastavení (Setup)

- [ ] Otevřít sekci s fondovou knihovnou (Nastavení → Fondová knihovna / dle vašeho routování).
- [ ] **Whitelist firmy:** zapnout/vypnout fondy, uložit, obnovit stránku — stav sedí.
- [ ] **Můj výběr:** přeřadit pořadí, vypnout jeden fond, uložit, refresh — pořadí a přepínače sedí.
- [ ] **Chci přidat fond:** odeslat požadavek s povinným názvem — toast OK, záznam v „Požadavky na nové fondy“, změna stavu (Nový → Řeší se → …) uloží.

## Finanční analýza

- [ ] **Žádný fond zapnutý** (všechny vypnuté v nastavení / prázdný effective seznam): krok investic neobsahuje zakázané fondy; žádný crash.
- [ ] **Několik fondů zapnuto:** v kroku strategie jsou jen povolené fondy, loga se načtou nebo po chybě obrázku iniciály (StepStrategy).
- [ ] **Legacy analýza** (import / starý `productKey` např. `ishares`): mapuje na MSCI World, zobrazí se správný název a detail.

## Výstupy

- [ ] **HTML report** (náhled / tisk): sekce detailu produktu má hero + galerii nebo prázdné místo po `onerror` bez rozbití layoutu.
- [ ] **PDF:** generuje se bez chyby; loga v tabulkách portfolio jsou záměrně textové fallbacky (bez `<img>` v PDF builderu).

## Regrese

- [ ] Žádná 404 na cestách `/logos/funds/_placeholder.svg`, `/report-assets/_placeholders/fund-hero.svg`, `fund-gallery.svg` při běžném průchodu.
