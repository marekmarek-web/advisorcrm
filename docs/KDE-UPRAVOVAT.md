# Kde co upravovat (Aidvisora)

V Next.js není jeden soubor `index.html`. Obsah se skládá z komponent a layoutů.

## Úvodní stránka („index“)

- **Soubor:** `apps/web/src/app/page.tsx`
- Úprava: nadpis, popis, tlačítka (Přihlásit se, Dashboard). Jde o React/JSX – měň texty v uvozovkách a třídy `className` pro vzhled.

## Celková „obal“ stránky (hlavička, font, meta)

- **Soubor:** `apps/web/src/app/layout.tsx`
- Úprava: `metadata` (title, description), font (`Inter`), `<html>` / `<body>`.

## Globální styly a branding (osobni-web-finance)

- **Soubor:** `apps/web/src/app/globals.css`
- Barvy: `--brand-main` (#0B3A7A), `--brand-dark` (#0a0f29), `--brand-light` (#EAF3FF), `--brand-border` (#D6E6FF), `--brand-accent` (#ffcc00). Pozadí stránek: `var(--brand-light)`.
- Úprava: změň hodnoty v `:root` pro sjednocení s jiným brandingem.

## Přihlášení

- **Soubor:** `apps/web/src/app/login/page.tsx`
- Úprava: formulář, texty, vzhled přihlašovací stránky.

## Dashboard a menu

- **Layout (menu v horní liště):** `apps/web/src/app/dashboard/layout.tsx`
- **Přehled „Dnes“:** `apps/web/src/app/dashboard/page.tsx`
- **Kontakty:** `apps/web/src/app/dashboard/contacts/page.tsx`
- **Domácnosti:** `apps/web/src/app/dashboard/households/page.tsx`
- **Pipeline:** `apps/web/src/app/dashboard/pipeline/page.tsx`

Po úpravě ulož soubor – při běžícím `pnpm dev` se stránka automaticky obnoví.

## SQL migrace a Supabase SQL Editor

- **Přehled doplnění (nejnovější vždy poslední v seznamu, odkazy na `.sql`):** [`docs/SQL-DOPOJENI.md`](./SQL-DOPOJENI.md)
