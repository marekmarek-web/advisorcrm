# Security

## RBAC

- **Admin:** plný přístup v rámci tenanta (včetně nastavení, rolí, členů).
- **Manager:** jako Advisor + správa uživatelů (bez změny vlastní role).
- **Advisor:** CRUD kontakty, domácnosti, případy, úkoly, události, meeting notes, dokumenty; čtení nastavení.
- **Viewer:** pouze čtení.

Ověření na každém API requestu: JWT → user_id → membership → role → kontrola oprávnění k akci.

## MFA

- TOTP (Google Authenticator kompatibilní). Pole `memberships.mfa_enabled`. Zapnutí v profilu uživatele; doporučeno pro Admin/Manager.

## Šifrování

- **In-transit:** TLS (HTTPS). Vercel/Supabase poskytují TLS.
- **At-rest:** Supabase šifruje databázi a storage. Klíče spravuje Supabase.

## Audit log

- Zapisovat: login, logout, export dat, vytvoření/úprava/smazání entit, upload/download dokumentu. Pole: tenant_id, user_id, action, entity_type, entity_id, meta, ip_address, user_agent, created_at.

## Incident log (DORA-ready)

- Entita **incident_logs**: title, description, severity, status, reported_by, reported_at, resolved_at. UI pro přidání a uzavření incidentu. Export pro reporting.

## Backup a obnova

- Supabase: automatické denní zálohy. Obnova dle dokumentace Supabase. Lokální záloha: `pg_dump` z connection stringu (dokumentovat v runbooku).

## Rate limiting

- **Login endpoint:** Implementovat rate limiting na `/api/auth/login` (max 5 pokusů / IP / minuta).
- **Možnosti:**
  - Supabase Auth má vestavěný rate limiting na auth operace.
  - Pro další endpointy: Next.js middleware s in-memory counter nebo Redis-based limiter.
  - Vercel Edge Functions mají vestavěný rate limiting (Vercel Firewall).
- **MVP:** Spoléháme na Supabase Auth rate limiting. Pro produkci přidat middleware rate limiter.

## MFA nastavení

- Supabase Auth podporuje TOTP (Time-based One-Time Password) – kompatibilní s Google Authenticator, Authy.
- **Zapnutí:** V Supabase Dashboard → Authentication → Multi-Factor Authentication → Enable MFA.
- **UI:** V portalu → Setup view přidat odkaz na nastavení účtu (MFA enrollment).
- **Doporučení:** Povinné pro role Admin a Manager; volitelné pro Advisor.
- **Pole:** `memberships.mfa_enabled` – tracking v DB.

## Session expiration

- Supabase Auth: defaultní session expiration je 1 hodina (access token), refresh token 60 dní.
- Pro vyšší bezpečnost lze nastavit kratší expiration v Supabase Dashboard → Authentication → Settings.
- Middleware na `/portal` a `/dashboard` ověřuje platnost session při každém requestu.

## OWASP baseline

- Vstupy validovat a escapovat. SQL přes ORM (Drizzle), žádné raw SQL z uživatelského vstupu. Upload: povolené MIME typy a max velikost. CORS omezen na doménu aplikace. Rate limiting na auth a export endpointy (Vercel / middleware).

## AI guardrails

- **Suggest-only (copilot, not autopilot):** AI navrhuje text a návrhy; uživatel je vždy rozhoduje, co použije nebo odešle.
- **Kontrola smluv:** změny z AI review vyžadují explicitní **Approve** a **Apply** – žádné tiché aplikování bez potvrzení.
- **Označení v UI:** výstupy z AI jsou v rozhraní jasně označené jako generované / návrh od AI.
- **Žádné přepsání CRM bez potvrzení:** data v CRM se nemění automaticky podle AI; změny jen po potvrzení uživatelem.
- **Logování:** interakce s AI se zapisují do tabulky `ai_generations` a relevantní akce do `audit_log` pro dohledatelnost.
