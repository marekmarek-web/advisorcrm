# UI policy – Advisor CRM (WePlan MVP)

Pravidla pro konzistentní chování UI v CRM (board, panely, formuláře). Reference: `portal/weplan.html`.

## Popovery a modály

- **Maximálně jeden popover otevřený** – při otevření nového popoveru (status, column menu, label edit atd.) se předchozí zavře.
- **ESC zavře** – klávesa Escape zavře aktivní popover, dropdown nebo right panel.
- **Click-outside zavře** – kliknutí mimo otevřený popover/dropdown ho zavře (bez potvrzení, pokud není nutné).

## Akce a formuláře

- **Inline edit:** Enter uloží změnu, Esc zruší bez uložení.
- **Konzistentní akce** – primární tlačítko pro potvrzení, sekundární pro zrušení; u destruktivních akcí (smazat) potvrzovací dialog.

## Design tokens

- Jednotné fonty, spacing a bordery dle `apps/web/src/styles/monday.css` a Tailwind (monday-*).
- Bez výrazných stínů a gradientů – Monday-like, plochý styl.
