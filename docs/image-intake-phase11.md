# AI Photo / Image Intake — Phase 11

## Co bylo dotaženo ve Fázi 11

### A) Typed session + orchestrator lifecycle cleanup
- `AssistantSession` dostala nový typed field `lastImageIntakeHandoffPayload?: ReviewHandoffPayload | null`
- Odstraněny oba `(session as Record<string, unknown>)._lastImageIntakeHandoffPayload` unsafe casty v `route-handler.ts` a `assistant-tool-router.ts`
- Přidán JSDoc ke `lifecycleFeedback` v `ImageIntakeOrchestratorResult` — vysvětluje proč je `null` by design (lifecycle se lookupuje až v route-handleru po submit)
- Zero runtime behavior change

### B) Household ambiguity resolution UI v1
- Nový **Household** tab v `/portal/admin/image-intake` admin page
- Lookup formulář: zadáš Client ID (a volitelně active context ID) → zobrazí se stav domácnosti
- Radio-button výběr ze všech household members s jasnou identifikací aktivního kontextu
- Confirm step s audit log zápisem (via `resolveHouseholdAmbiguity` action)
- Safe error state, success state s auditRef
- Žádný silent auto-pick — explicitní confirm required
- Žádné nové model calls — čistě read + audit

### C) Cron health external webhook v1
- Nový `cron-webhook.ts` utility: `sendCronHealthWebhook()` + `isCronWebhookConfigured()`
- Konfigurace: env var `IMAGE_INTAKE_CRON_WEBHOOK_URL` — volitelný, není-li nastaven, webhook se neposílá
- Integrováno do `image-intake-cleanup/route.ts` (ok, failed, skipped) — fire-and-forget
- Health endpoint `/health` nyní vrací `externalWebhookConfigured: boolean` v configSummary
- Failure webhook never throws, 5s timeout, no retry
- Zero request-time overhead pro cron

### D) Intent-assist cleanup schedule/config hardening
- Nový dedicated cron endpoint: `GET /api/cron/image-intake-cache-cleanup`
- Schedule: `0 */2 * * *` (každé 2h) — rozumné vůči default 30-min TTL intent-assist cache
- Registrován v `vercel.json` vedle stávajícího daily cleanup
- Stávající daily cleanup (`image-intake-cleanup`) zůstává jako safety net fallback pro artifacts (72h TTL)
- Nový config key `cache_cleanup_interval_hours` (default 2, min 0.5, max 24) pro ops visibility
- `getImageIntakeConfig()` nyní vrací `cacheCleanupIntervalHours`
- Minimum TTL guard v cache cleanup: nikdy nemaže záznamy fresher than 10 min

## Co zůstává jako optional Phase 12
- Household resolution výsledek dynamicky napojit do assistant session lock (automaticky nastavit `lockedClientId` po resolution)
- UI pro household resolution přímo v assistant chatu (inline, ne jen admin panel)
- Cron health dashboard page (aggregated view přes všechny cronjobs)
- External webhook retry logika (pokud je potřeba spolehlivost nad fire-and-forget)
- Household resolution historii (view past resolutions per household)

## Token disciplína v Phase 11
- Přečteno: 12 souborů (viz audit shortlist) — žádné phase docs, žádné generated blobs
- Minimální diff: 5 souborů upraveno, 3 nové soubory
- Žádné nové model calls ve všech deliverables
- Webhook je fire-and-forget — zero request blocking
- Cleanup schedule hardening přidalo < 120 řádků kódu
- Household UI reusuje existující admin page pattern (tabs, Badge, SectionTitle)
