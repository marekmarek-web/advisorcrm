# AI Výpověď smlouvy – datový model (fáze DB základ)

Scope zdroj pravdy pro tuto fázi: `packages/db/src/schema/termination-*.ts`, export v `packages/db/src/schema/index.ts`. UI a AI chat nejsou součástí tohoto dokumentu.

## Execute plan (shrnutí feature)

1. **Centrální entita** `termination_requests` napojená na CRM (`contacts`, `contracts`), zdrojový dokument (`documents`) a volitelně asistenta (`assistant_conversations`).
2. **Registr a katalog** – `insurer_termination_registry`, `termination_reason_catalog` jako seedovatelná referenční data (globální `tenant_id = NULL` nebo per-tenant override).
3. **Audit a provoz** – `termination_request_events`, strukturované přílohy `termination_required_attachments`, vazba na vygenerované soubory `termination_generated_documents` → `documents`, odeslání `termination_dispatch_log`.
4. **Další fáze** (mimo tento krok) – rules engine v aplikaci, seed skripty, migrace SQL, API/actions, wizard UI.

## Tabulky a vazby

| Tabulka | Účel | Klíčové FK |
|--------|------|------------|
| `insurer_termination_registry` | Pravidla kanálů, formulářů, příloh u pojistitele | — |
| `termination_reason_catalog` | Důvody výpovědi, výchozí výpočet data, review | — |
| `termination_requests` | Jedna žádost / workflow run | `contact_id`, `contract_id`, `source_document_id`, `source_conversation_id`, `insurer_registry_id`, `reason_catalog_id` |
| `termination_request_events` | Append-only události | `request_id` |
| `termination_required_attachments` | Požadavky na přílohy | `request_id`, `satisfied_document_id` |
| `termination_generated_documents` | Navázání CRM dokumentu na žádost | `request_id`, `document_id` |
| `termination_dispatch_log` | Pokusy o odeslání | `request_id` |

Enumy a string uniony jsou v `termination-enums.ts` (`terminationReasonCodes`, `terminationRequestStatuses`, `terminationModes`, kanály, typy událostí, …).

## Seed-ready konvence

### Pojistitel (`insurer_termination_registry`)

- **`catalog_key`**: Stabilní řetězec pro idempotentní seed (např. `cz:SLAVIA`, `cz:GENERALI`). V jedné migraci vžcky `ON CONFLICT` podle domluveného unikátního klíče (viz níže – partial indexy).
- **`tenant_id`**: `NULL` = globální řádek pro všechny tenanty; jinak override jen pro daného tenanta (stejný `catalog_key` u tenant scope).

Příklad záznamu pro seed definici (JSON-like, sloupce odpovídají schématu):

```json
{
  "catalog_key": "cz:EXAMPLE_INSURER",
  "tenant_id": null,
  "insurer_name": "Example pojišťovna a.s.",
  "aliases": ["EXAMPLE", "Example PV"],
  "supported_segments": ["ZP", "MAJ", "AUTO_PR"],
  "mailing_address": {
    "name": "Example – výpovědi",
    "street": "…",
    "city": "…",
    "zip": "…"
  },
  "freeform_letter_allowed": true,
  "requires_official_form": false,
  "allowed_channels": ["postal_mail", "data_box"],
  "attachment_rules": { "identity_copy": "recommended" },
  "registry_needs_verification": true,
  "active": true
}
```

### Důvod (`termination_reason_catalog`)

- **`reason_code`**: Kód z `terminationReasonCodes` (nebo rozšíření v nové migraci).
- **`default_date_computation`**: Hodnota z `terminationDefaultDateComputations` v `termination-enums.ts`.
- **`label_cs`**, **`instructions`**, **`supported_segments`**, **`required_fields`**, **`always_review`**, **`attachment_required`**, **`sort_order`**, **`version`**.

Příklad:

