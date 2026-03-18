# Zdroje pravdy (Sources of Truth)

Tento dokument definuje, které tabulky a pole jsou **primárním zdrojem** pro jednotlivé typy dat v CRM. Slouží jako základ pro klientský datový model, AI-ready vrstvu a reporty.

## Pravidla

- **Manuální údaje:** většina `contacts`; ruční úpravy v extrakci (`correctedPayload` / `document_extraction_fields`).
- **AI-extracted / needs review:** pole v `document_extraction_fields` se `source = 'extraction'` a bez `reviewed_at`; nebo `contract_upload_reviews.extractedPayload` před validací.
- **Agregace:** poslední kontakt, počet aktivních smluv, počet otevřených obchodů — vždy **počítané** z níže uvedených tabulek, ne duplicitně uložené.

---

## Mapování: údaj → zdroj

| Údaj / oblast | Primární zdroj | Alternativa / poznámka |
|---------------|----------------|------------------------|
| Jméno, kontakt, adresa | `contacts` | — |
| Domácnost | `households` + `household_members` | — |
| Cíle, příjmy, výdaje, majetek, závazky, priority, rizika, mezery | `financial_analyses.payload` | `financial_shared_facts` pro propojení s firmou |
| Datum/stav poslední analýzy | `financial_analyses` (updatedAt, status) | — |
| Aktivní produkty, typy produktů | `contracts` | — |
| Důležité výročí (smlouvy) | `contracts.anniversaryDate` | — |
| Klíčové parametry smlouvy (číslo, prémie) | `contracts` | Po validaci i z `document_extraction_fields` |
| Poslední kontakt | `events.startAt`, `meeting_notes.meetingAt`, `timeline_items.createdAt` | Agregace max datum |
| Otevřené příležitosti | `opportunities` (closedAt IS NULL) | — |
| Úkoly (otevřené) | `tasks` (completedAt IS NULL) | — |
| Servisní připomínky | `contacts.lastServiceDate`, `nextServiceDue`, `contact_coverage` | — |
| Doporučení | `contacts.referralContactId` | — |
| Extrahovaná pole ze smluv | `document_extractions` + `document_extraction_fields` | „Trusted“ až po review; jinak „AI-extracted / needs review“. Pro upload flow zatím také `contract_upload_reviews.extractedPayload` / `correctedPayload`. |

---

## Logické vrstvy klientského modelu

- **A. Identita:** `contacts`, `household_members`, `households`
- **B. Finanční obraz:** `financial_analyses`, `financial_shared_facts`
- **C. Produktový a smluvní:** `contracts`, `document_extractions`, `document_extraction_fields`
- **D. Obchodní a servisní:** `opportunities`, `tasks`, `events`, `meeting_notes`, `timeline_items`, `contact_coverage`
- **E. Časová vrstva (timeline):** události z B–D s datumem, typem a zdrojovou entitou
- **F. AI-ready vrstva:** view `client_ai_context` (kontrolovaný výřez pro AI a summary)

Viz také plán Fáze 0 a view `client_ai_context`.
