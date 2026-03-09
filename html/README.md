# HTML verze – kde to upravovat

Tady máte **čisté HTML soubory**. Jsou v složce:

**`advisor-crm/html/`**

1. **Otevřít v prohlížeči** – dvojklik na `index.html` (nebo pravý klik → Otevřít v prohlížeči).
2. **Upravit** – otevřete kterýkoliv soubor v Cursoru, VS Code nebo Notepadu a měňte texty, tagy, styly přímo v HTML.

## Soubory

| Soubor | Obsah |
|--------|--------|
| **index.html** | Úvodní stránka (hlavní „index“) |
| **login.html** | Přihlášení |
| **dashboard.html** | Přehled Dnes |
| **contacts.html** | Kontakty |
| **households.html** | Domácnosti |
| **pipeline.html** | Pipeline |

## Branding (barvy)

V každém souboru je v `<head>` blok `<style>` s proměnnými:

- `--brand-main: #0B3A7A` (modrá)
- `--brand-dark: #0a0f29` (tmavá pro nadpisy)
- `--brand-light: #EAF3FF` (pozadí)
- `--brand-border: #D6E6FF` (okraje)

Chcete-li změnit barvy, upravte tyto řádky ve všech HTML souborech.

## Poznámka

Toto je **statická** verze (bez databáze a přihlašování). Aplikace s plnou funkcí běží v Next.js (`pnpm dev`). Tyto HTML slouží k úpravě vzhledu a textů – můžete je kdykoli editovat a prohlížet.
