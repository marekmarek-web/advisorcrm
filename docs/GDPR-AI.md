# GDPR-safe práce s dokumenty a AI

Pravidla pro minimalizaci rizik při zpracování osobních údajů v dokumentech a při použití AI.

## Principy

### Minimalizace dat před AI

- Do AI modelu **posílat pouze strukturovaný výřez** (AI-ready snapshot z view `client_ai_context`), ne raw dokumenty, pokud to stačí (briefing, next best action, draft email).
- **Raw dokument do AI** pouze když je to nutné (např. konkrétní extrakce z PDF). V takovém případě nepředávat zbytek klientských dat navíc a používat krátký kontext.
- **Oddělení:** Raw dokument v storage; metadata a extrahovaná pole v DB. AI summary vrstva neukládá surové prompty ani plné odpovědi s citlivými daty.

### Kontrolovaný kontext

- AI má číst primárně **konsolidovaný a sanitizovaný klientský model** (`client_ai_context`), ne náhodně raw texty dokumentů, pokud to není nezbytně nutné.
- Funkce jako draft email, briefing, next best action používají `getClientAiContext()` nebo obdobnou vrstvu.

### Logování a retention

- V **audit_log** neukládat obsah dokumentů ani full prompt/response; pouze reference (entityType, entityId, action, případně feature name).
- U dokumentů a extrakcí mít v budoucnu možnost mazání dle retention policy (např. `processing_purposes.retention_months`).
- Žádné nekontrolované logování citlivého obsahu.

### Citlivé dokumenty

- Dokumenty lze označit jako citlivé (`documents.sensitive`). Přístup jen pro oprávněné role; při přístupu lze logovat do audit_log (action např. `sensitive_document_view`).

## Implementace

- **Kontext pro AI:** `getClientDetails` a `getClientAiContext()` — vždy tenant-scoped, omezená pole.
- **Žádné ukládání citlivých promptů** v aplikaci; ukládat jen potřebné strukturované výstupy (např. doporučené akce), pokud je budete persistovat.
- **Extrakce:** Extrahovaná data v `document_extraction_fields` s označením zdroje (extraction / manual / corrected) a review stavem; „trusted“ až po validaci.

## Odkazy

- [SOURCES-OF-TRUTH.md](./SOURCES-OF-TRUTH.md) — zdroje pravdy pro klientská data
- `client_ai_context` view a `getClientAiContext()` v aplikaci
- `audit_log` pro upload, delete, download, extraction lifecycle
