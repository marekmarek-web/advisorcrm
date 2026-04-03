# Advisor AI asistent: session, zámek klienta a historie chatu

Tento dokument shrnuje **co běží na serveru** vs. **co uživatel vidí v UI**, aby se nepletla „obnova konverzace“ s **transkriptem chatu**.

## Server

- **In-memory session** ([`assistant-session.ts`](../apps/web/src/lib/ai/assistant-session.ts)): `Map` s TTL **30 minut**. Drží `lockedClientId`, aktivní kontext, poslední execution plán v paměti dané instance.
- **DB řádek konverzace** (`assistant_conversations`): perzistence `sessionId` (UUID konverzace), `tenant_id`, `user_id`, kanál, režim, **`locked_contact_id`**, metadata.
- **DB zprávy** (`assistant_messages`): každý tah uživatele + asistenta; u asistenta i `execution_plan_snapshot` a `meta` (např. varování).
- **Při každém POST** [`/api/ai/assistant/chat`](../apps/web/src/app/api/ai/assistant/chat/route.ts): `loadConversationHydration` + `loadResumableExecutionPlanSnapshot` obnoví z DB **zámek a čekající plán**, ne kompletní rich stav UI.

## Klient (drawer / mobil)

- **`sessionId`** se drží v `sessionStorage` a posílá se s každou zprávou.
- **Historie zpráv v rozhraní** se načítá z DB přes server actions / API (viz implementace), nikoli automaticky jen z paměti prohlížeče.
- **Seznam konverzací** (např. posledních 7 dní) je samostatný dotaz na `assistant_conversations` pro daného uživatele v tenantovi.
- Při **změně kontaktu v URL** může drawer resetovat lokální stav; záznamy v DB zůstávají.

## Slovník

| Termín | Význam |
|--------|--------|
| Obnova **metadata** | Hydratace zámku / kanálu / režimu z `assistant_conversations`. |
| Obnova **plánu** | Poslední uložený `execution_plan_snapshot` vhodný k pokračování ve schvalování. |
| **Historie chatu** | Řádky v `assistant_messages` načtené do UI (text + dostupná `meta` / plán). |

## Retence

Logiku mazání starších než 7 dní řeší samostatně (cron / politika), pokud ji zavedete; dotazy v UI filtrují posledních 7 dní u seznamu konverzací.
