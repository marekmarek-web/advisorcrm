# AI Review — Fáze 0 (audit / freeze) a Fáze 1 (UX) — souhrn

Datum: 2026-04-03  
Repo: `Developer/Aidvisora`

## 1. Source of truth — AI review flow (nepřestavovat)

| Vrstva | Soubory | Role |
|--------|---------|------|
| Detail stránka | `apps/web/src/app/portal/contracts/review/[id]/page.tsx` | Načtení API, polling, `pdfUrl`, akce schválení / CRM |
| Shell | `apps/web/src/app/components/ai-review/AIReviewExtractionShell.tsx` | Layout, bannery, apply gate, override „finální smlouva“, horní CTA |
| Levý panel | `apps/web/src/app/components/ai-review/ExtractionLeftPanel.tsx` | Sekce Shrnutí / Pole / Kontroly, pole, doporučení |
| PDF | `apps/web/src/app/components/ai-review/PDFViewerPanel.tsx` | iframe + fallback |
| Mapování | `apps/web/src/lib/ai-review/mappers.ts`, `czech-labels.ts` | API → `ExtractionDocument`, labely, skupiny |
| Apply gate copy | `AIReviewExtractionShell.tsx` (`APPLY_GATE_REASON_LABELS`, `resolveApplyOverrideOptions`) | Blokace zápisu, ruční potvrzení finální smlouvy |
| Soubor PDF | `apps/web/src/app/api/contracts/review/[id]/file/route.ts` | Signed URL ze Supabase storage |
| Akce | `apps/web/src/app/actions/contract-review.ts` | Schválení, apply, výběr klienta |

**Nebuildovat znovu:** paralelní „druhý“ AI review, nový datový model revize, nahrazení celé pipeline extrakce — pouze iterativní vylepšení výše uvedených vrstev.

## 2. Gap register (proti scanům / feedbacku)

| Problém | Typ | Fáze řešení |
|---------|-----|-------------|
| PDF v iframe hlásí `InvalidJWT` / `exp` | **Backend / URL TTL** — signed URL pro `/file` měl krátkou expiraci (90 s), iframe drží starý odkaz | **Fáze 1** — delší TTL pro náhled v review + ruční obnovení URL |
| Anglické / technické labely polí (`DOCUMENT ISSUE DATE`, `subtype_label`) | Prezentace / mapa klíčů | **Fáze 1** — `FIELD_LABELS` + humanizace |
| V shrnutí viditelné raw kódy (`partial_extraction_coerced`, …) | `buildHumanSummary` vkládá `reasonsForReview` jako raw stringy | **Fáze 1** — humanizace / skrytí technických kódů |
| Opakující se „Zdroj: AI“ u každého pole | UI | **Fáze 1** — skrýt u standardní extrakce, nechat stránku kde dává smysl |
| Duplicitní řádky (stejné číslo u více polí) | Prezentace (stejný label + hodnota) | **Fáze 1** — deduplikace ve skupině v mapperu |
| „Potvrdit jako finální smlouvu“ málo vidět | UX | **Fáze 1** — výraznější banner / CTA |
| „Kontroly a akce“ + badge „COMPLIANCE“ | Copy | **Fáze 1** — české označení typu karty |
| Záměna modelace vs smlouva, datumy `DDMMYYY`, platby do klienta | Extraction / apply / schema | **Fáze 2+** (mimo scope Fáze 0–1) |

## 3. Doporučení modelů (API)

- **Fáze 0:** čtení repa a dokumentace — nízkonákladový režim / levný execute.  
- **Fáze 1 (tento PR):** převážně UI + konstanty + jedna úprava signed URL — levný execute.  
- **Další krok (Fáze 2):** změny pipeline, aliasů, `apply` — silnější model.

## 4. SQL migrace

Pro Fázi 0 a 1 **nejsou potřeba žádné SQL migrace** — mění se pouze TTL signed URL v aplikační logice a prezentační vrstva UI.
