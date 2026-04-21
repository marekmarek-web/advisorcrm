# PITR Restore Drill — runbook (Delta A26)

**Stav:** mandatory **PŘED** P0 PII backfillem (`scripts/security/backfill-contacts-pii.ts`).
**Cíl:** prokazatelně ověřit, že umíme obnovit prod Supabase projekt z Point-In-Time Recovery (PITR)
do staging projektu, včetně rozumného RPO (< 5 min) a RTO (< 30 min).

---

## Proč to děláme teď

Spouštění šifrovacího backfillu přepíše `personal_id_number`, `id_card_number`, `bank_account`,
`phone`, `email_normalized` do ciphertextu. Pokud se v backfillu vyskytne logická chyba
(špatný key ID, truncace, nechtěný UPDATE bez WHERE), **nemáme cestu zpět** ze současné zálohy,
protože plaintext je v original field nepermanentně.

**Proto musíme mít:**

1. ✅ Ověřený PITR restore postup (tento dokument).
2. ✅ Ověřeno, že PITR je v plánu zapnuté a retenece ≥ 7 dní.
3. ✅ Staging projekt, kam je možné bez rizika restore provést.
4. ✅ Notebook s krok-za-krokem postupem (bez "muže uprostřed" — jediný operátor to zvládne).

---

## Prerekvizity

- **Supabase plán:** Pro plan nebo vyšší (PITR není na Free/Starter).
- **Projekty:**
  - `aidvisora-prod` — zdrojový projekt (PITR ON).
  - `aidvisora-staging` — cílový projekt (na něj budeme restoreovat).
- **Role operátora:** org-level `Owner` nebo `Administrator` — PITR restore vyžaduje
  dashboard privileges.
- **MCP / CLI:** `supabase` CLI ≥ 1.170 nebo přístup do Dashboard > Database > Backups.
- **Monitor:** otevřený `psql` klient ke staging připojený pro post-restore verifikaci.

---

## Checklist (před spuštěním backfillu)

- [ ] PITR zapnuto na prod a retention ≥ 7 dní (Dashboard > Settings > Database > Point in Time Recovery).
- [ ] `aidvisora-staging` existuje, DB specs stejné jako prod (region, Postgres major version, extensions).
- [ ] Všechny migrations z prod jsou aplikované na staging (diff kontrola přes `supabase db diff`).
- [ ] Provedený alespoň jeden úspěšný PITR drill (kroky níže) a zdokumentovaný v tomto souboru.
- [ ] Incident runbook (dole) přezkoušen — víme přesně co klikáme, když production dojde.

---

## PITR Drill — kroky

### 1. Zvolit restore point

Ideálně **10 minut zpět** od aktuálního času — simulujeme recovery z "před 10 min".

```bash
# Podle aktuálního času si poznačte ISO timestamp (UTC!).
date -u +"%Y-%m-%dT%H:%M:%SZ"
# → např. 2026-04-21T15:30:00Z
# Target restore = minus 10 min = 2026-04-21T15:20:00Z
```

### 2. Spustit PITR restore do staging

**Via Dashboard (doporučeno pro první drill):**

1. Otevřít Supabase Dashboard → `aidvisora-prod` → Database → Backups → **Point in Time Recovery**.
2. Zvolit target timestamp (UTC).
3. "Restore to project" → cíl `aidvisora-staging`.
4. Potvrdit. Proces běží 5–20 min podle velikosti DB.

**Via CLI (pro automatizaci pozdějších drill-ů):**

```bash
# Pozor: PITR přes CLI vyžaduje service role key a explicit target.
supabase db restore \
  --project-ref <staging-project-ref> \
  --source-project-ref <prod-project-ref> \
  --target-time "2026-04-21T15:20:00Z"
```

### 3. Post-restore verifikace

Po dokončení restore otevřít staging DB a ověřit:

```sql
-- a) Basic row counts vs. prod (musí být v řádu ±1 % — rozdíl = 10 min aktivity).
SELECT 'contacts' as t, count(*) FROM public.contacts
UNION ALL SELECT 'contracts', count(*) FROM public.contracts
UNION ALL SELECT 'user_terms_acceptance', count(*) FROM public.user_terms_acceptance
UNION ALL SELECT 'audit_logs', count(*) FROM public.audit_logs;

-- b) Najít nejnovější záznam — musí mít created_at blízko restore_time.
SELECT max(created_at) FROM public.audit_logs;

-- c) Sample row čitelný (žádný corruption).
SELECT id, email, created_at FROM public.contacts ORDER BY created_at DESC LIMIT 5;

-- d) Extensions identické.
SELECT extname, extversion FROM pg_extension ORDER BY extname;

-- e) RLS enabled (po restore zůstává, ale pro jistotu).
SELECT schemaname, tablename, rowsecurity FROM pg_tables
WHERE schemaname = 'public' AND rowsecurity = false;
-- → Expected: empty result (všechny public tabulky mají RLS ON).
```

### 4. Zdokumentovat výsledky

Zapsat do tabulky níže jako další řádek (RTO = celkový čas od kliknutí "Restore" do bodu kdy queries proběhly).

---

## Drill Log

| Datum | Operátor | RTO (min) | RPO (sec) | Zdroj | Cíl | Poznámka |
|---|---|---|---|---|---|---|
| _(vyplnit první drill)_ | | | | | | |

---

## Incident runbook — "produkce dojde"

Pokud dojde k **data loss eventu** v produkci (nechtěný DELETE, korupce, failed backfill):

1. **NEPANIKAŘIT.** Zastavit zápisy do DB okamžitě:
   - Vypnout kill-switch v Vercel Edge Config (A23, až bude nasazený), nebo
   - `supabase projects api-keys revoke --project-ref <prod>` — blokuje všechny writes.
   - Zobrazit maintenance banner (globals.tsx, ENV `MAINTENANCE_MODE=true`).
2. **Určit restore timestamp** — čas těsně před problémovou událostí (grep audit_logs / Sentry).
3. **PITR restore do staging** (ne přímo do prod!) kroky 1–3 výše.
4. **Verifikovat data** ve staging — udělat spot-check proti user reportům.
5. **Export kritických tabulek** (contacts, contracts, messages) z staging do CSV.
6. **Import do prod** — buď upsert patch skript, nebo (v nejhorším) PITR prod projektu na ten stejný timestamp.
   **POZOR:** PITR prod = ztráta všech zápisů od restore time. Používat jen pokud
   export-import není možný.
7. **Post-mortem do `docs/security/`** — co, proč, jak opraveno, co se přidává do testů.

---

## Budoucí automatizace (post-launch)

- **Měsíční drill:** GitHub Action, která automaticky spustí PITR na staging, ověří
  row counts a pošle Slack notifikaci. Bez člověka pouze pokud předchozí drill prošel 2× po sobě.
- **Alert:** Supabase webhook na failed backup → Sentry alert.