```json
{
  "tenant_id": null,
  "reason_code": "end_of_period_6_weeks",
  "label_cs": "Ke konci pojistného období / výročnímu dni (výpověď s lhůtou)",
  "supported_segments": ["ZP", "MAJ", "ODP", "AUTO_PR", "AUTO_HAV", "CEST"],
  "default_date_computation": "end_of_period_notice_6w",
  "required_fields": ["contract_anniversary_date", "requested_effective_date"],
  "attachment_required": false,
  "always_review": false,
  "sort_order": 10,
  "version": 1,
  "active": true
}
```

## Migrace (jeden SQL soubor)

Kompletní **`CREATE TABLE`**, cizí klíče, partial unikátní indexy a základní btree indexy jsou v repu:

`packages/db/migrations/termination_module_2026-04-07.sql`

Skript je idempotentní (`IF NOT EXISTS`). Spusť ho celý v Supabase SQL editoru (nebo psql) na databázi, kde už existují `contacts`, `contracts`, `documents`, `assistant_conversations`.

Alternativa pro lokální vývoj: po sladění schématu lze znovu použít `drizzle-kit generate`, ale zdroj pravdy pro produkci může zůstat tento soubor, dokud nebude migrační historie sjednocená.

Doplněk (šablona dopisu – volitelná pole): `packages/db/migrations/termination_document_builder_extras_2026-04-08.sql` přidává na `termination_requests` sloupec `document_builder_extras` (JSONB, výchozí `{}`) pro firemního pojistníka, poznámku pro review, datum PU, přepsání místa v záhlaví atd.

## Fáze 4 a 5 – CRM a externí intak (implementováno v aplikaci)

- **Stránka průvodce:** `/portal/terminations/new`
  - Query: `contactId`, `contractId` (CRM + konkrétní smlouva), jen `contactId` (klient bez smlouvy), bez parametrů (obecný intak).
  - `source=quick` – otevřeno z menu „+ Nový“ → `source_kind` = `quick_action`.
- **Server actions:** `apps/web/src/app/actions/terminations.ts` – `getTerminationWizardPrefill`, `listTerminationReasonsAction`, `createTerminationDraft` (rules engine + insert `termination_requests`, událost `rules_result`, řádky `termination_required_attachments`).
- **CRM UI:** v sekci smluv u kontaktu tlačítko **Výpověď** u každé smlouvy a odkaz **Výpověď bez smlouvy** (`ContractsSection.tsx`).
- **Rychlá akce:** položka „Výpověď smlouvy“ v katalogu `quick-actions.ts` (`termination_intake`).
- **Oprávnění:** čtení předvyplnění vyžaduje `contacts:read`, vytvoření draftu `contacts:write` (Viewer jen čte formulář).

## Fáze 6 – template draft v1 (document builder)

- **Typy (canonical view model):** `apps/web/src/lib/terminations/termination-letter-types.ts`
- **Builder (mapování DB → VM, validace, plain text dopis / formulářový blok):** `apps/web/src/lib/terminations/termination-letter-builder.ts`
- **Server action náhledu:** `getTerminationLetterPreview(requestId)` v `apps/web/src/app/actions/terminations.ts`
- **UI:** po uložení žádosti wizard zobrazí `TerminationLetterPreviewPanel` (badge, validační důvody, text vs. HTML náhled, průvodní dopis u formulářové pojišťovny, vodoznak u konceptu).
- **Extras:** `document_builder_extras` + builder (`termination-letter-builder.ts`, `termination-document-extras.ts`, `termination-letter-html.ts`).

Logika odpovídá draftu: volná forma jen pokud není `requiresOfficialForm` a registr dovoluje volný dopis; oficiální formulář negeneruje hlavní dopis, ale generuje průvodní list; datum v textu preferuje `computedEffectiveDate`; odstoupení na dálku má samostatnou šablonu (sekce 3.6); rozpor `requested` vs `computed` a nepotvrzené `fixed_date` mají odlišnou textaci / varování.
