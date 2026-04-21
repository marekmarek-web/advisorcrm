# Edge Config Kill-Switches (Delta A23)

**Cíl:** vypnout konkrétní funkcionalitu produkce **bez deploye** — při incidentu
(Resend outage, Anthropic rate limit, Stripe webhook flood, masové push misfires atd.).

---

## Architektura

```
Vercel Dashboard (manual edit)
           │
           ▼
    Edge Config Store (aidvisora-ops)
           │ <10ms reads from edge
           ▼
    apps/web/src/lib/ops/kill-switch.ts
      ├── call sites:
      │     ├─ app/portal/layout.tsx (MaintenanceBanner)
      │     ├─ app/client/layout.tsx (MaintenanceBanner)
      │     ├─ app/api/stripe/checkout/route.ts (STRIPE_CHECKOUT_DISABLED)
      │     ├─ lib/email/send-email.ts          (EMAIL_SENDING_DISABLED)
      │     └─ (further integrations TBD — viz roadmap dole)
      └── fallback: process.env.<KEY> (pokud Edge Config nedostupné)
```

---

## Setup (jednorázově, před launch)

### 1. Vytvoření Edge Config store

Vercel Dashboard → **Storage** → **Create Database** → **Edge Config**.

- **Name:** `aidvisora-ops`
- **Region:** Global (default)

### 2. Propojení s projektem

Po vytvoření → tab **Projects** → Connect → vybrat `aidvisora` Vercel project.

Vercel automaticky vytvoří env var `EDGE_CONFIG` (connection string) pro Production + Preview + Development.

**Ověření:**
```bash
vercel env ls | grep EDGE_CONFIG
# Očekáváme 3 řádky (prod / preview / dev).
```

### 3. Přidání klíčů (initial stav = všechno vypnuté)

Dashboard → Storage → `aidvisora-ops` → **Items** → "Add item":

```json
{
  "MAINTENANCE_MODE": false,
  "AI_REVIEW_UPLOADS_DISABLED": false,
  "DOCUMENT_UPLOADS_DISABLED": false,
  "PUSH_NOTIFICATIONS_DISABLED": false,
  "EMAIL_SENDING_DISABLED": false,
  "STRIPE_CHECKOUT_DISABLED": false,
  "NEW_REGISTRATIONS_DISABLED": false,
  "CLIENT_INVITES_DISABLED": false,
  "AI_ASSISTANT_DISABLED": false
}
```

### 4. Kontrola

Po deploy otevřít `/portal/admin/kill-switches` (dostupné pouze pro Admin roli).
Všechny řádky by měly být `off`, horní banner zelený.

---

## Operační postup při incidentu

### 1. Identifikovat postižený subsystem

Sentry / PostHog / uživatelské reporty → vybrat odpovídající kill-switch:

| Incident | Kill-switch |
|---|---|
| Resend je down | `EMAIL_SENDING_DISABLED` |
| Anthropic flap/timeout | `AI_REVIEW_UPLOADS_DISABLED` + `AI_ASSISTANT_DISABLED` |
| Stripe incident / webhook backlog | `STRIPE_CHECKOUT_DISABLED` |
| FCM payload corruption | `PUSH_NOTIFICATIONS_DISABLED` |
| Masivní spam registrace (bot sweep) | `NEW_REGISTRATIONS_DISABLED` |
| Plánovaná údržba (deploy, DB migration, …) | `MAINTENANCE_MODE` |

### 2. Aktivace

**Přes CLI (doporučeno — je to rychlejší):**

```bash
vercel edge-config set EMAIL_SENDING_DISABLED true
```

**Přes Dashboard:**

Storage → `aidvisora-ops` → Items → toggle → Save.

Propagace do všech edge regionů: **< 60 s**.
In-memory cache v aplikaci: **10 s TTL** (po 10 s každý nový request vidí aktualizovaný stav).

### 3. Ověření

```bash
curl -I https://aidvisora.cz/api/healthcheck   # všechny checks 200 = systém zdravý kromě toho co jsme vypnuli
```

Nebo otevřít `/portal/admin/kill-switches` — příslušný řádek bude `AKTIVNÍ` (rudá).

### 4. Po vyřešení incidentu

Vrátit na `false` stejným způsobem. Logovat incident do post-mortem dokumentu (`docs/incidents/`).

---

## Roadmap — další call-site integrace (post-launch)

Toto jsou kill-switche definované v `lib/ops/kill-switch.ts`, ale zatím **NEJSOU** wiring
všude, kde by potenciálně mohly být užitečné:

- [ ] `DOCUMENT_UPLOADS_DISABLED` → wiring v `app/api/ai-review/upload/route.ts`, `app/api/storage/**`.
- [ ] `AI_REVIEW_UPLOADS_DISABLED` → wiring v AI review pipeline entry-point (`lib/ai-review/kickoff`).
- [ ] `PUSH_NOTIFICATIONS_DISABLED` → wiring v `lib/push/fcm.ts` (early return + log).
- [ ] `NEW_REGISTRATIONS_DISABLED` → wiring v `app/register/*` + `app/api/auth/register/route.ts`.
- [ ] `CLIENT_INVITES_DISABLED` → wiring v `actions/client-invites.ts`.
- [ ] `AI_ASSISTANT_DISABLED` → wiring v `app/api/assistant/chat/route.ts`.

Každé wiring = 3–5 řádků: `if (await getKillSwitch("KEY")) return 503` + log.
Nepatří do pre-launch P0 práce — je to **roadmap after first incident**.

---

## Limity a known-issues

- **10s cache:** může se stát, že těsně po flipu switche se request za 1–9 s ještě netrefí. Při kritickém incidentu počítat s tímto oknem.
- **Fallback na ENV:** pokud je `EDGE_CONFIG` env var nesprávný nebo connection string chybí, použije se `process.env.<KEY>`. To znamená, že toggle v dashboard nic nedělá, ale ENV v Vercel projekt env vars ano. Po incidentu validovat, že read funguje přes `/portal/admin/kill-switches`.
- **Žádné progressive rollout:** tento layer je čistý on/off. Pro A/B nebo percentage rollout použít PostHog feature flags separátně.
