# Migrace: user_google_calendar_integrations

## Proč je schéma navrženo takto

- **Tabulka** `user_google_calendar_integrations`: název v souladu s konvencí (snake_case v DB, konkrétní integrace v názvu).
- **user_id (text), tenant_id (uuid)**: stejný pattern jako `memberships` a `advisor_preferences` – uživatel = Supabase Auth ID (text), bez FK na `auth.users` (ta je v jiném schématu). `tenant_id` s FK na `tenants(id)` zajišťuje multi-tenant izolaci.
- **UNIQUE(tenant_id, user_id)**: jeden aktivní Google Calendar napojení na uživatele v rámci tenanta.
- **Tokeny (access_token, refresh_token)**: sloupce pro uložení; v aplikační vrstvě doporučeno ukládat je šifrované (např. AES-256-GCM s klíčem z env). Projekt jinde tokeny v DB nemá, takže žádný společný pattern – aplikace může před insert/update šifrovat a po select dekódovat.
- **token_expiry, scope, calendar_id**: nullable – Google vrací expiry; scope může být jeden řetězec; calendar_id pro výběr kalendáře (primary vs. jiný).
- **is_active**: soft-disable bez mazání záznamu (odpojení / znovupřipojení).
- **updated_at**: bez triggeru – v projektu se nikde nepoužívá trigger pro automatické nastavení `updated_at`; aplikace ho při UPDATE nastaví.
- **Indexy**: `user_id` pro „můj záznam“, `(user_id, is_active) WHERE is_active = true` pro rychlý výběr aktivního napojení.
- **RLS**: zapnuto s politikami SELECT/INSERT/UPDATE/DELETE pouze pro řádky kde `(auth.uid())::text = user_id`, takže uživatel vidí jen své napojení; backend se service role RLS obchází.

## Spuštění

V Supabase SQL Editoru vlož a spusť obsah souboru `add_user_google_calendar_integrations.sql`, nebo:

```bash
psql "$DATABASE_URL" -f packages/db/migrations/add_user_google_calendar_integrations.sql
```
