# Fáze 3B – canonical write contract (ledger a verze)

## Verze kontraktu

Konstanta `ASSISTANT_WRITE_CONTRACT_VERSION` v `apps/web/src/lib/ai/assistant-execution-engine.ts` se ukládá do `execution_actions.metadata` a `execution_actions.resultPayload`. Při změně sémantiky výsledku kroku nebo povinných polí plánovače ji zvyšte a dokumentujte v commit message.

## Metadata záznamu `execution_actions` (assistant write)

Pro řádky se `sourceType: "assistant"` a `executionMode: "assistant_confirmed"` pole `metadata` (jsonb) obsahuje mimo jiné:

- `stepId`, `sessionId`, `params` (jako dříve)
- `planId` – ID plánu z `buildExecutionPlan`
- `intentType` – canonical intent plánu
- `productDomain` – produktová doména plánu nebo `null`
- `fingerprint` – SHA-256 prefix z `computeStepFingerprint(step)`
- `contractVersion` – číslo shodné s `ASSISTANT_WRITE_CONTRACT_VERSION`

`resultPayload` doplňuje `fingerprint` a `contractVersion` pro snadný replay / debugging bez čtení jen `metadata`.

Sestavení řádku pro insert je v kódu centralizované v `buildAssistantLedgerInsertRow()` v `apps/web/src/lib/ai/assistant-execution-engine.ts` (volá ho `recordExecution`). Idempotentní replay z DB používá `idempotentHitResultFromLedgerPayload()`.

## Legacy cesty (mimo tento kontrakt)

- `assistant-crm-writes.ts` (hypo bundle) – vlastní idempotence v `opportunities.customFields`
- `actions/action-executors.ts` (`executeAiAction`) – jiný surface, bez `execution_actions` ledgeru asistenta

Tyto cesty zůstávají oddělené do doby, než je produktově sjednotíte s canonical drawer flow.
