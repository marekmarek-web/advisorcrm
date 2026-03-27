# Klientské pozvánky a Supabase Auth (produkce)

Tento dokument doplňuje implementaci pozvánek do klientské zóny (`client_invitations`, `/register?token=…`, `/prihlaseni`).

## Povinné proměnné prostředí

- `NEXT_PUBLIC_APP_URL` — kanonická URL aplikace (bez koncového `/`). Používá se v odkazu v e-mailu a v šabloně pozvánky.
- `DATABASE_URL` — připojení k Postgres (Supabase). Po nasazení migrace [`packages/db/migrations/client_invitations_audit_columns.sql`](../packages/db/migrations/client_invitations_audit_columns.sql) obsahuje tabulka `client_invitations` sloupce `invited_by_user_id`, `email_sent_at`, `last_email_error`, `revoked_at`.
- `RESEND_API_KEY` — pokud chybí, pozvánka se vytvoří v DB a odkaz se zobrazí v CRM, ale transakční e-mail se neodešle (vývojářský režim loguje do konzole přes `sendEmail`).

Volitelně: `EMAIL_FROM` / výchozí From pro Resend, `RESEND_REPLY_TO` nebo firemní e-mail tenanta (`tenants.notification_email`) jako Reply-To.

## Potvrzení e-mailu (Email confirmations)

Supabase může vyžadovat potvrzení e-mailu po `signUp`.

- Pokud je **Confirm email** zapnuté, klient po zadání hesla nemusí dostat okamžitě session; dokončení pozvánky (`acceptClientInvitation`) proběhne až po potvrzení a přihlášení.
- Doporučení: v šabloně potvrzovacího e-mailu v Supabase nastavte **Redirect URL** zpět na `${NEXT_PUBLIC_APP_URL}/prihlaseni` (případně s query `token` uloženým v jiném kroku — token je v praxi v odkazu z pozvánky, který klient znovu otevře).
- Alternativa pro striktní produkci: použít Supabase Admin API `inviteUserByEmail` pro klienty (jednorázový magic link) — vyžaduje samostatnou integraci mimo aktuální heslový tok.

## Bezpečnost a RLS

- Metadata pozvánky (`GET /api/invite/metadata`) jsou dostupná jen s platným tokenem; odpověď je rate-limitovaná podle IP.
- Tabulka `client_invitations` by neměla být čitelná přímo z `anon` klientem přes PostgREST, pokud aplikace používá serverové dotazy přes `DATABASE_URL`.

## Tok stručně

1. Poradce spustí akci → řádek v `client_invitations`, předchozí neakceptované pozvánky pro stejný kontakt se označí `revoked_at`.
2. Odešle se e-mail přes Resend (pokud je klíč nastaven).
3. Klient otevře `/register?token=…` → přesměrování na `/prihlaseni` s tokenem, předvyplněný e-mail, heslo, GDPR checkbox, bez OAuth.
4. Po přihlášení/registraci se zavolá `acceptClientInvitation` → `memberships` (role Client), `client_contacts`, `accepted_at`.
