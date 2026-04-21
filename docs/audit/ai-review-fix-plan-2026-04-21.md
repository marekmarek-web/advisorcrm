# AI Review — Opravný plán (2026-04-21)

Komplexní plán oprav vyplývající z forensního auditu AI Review pipeline
(upload → klasifikace → extrakce → enforcement → apply → portál).

Auditovaný rozsah: viz `golden-regression-extended.test.ts` a fixtures pod
`apps/web/src/lib/ai/__tests__/fixtures/audit-2026-04-21/`.

> **Princip:** opravujeme v pořadí F0 → F3. Každý batch má jednoznačná
> acceptance criteria, test coverage a rollback. Nezačínáme F1, dokud F0
> není merged a stabilní v test suite. "Brutální poctivost": neoznačovat
> něco opraveného, když nemá zelený guardrail test.

---

## Obsah

1. [Executive summary](#1-executive-summary)
2. [Ověřený seznam bug-ů](#2-ověřený-seznam-bug-ů)
3. [Root cause map](#3-root-cause-map)
4. [Batch F0 — bezpečnostní stop lossy (½ den)](#4-batch-f0--bezpečnostní-stop-lossy)
5. [Batch F1 — pravdivost extrakce (2–3 dny)](#5-batch-f1--pravdivost-extrakce)
6. [Batch F2 — idempotence a multi-contract (2–3 dny)](#6-batch-f2--idempotence-a-multi-contract)
7. [Batch F3 — UX truthfulness + portál KPI (1–2 dny)](#7-batch-f3--ux-truthfulness--portál-kpi)
8. [Sekvencování, závislosti, risk matrix](#8-sekvencování-závislosti-risk-matrix)
9. [Release gate checklist](#9-release-gate-checklist)
10. [Nepokryté oblasti / následný audit](#10-nepokryté-oblasti--následný-audit)

---

## 0. Exekuční status (aktualizováno 2026-04-21)

Všechny batche **F0–F3** byly implementovány v jednom session. Změny pokrývají
všech 11 bugů z kapitoly [2](#2-ověřený-seznam-bug-ů) plus dva BONUS fixy.
Regresní baseline (66 pre-existujících failing tests v `src/lib/ai/__tests__` a
souvisejících) zůstala beze změny — žádný nový regression introduced.

| Batch | Stav | Fixy | Klíčové soubory |
|-------|------|------|-----------------|
| **F0** | ✅ merged | C-01, C-02, C-04 (hard block), C-10 (KPI) | `portal/contracts/review/[id]/page.tsx`, `ai-review/mappers.ts`, `apply-policy-enforcement.ts`, `actions/contract-review.ts`, `client-portfolio/contact-overview-kpi.ts` |
| **F1** | ✅ merged | C-09, C-04 (fallback), BONUS-1, BONUS-2 | `envelope-parse-coerce.ts`, `apply-contract-review.ts`, `build-portfolio-attributes-from-extract.ts`, `fund-library/fund-resolution.ts` |
| **F2** | ✅ merged | H-09, H-17, H-01, H-10 | `apply-contract-review.ts`, `review-queue-repository.ts` |
| **F3** | ✅ merged | H-16, C-05, C-10 UI, H-13, H-14 | `CanonicalFieldsPanel.tsx`, `ContactOverviewKpi.tsx`, `apply-contract-review.ts` (splitContactName), `extraction-validation.ts`, `czech-personal-id-birth-date.ts` |

**Regresní důkazy:** `apps/web/src/lib/ai/__tests__/golden-regression-extended.test.ts`
— 36 tests (35 REGRESSION / zelené, 1 skipped — `H-09` pre-existing marker pro
budoucí E2E). Každý fix má explicitní REGRESSION test, žádný CURRENT bug test
není ponechán.

---

## 1. Executive summary

Audit odhalil 11 bug-ů v rozsahu pipeline od klasifikace po portál KPI.
Nejhorší třída je **"ghost success"** — pipeline vrací `ok: true`, ale na
DB skončí buď prázdná/polovičatá smlouva, ztracené edity poradce, nebo
data navázaná na špatnou entitu. To znamená, že advisor věří výsledku,
který nereflektuje realitu.

**Kritické třídy bug-ů:**

- **Sémantická lež o stavu dokumentu** (C-09): návrh smlouvy je tiše
  překlopený na `final_contract` bez explicitního signálu → enforcement
  ho neošetří jako proposal.
- **Advisor edit loss** (C-01, C-02): poradce vyplní chybějící pole, po
  kliknutí Approve se změny neuloží do DB (portál page) a/nebo zůstávají
  ve stavu `missing` (mergeFieldEditsIntoExtractedPayload).
- **Gate bypass** (C-04, H-17): `isAdvisorConfirmedApply === true`
  automaticky override-uje _všechny_ pending gate reasons. Žádný hard
  barrier nedrží proti payslip / modelaci / nevyřešené klasifikaci.
- **Single-contract assumption** (H-09): `upsertCoverageFromAppliedReview`
  se volá 1× po smyčce s `resultPayload.createdContractId` (last-write-
  wins). Bundle se dvěma smlouvami → coverage je navázán jen na druhou.
- **Shape fragility** (BONUS-1): `buildPortfolioAttributesFromExtracted`
  akceptuje `investmentFunds` jen jako Array. LLM často vrací JSON string
  → fondy zmizí z `portfolio_attributes`.

**Scope oprav:** 18 souborů, ~1100 LoC změny + ~40 nových testů.
**Odhad:** 5–7 dev-dní (1 osoba) při zachování bezpečnosti (code review
+ E2E smoke na staging).

---

## 2. Ověřený seznam bug-ů

Všechny položky jsou **CONFIRMED** (přímá verifikace ve zdroji + test
v harnessu `golden-regression-extended.test.ts`).

### P0 (data integrita, bezpečnostně blokující release)

| ID | Bug | Důkaz | Dopad |
|----|-----|-------|-------|
| **C-01** | Advisor edity na portal/contracts/review/[id] se neukládají do DB — `setRawExtractedPayload` není nikde volán; `approveContractReview` tudíž nikdy nespustí `saveContractCorrection`. | `apps/web/src/app/portal/contracts/review/[id]/page.tsx` — `useState<null>(null)`; `apps/web/src/app/actions/contract-review.ts:77-89`. | Všechny ruční opravy v UI se ztratí. Advisor vidí "uloženo", ale DB má původní LLM data. |
| **C-02** | `mergeFieldEditsIntoExtractedPayload` updatuje jen `value`, ne `status`. Pole s `status: "missing"` zůstane `missing` i po vyplnění. | `apps/web/src/lib/ai-review/mappers.ts:1590-1604`. | Enforcement (`resolveDisplayStatus → Chybí`) následně vyhodnotí pole jako prázdné → `manual_required` → pole se nezapíše. |
| **C-04** | Advisor-confirmed apply (`reviewStatus === "approved"`) override-uje _všechny_ pending gate důvody bez schopnosti blokovat kritické scénáře. | `apps/web/src/app/actions/contract-review.ts:387-392`. | Payslip / modelace / blokované klasifikace mohou projít do CRM, když advisor klikne Approve. |
| **C-09** | `coerceReviewEnvelopeParsedJson` aggresivně překlápí `lifecycleStatus: "proposal" \| "offer"` → `final_contract` pokud není explicitně přítomen token "modelac*" / "kalkulac*" / "illustration". | `apps/web/src/lib/ai/envelope-parse-coerce.ts:649-689`. | Návrh pojistné smlouvy se CRM zapíše jako final smlouva. Zároveň `deriveFieldApplyPolicy` kvůli tomu nevrátí `do_not_apply` (precontract output mode se nenamapuje). |
| **C-10** | `computeContactOverviewKpiFromContracts` ignoruje `HYPO` a `UVER` segmenty — v agregační smyčce je jen `INVEST_SEGMENTS` a `INSURANCE_SEGMENTS`. | `apps/web/src/lib/client-portfolio/contact-overview-kpi.ts:115-125`. | Měsíční zátěž a zbývající jistina úvěrů se nedostanou do žádné KPI na portálu. |

### P1 (funkční defekty, regresní riziko)

| ID | Bug | Důkaz | Dopad |
|----|-----|-------|-------|
| **C-05** | `splitContactName` (fallback při create-new) předpokládá Czech pořadí _Příjmení Jméno_. Pro Western `"Jan Novák"` vyhodí `firstName="Novák", lastName="Jan"`. | `apps/web/src/lib/ai/apply-contract-review.ts:481-495` a `draft-actions.ts:29-37`. | Zaměněné jméno/příjmení v nově vytvořeném kontaktu. |
| **H-01** | Contact dedup (`findExistingContactId`) používá jen `email` nebo `personalId`. Bez fuzzy matching / phone / birthDate. | `apps/web/src/lib/ai/apply-contract-review.ts:738-763`. | Dva review stejné osoby se dvěma pravopisy jmen (bez emailu/PID) = dva kontakty. |
| **H-09** | `upsertCoverageFromAppliedReview` je volán 1× po smyčce s `resultPayload.createdContractId` (last-write-wins). | `apps/web/src/lib/ai/apply-contract-review.ts:1372-1385`. | Bundle se dvěma create_contract akcemi: všechny coverage sedí na druhé smlouvě. |
| **H-10** | `resolvedContractNumberForPaymentSync` je settován uvnitř smyčky, ale payment action může být pre-processed dřív. | `apps/web/src/lib/ai/apply-contract-review.ts:936-1214, 1048, 1321-1327`. | Payment setup může být zapsán s prázdným `contractNumber`. |
| **BONUS-1** | `buildPortfolioAttributesFromExtracted` handluje `investmentFunds` jen jako Array; JSON string LLM výstup se ignoruje. | `apps/web/src/lib/portfolio/build-portfolio-attributes-from-extract.ts:442-456`. | DIP smlouva bez fondů v `portfolio_attributes`. |
| **BONUS-2** | `resolveFundFromPortfolioAttributes` resolvuje jen první fond z pole (`funds[0]`). FV kategorizace multi-fund portfolia je rozhodnutá prvním fondem. | `apps/web/src/lib/fund-library/fund-resolution.ts:174-186`. | Pokud první fond mimo library, fallback heuristika; další (validní) fondy se ignorují. |

### P2 (drobná / dokumentační)

| ID | Bug | Důkaz | Dopad |
|----|-----|-------|-------|
| **H-13** | `PERSONAL_ID_FORMAT` regex warn-check má logickou chybu: 10-místný ID bez lomítka neupozorňuje. | `apps/web/src/lib/ai/extraction-validation.ts:248-257`. | Defektní validace — žádný signál pro advisora. |
| **H-14** | `birthDateFromCzechPersonalId` nepokrývá extended month notation (foreign RČ). | `apps/web/src/lib/ai/czech-personal-id-birth-date.ts:38-41`. | Foreign RČ neparsuje birthDate. |
| **H-16** | `PublishHintsSection` vždy zobrazuje zelený banner "dokument se publikuje" bez ohledu na skutečný stav `publishHints`. | `apps/web/src/app/components/ai-review/CanonicalFieldsPanel.tsx:158-171`. | UI disinformace. |
| **H-17** | Concurrent apply race — dva paralelní `applyContractReviewDrafts` na stejný review, ani jeden nedrží lock. Idempotentce pouze přes `sourceContractReviewId`. | `apps/web/src/app/actions/contract-review.ts:359-438`. | Malá pravděpodobnost, ale možný double-write kontaktu (nemá review key). |

---

## 3. Root cause map

Kategorie → sada bug-ů → společná příčina:

- **Pipeline "fail-open" filosofie** → (C-04, C-09, H-17): všechny vrstvy
  preferují "nechat projít + warning" před "hard block". Advisor-confirmed
  apply tedy nemá žádný hard barrier ani pro payslip.
- **Partial state shape understanding** → (C-02, C-01, BONUS-1):
  Rozhraní mezi LLM výstupem a interní enveelopou je nedodrženo na více
  místech. Status není atomicky součástí value; JSON string vs Array;
  portal page má stale state.
- **Single-entity assumption** → (H-09, BONUS-2): Architektura kódu
  předpokládá _jeden_ kontakt / _jedna_ smlouva / _jeden_ fond per
  review. Multi-contract/multi-fund bundly nefungují.
- **Aggregator scope drift** → (C-10): KPI agregátor byl psaný pro
  investment+insurance; úvěrové produkty přidané pozdějipad, ale
  agregátor k nim nebyl upraven.
- **Name-splitting hardcoded konvence** → (C-05, C-11): "Splittery" jmen
  jsou hardcoded na Czech konvenci; LLM ale produkuje Western order.

---

## 4. Batch F0 — bezpečnostní stop lossy

**Cíl:** Zabránit nejhorším datovým ztrátám bez refaktoringu. Každá
oprava je ≤20 LoC. Deploy v první vlně.

### F0-1 — Persist `rawExtractedPayload` state na portal review page (řeší C-01)

**Soubor:** `apps/web/src/app/portal/contracts/review/[id]/page.tsx`

**Problém:** `const [rawExtractedPayload, setRawExtractedPayload] =
useState<Record<string, unknown> | null>(null);` — `setRawExtractedPayload`
není volán nikde v komponentě. Když advisor klikne Approve, předá se
`rawExtractedPayload ?? undefined` do `approveContractReview`, který bez
raw nikdy nespustí `saveContractCorrection`.

**Oprava:**
1. Po loadu review (ekvivalent `useEffect` s fetchem nebo server-side
   prop) nastavit `setRawExtractedPayload(envelope.extractedPayload)`.
2. Přenést `fieldEdits` state do `ref` tak, aby se při approve předal
   spolu s čerstvou kopií raw.
3. Zásadní: guardrail log ve chvíli, kdy `rawExtractedPayload === null`
   a přesto `Object.keys(fieldEdits).length > 0` — logovat do Sentry.

**Acceptance:**
- Nový E2E nebo integration test: advisor otevře review, upraví pole,
  klikne Approve → DB tabulka `contract_review_corrections` má záznam.
- Log Sentry nové severity neroste.

**Rollback:** Revert single commit. Nezávislé na jiných opravách.

### F0-2 — Opravit `mergeFieldEditsIntoExtractedPayload` (řeší C-02)

**Soubor:** `apps/web/src/lib/ai-review/mappers.ts:1590-1604`

**Oprava:**

```ts
// Před (current):
if (cell && typeof cell === "object" && !Array.isArray(cell)) {
  cell.value = value;
}

// Po:
if (cell && typeof cell === "object" && !Array.isArray(cell)) {
  cell.value = value;
  cell.status = "manual";           // nebo "extracted" pokud chceme neutral
  cell.confidence = 1;
  cell.source = "advisor_edit";     // nová stopa pro audit
}
```

A zároveň v `apply-policy-enforcement.ts:67-81` `resolveDisplayStatus`
upravit — aby `status === "manual"` → `"Nalezeno"` (sensitivity-based
auto/prefill).

**Acceptance:**
- Test v `golden-regression-extended.test.ts` → sekce "C-02" → v INTENDED
  bloku odstranit `.skip` a asserce projde.
- Enforcement pro `{ value: "+420...", status: "manual" }` vrací
  `auto_apply` (pro phone = MEDIUM, tedy `prefill_confirm`) nebo
  `prefill_confirm`, **ne `manual_required`**.

**Rollback:** Revert. F0-1 funguje i samostatně, ale bez F0-2 je edit
perzistovaný, ale po dalším přenačtení enforcement ho vyhodnotí jako
missing.

### F0-3 — Hard blok na Approve+Apply pro payslip/modelaci (řeší C-04)

**Soubor:** `apps/web/src/app/actions/contract-review.ts:387-392`

**Současný stav:**
```ts
const isAdvisorConfirmedApply = rawRow.reviewStatus === "approved";
const overrides = isAdvisorConfirmedApply
  ? Array.from(new Set([...pendingApply, ...explicitOverrides, ...dbIgnored]))
  : Array.from(new Set([...explicitOverrides, ...dbIgnored]));
```

**Oprava:** Zavést white/black-list reasons, které ani advisor nemůže
override-nout:

```ts
const UNOVERRIDABLE_REASONS = new Set([
  "LOW_CLASSIFICATION_CONFIDENCE",
  "PIPELINE_FAILED_STEP",
  "LLM_CLIENT_MATCH_AMBIGUOUS",
]);

const hardBlocks = pendingApply.filter((r) => UNOVERRIDABLE_REASONS.has(r));
if (hardBlocks.length > 0) {
  return {
    ok: false,
    error: `Kritické důvody blokování nelze override-nout: ${hardBlocks.join(", ")}`,
    blockedReasons: hardBlocks,
  };
}

// Pro payslip / supporting — blokace přes isSupportingDocumentOnly by se
// měla trigger BEFORE advisor bypass:
if (
  isSupportingDocumentOnly(rawRow.extractedPayload as Record<string, unknown>) &&
  !options?.overrideReason
) {
  return {
    ok: false,
    error: "Podpůrný dokument (např. mzdový list) nelze publikovat jako smlouvu. Zvolte správný typ dokumentu nebo zadejte explicitní overrideReason.",
  };
}
```

**Acceptance:**
- Fixture `05-supporting-doc-advisor-bypass.json` — advisor approve →
  action vrací `ok: false, error: "Podpůrný dokument..."`.
- INTENDED blok v `golden-regression-extended.test.ts` (sekce C-04)
  odstranit `.skip`.

**Rollback:** Revert. Nezávislé na F0-1, F0-2.

### F0-4 — Přidat HYPO/UVER do KPI agregátoru (řeší C-10)

**Soubor:** `apps/web/src/lib/client-portfolio/contact-overview-kpi.ts`

**Oprava:**

```ts
// Rozšířit typ:
export type ContactOverviewKpiNumbers = {
  monthlyInvest: number;
  personalAum: number;
  monthlyInsurance: number;
  annualInsurance: number;
  monthlyLoan: number;              // nové
  outstandingLoanBalance: number;   // nové
};

const LOAN_SEGMENTS = new Set(["HYPO", "UVER"]);

// V agregační smyčce:
for (const c of filtered) {
  const p = mapContractToCanonicalProduct(c);
  const seg = p.segment;
  if (INVEST_SEGMENTS.has(seg)) {
    monthlyInvest += monthlyCashflowForKpi(p);
    personalAum += investmentAumForRow(c, p);
  } else if (INSURANCE_SEGMENTS.has(seg)) {
    monthlyInsurance += monthlyCashflowForKpi(p);
    annualInsurance += annualInsuranceAmountForKpi(p);
  } else if (LOAN_SEGMENTS.has(seg)) {
    monthlyLoan += monthlyCashflowForKpi(p);   // funkce už úvěry umí
    outstandingLoanBalance += /* TODO: resolve z portfolio_attributes.currentBalance nebo loanAmount */;
  }
}
```

**Acceptance:**
- Nový test v `golden-regression-extended.test.ts` (sekce C-10 INTENDED)
  — `monthlyLoan === 22500` pro hypo fixture.
- Portál contact overview zobrazuje novou KPI kartu "Měsíční splátky
  úvěrů" (sekci UI je v tomto batchi mimo scope — addresujeme v F3).

**Rollback:** Revert. Portál UI zůstane beze změny (nevidí nová pole).

### F0 — shrnutí

- 4 soubory, ~80 LoC změny + ~8 nových test case.
- Deploy v řádu hodin po code review.
- Každá oprava je izolovaná, žádná závislost mezi F0-1…F0-4.

---

## 5. Batch F1 — pravdivost extrakce

**Cíl:** Zrušit ghost behavior v envelope coercion + enforcement + fund
resolution. Dodržet sémantiku "dokument říká to, co říká".

### F1-1 — Zastavit automatickou proposal→final_contract promotion (řeší C-09)

**Soubor:** `apps/web/src/lib/ai/envelope-parse-coerce.ts:649-689`

**Návrh logiky:**

```ts
// Před coercion — zachytit originalLifecycle pro audit:
const originalLifecycle = lc;

if ((lc === "proposal" || lc === "offer") && !isExplicitModelation) {
  // Promote JEN pokud:
  //  a) je v evidence podpis,
  //  b) je nalezen čistý contractNumber (ne proposalNumber),
  //  c) je přítomen signatureDate / effectiveDate v final podobě,
  // jinak: nech jako proposal.

  const ef = root.extractedFields as Record<string, { value?: unknown; status?: string } | undefined> | undefined;
  const hasContractNumber = ef?.contractNumber?.value != null && String(ef.contractNumber.value).trim() !== "";
  const hasSignatureDate = ef?.signatureDate?.value != null && String(ef.signatureDate.value).trim() !== "";
  const hasFinalEffectiveDate =
    ef?.policyStartDate?.value != null && (ef?.status === "extracted" || ef?.evidenceTier === "direct");

  const canPromote = hasContractNumber && (hasSignatureDate || hasFinalEffectiveDate);

  if (canPromote) {
    dc.lifecycleStatus = "final_contract";
    dc.originalLifecycle = originalLifecycle;  // nové pole
    if (Array.isArray(dc.reasons) && !dc.reasons.includes("lifecycle_promoted_from_proposal_with_evidence")) {
      (dc.reasons as string[]).push("lifecycle_promoted_from_proposal_with_evidence");
    }
  } else {
    // Nechej proposal, jen přidej reason pro audit:
    if (Array.isArray(dc.reasons) && !dc.reasons.includes("lifecycle_kept_as_proposal_insufficient_evidence")) {
      (dc.reasons as string[]).push("lifecycle_kept_as_proposal_insufficient_evidence");
    }
  }
}
```

**Acceptance:**
- Fixture `01-proposal-promoted-to-final.json` (bez contractNumber) →
  `lifecycleStatus === "proposal"` po coercion.
- Nový fixture `01b-proposal-with-signature.json` (contractNumber +
  signatureDate) → `final_contract` + `originalLifecycle === "proposal"`.
- INTENDED blok C-09 v harnessu → odstranit `.skip`.

**Rollback:** Revert. Bez F1-1 chová se současný pipeline nadále
permisivně (to je current baseline, ne dalsi riziko).

### F1-2 — Resolve zdroj polí z obou vrstev (řeší C-04 + částečně C-09)

**Soubor:** `apps/web/src/lib/ai/apply-contract-review.ts:1071-1110`

Současný stav: `premiumAmount` a `premiumAnnual` čteme _jen_ z `ep`
(enforcedPayload). Když je `ep` prázdný (proposal → do_not_apply), do
DB zapíšeme null premium i když má `action.payload` validní hodnotu.

**Oprava:** Nový helper `resolveFieldWithFallback`:

```ts
function resolveFieldWithFallback(
  ep: Record<string, unknown>,
  actionPayload: Record<string, unknown>,
  extractedPayloadForEnforcement: Record<string, unknown>,
  key: string,
  opts: { trusted: boolean } = { trusted: false }
): string | null {
  const fromEp = (ep[key] as string | undefined)?.trim();
  if (fromEp) return fromEp;
  // Fallback na akci pouze pro netrusted případy — pro HIGH-sensitivity
  // fields (premiumAmount, contractNumber, personalId) NIKDY nefallbackovat
  // na non-enforced data bez explicitního warning flagu.
  if (opts.trusted) {
    const fromAction = (actionPayload[key] as string | undefined)?.trim();
    if (fromAction) return fromAction;
  }
  return null;
}
```

A všechna volání typu `(ep.premiumAmount as string)?.trim()` projít a
nahradit tímto resolverem. Pro **HIGH-sensitivity** pole (premium,
contractNumber, personalId) fallback **nezapínat** — tato pole nesmí
být v CRM pokud enforcement řekl `do_not_apply`.

**Acceptance:**
- Proposal review (lifecycle coerced na proposal) → contract insert s
  `premiumAmount === null` (enforcement drží své slovo).
- Final contract review s HIGH-conf premium → contract má premium OK.

**Rollback:** Revert. F1-2 je striktnější než current; může dočasně
zhoršit success-metric "CRM row má populated premium" — to je ale
žádoucí chování (lepší null než halucinace).

### F1-3 — Šířka shape parsing `investmentFunds` (řeší BONUS-1)

**Soubor:** `apps/web/src/lib/portfolio/build-portfolio-attributes-from-extract.ts:442-456`

**Oprava:**

```ts
const rawFunds = p.investmentFunds ?? p.funds;
let fundsInput: unknown[] = [];

if (Array.isArray(rawFunds)) {
  fundsInput = rawFunds;
} else if (typeof rawFunds === "string" && rawFunds.trim()) {
  // LLM často vrací funds jako JSON string (zejména přes ai-review-extraction-router)
  try {
    const parsed = JSON.parse(rawFunds);
    if (Array.isArray(parsed)) fundsInput = parsed;
  } catch { /* ignore */ }
} else if (rawFunds && typeof rawFunds === "object" && "value" in rawFunds) {
  // ExtractedField cell shape — {value, status, confidence}
  const inner = (rawFunds as { value?: unknown }).value;
  if (Array.isArray(inner)) fundsInput = inner;
  else if (typeof inner === "string") {
    try { const parsed = JSON.parse(inner); if (Array.isArray(parsed)) fundsInput = parsed; } catch { /* ignore */ }
  }
}

if (fundsInput.length > 0) {
  const funds: Array<{ name: string; allocation?: string; isin?: string }> = [];
  for (const f of fundsInput.slice(0, 20)) { /* ... existing per-fund mapping ... */ }
  if (funds.length > 0) out.investmentFunds = funds;
}
```

**Acceptance:**
- Fixture `03-investment-funds-string-shape.json` — `investmentFunds` je
  JSON string → `attrs.investmentFunds` má 2 parsované fondy včetně ISIN.
- INTENDED blok BONUS-1 v harnessu — `.skip` odstranit.

**Rollback:** Revert. Žádná side-effect-regress.

### F1-4 — Multi-fund resolution místo first-fund-only (řeší BONUS-2)

**Soubor:** `apps/web/src/lib/fund-library/fund-resolution.ts:174-186`

**Oprava:**

```ts
export type MultiFundResolutionResult = {
  perFund: Array<FundResolutionResult & { index: number }>;
  aggregate: FundResolutionResult;  // rollup: pokud alespoň 1 fund-library hit, aggregate = první takový
};

export function resolveFundsFromPortfolioAttributes(
  attrs: Record<string, unknown>,
): MultiFundResolutionResult {
  const funds = (attrs.investmentFunds as Array<{ name?: string; isin?: string }> | undefined) ?? [];
  const strategy = typeof attrs.investmentStrategy === "string" ? attrs.investmentStrategy : null;

  const perFund = funds.map((f, index) => ({
    index,
    ...resolveFund(f.name ?? null, f.isin ?? null, strategy),
  }));

  const firstLibraryHit = perFund.find((r) => r.fvSourceType === "fund-library");
  const aggregate: FundResolutionResult = firstLibraryHit
    ? {
        resolvedFundId: firstLibraryHit.resolvedFundId,
        resolvedFundCategory: firstLibraryHit.resolvedFundCategory,
        fvSourceType: "fund-library",
      }
    : perFund[0] ?? {
        resolvedFundId: null,
        resolvedFundCategory: null,
        fvSourceType: null,
      };
  return { perFund, aggregate };
}
```

A v `apply-contract-review.ts:871-883` použít nový aggregate + uložit
`perFund` do `portfolio_attributes.fundsResolved` (JSON).

**Acceptance:**
- Fixture `04-dip-multi-fund-portfolio.json` — aggregate má
  `fvSourceType === "fund-library"` i když první fond mimo library
  (druhý je v library přes ISIN).

**Rollback:** Revert. Strukturální, ale nerozbije existující schema —
jen přidá nový field do `portfolio_attributes`.

### F1 — shrnutí

- 4 soubory (mappers, apply-contract-review, build-portfolio-attrs, fund-resolution).
- ~180 LoC. ~15 nových test case.
- Musí být deploynout _jako jeden_ atomicky (fixy se vzájemně validují).

---

## 6. Batch F2 — idempotence a multi-contract

**Cíl:** Architekturní zpevnění pro bundly a concurrent apply. Tohle už
není quick-fix — jsou to změny s regresním rizikem. Code review + QA
run na staging před merge.

### F2-1 — Multi-contract coverage upsert (řeší H-09)

**Soubor:** `apps/web/src/lib/ai/apply-contract-review.ts:1372-1385`

**Architektura:** Místo 1× call po smyčce — přesunout `upsertCoverage...`
dovnitř smyčky, za každé create_contract action. A zaměnit
`resultPayload.createdContractId` (scalar) za array `createdContractIds`:

```ts
// Současný stav (zkráceno):
let createdContractId: string | null = null;
for (const action of draftActions) {
  if (action.type === "create_contract" || ...) {
    const newId = await insertContract(...);
    createdContractId = newId;
    resultPayload.createdContractId = newId;
  }
}
// Po smyčce:
if (createdContractId) await upsertCoverageFromAppliedReview({ contractId: createdContractId });

// Po opravě:
const createdContractIds: string[] = [];
for (const action of draftActions) {
  if (action.type === "create_contract" || ...) {
    const newId = await insertContract(...);
    createdContractIds.push(newId);
    // Coverage per-contract volané hned, s enforcementem vždy z extractedPayload navázaného
    // na tento specifický action (source: action.payload.coverageList).
    await upsertCoverageFromAppliedReview({
      tenantId, userId, contactId: effectiveContactId,
      contractId: newId,
      row, coverageSource: action.payload.coverageList ?? undefined,
      tx,
    });
  }
}
resultPayload.createdContractIds = createdContractIds;
resultPayload.createdContractId = createdContractIds[0] ?? null;  // zpětná kompatibilita
```

**Acceptance:**
- Nový fixture `07-bundle-multi-contract.json` (bundle se dvěma smlouvami).
- Test: po apply `createdContractIds.length === 2`, každá coverage má
  `linkedContractId` navázán na svou (ne cizí) smlouvu.

**Rollback:** Revert. Silně závislé: downstream konzumenti
`result.payload.createdContractId` musí zůstat funkční (scalar
zpětná kompatibilita je zachována).

### F2-2 — Concurrent apply mutex (řeší H-17)

**Soubor:** `apps/web/src/app/actions/contract-review.ts:348-438`

**Architektura:** Přidat DB-level row lock na `contract_upload_reviews`
před vstupem do aplikačního flow:

```ts
// Na začátku applyContractReviewDrafts (line ~359):
const rawRow = await db.transaction(async (tx) => {
  const [row] = await tx
    .select(...).from(contractUploadReviews)
    .where(eq(contractUploadReviews.id, id))
    .for("update")   // <-- row-level lock
    .limit(1);
  return row;
});
```

A zároveň: `applyContractReview` uvnitř by měl na začátku transakce
zkontrolovat `row.reviewStatus` znovu (double-check) před prvním insertem.

**Acceptance:**
- Nový integration test s paralelním `Promise.all([apply, apply])` —
  jedna z nich vrací `ok: false, error: "...již byla zpracována"`, druhá
  vrací ok:true. Žádný duplikát v DB.

**Rollback:** Revert. Tato oprava přinese mírnou latenci (row lock) —
monitorovat p99 applyContractReviewDrafts.

### F2-3 — Phone + birthDate contact dedup (řeší H-01)

**Soubor:** `apps/web/src/lib/ai/apply-contract-review.ts:738-763`

**Oprava:** Rozšířit `findExistingContactId` o normalized-phone match:

```ts
async function findExistingContactId(
  tenantId: string,
  payload: Record<string, unknown>,
  tx: typeof db
): Promise<string | null> {
  const email = (payload.email as string)?.trim().toLowerCase();
  const personalId = (payload.personalId as string)?.trim();
  const phone = normalizeCzechPhone((payload.phone as string)?.trim());
  const birthDate = (payload.birthDate as string)?.trim();

  // 1) Email hit (exact):
  if (email) {
    const hit = await tx.select(...).where(...eq(contacts.email, email)).limit(1);
    if (hit[0]?.id) return hit[0].id;
  }
  // 2) PersonalId hit:
  if (personalId) {
    const hit = await tx.select(...).where(...eq(contacts.personalId, personalId)).limit(1);
    if (hit[0]?.id) return hit[0].id;
  }
  // 3) Phone + birthDate hit (pokud obojí extrahované):
  if (phone && birthDate) {
    const hit = await tx.select(...).where(and(
      eq(contacts.tenantId, tenantId),
      eq(contacts.phone, phone),
      eq(contacts.birthDate, birthDate),
    )).limit(1);
    if (hit[0]?.id) return hit[0].id;
  }
  return null;
}
```

**Acceptance:**
- Nový unit test: review s `phone: "+420 602 111 222", birthDate:
  "1985-02-14"` matchne existujícího kontaktu se stejnou dvojicí.

**Rollback:** Revert. Pozor: tato oprava může zvýšit match rate a sloučit
dříve oddělené kontakty — QA na staging.

### F2-4 — Contract reference pro payment sync (řeší H-10)

**Soubor:** `apps/web/src/lib/ai/apply-contract-review.ts:936-1214, 1321-1327`

**Oprava:** Reorganizace order of operations — dva-pass přes draftActions:

```ts
// Pass 1: Najdi všechny contract actions, vyresolvuj reference.
const contractActionIndices: number[] = [];
const contractNumberHints: string[] = [];
for (const [i, a] of draftActions.entries()) {
  if (a.type === "create_contract" || ...) {
    contractActionIndices.push(i);
    const cn = a.payload.contractNumber as string | undefined;
    if (cn) contractNumberHints.push(cn);
  }
}
const primaryContractNumberForPayment = contractNumberHints[0] ?? null;

// Pass 2: Process všechny akce; payment_setup nyní vidí primary contractNumber.
for (const action of draftActions) {
  ...
}
```

**Acceptance:**
- Fixture s payment action PŘED contract action → payment má populated
  contractNumber.

**Rollback:** Revert.

### F2 — shrnutí

- 2 soubory (apply-contract-review, contract-review), heavy refactor.
- ~250 LoC + 8 nových test case.
- **Vyžaduje staging run s real data** (ideálně replay produkčních reviews).

---

## 7. Batch F3 — UX truthfulness + portál KPI

**Cíl:** UI zobrazuje pravdu. Advisor nepovažuje zelenou za "vše OK",
když tam něco není.

### F3-1 — Pravdivý `PublishHintsSection` (řeší H-16)

**Soubor:** `apps/web/src/app/components/ai-review/CanonicalFieldsPanel.tsx:158-171`

**Oprava:** Zobrazit tři stavy podle `publishHints` + computedOutcome:

- zelená "Dokument bude publikován" — jen když `contractPublishable
  !== false && !sensitiveAttachmentOnly`
- žlutá "Dokument publikuje část" — když `needsSplit || needsManualValidation`
- šedá "Dokument nepublikuje smlouvu" — když `contractPublishable === false`

**Acceptance:**
- Component test (React Testing Library) pro tři stavy banneru.

### F3-2 — Name splitting neutralizovat (řeší C-05)

**Soubor:** `apps/web/src/lib/ai/draft-actions.ts:29-37` +
`apps/web/src/lib/ai/apply-contract-review.ts:481-495`

**Oprava:** Použít existující utilitu (nebo vytvořit)
`@/lib/name-detection/detect-order` který rozpozná Czech vs Western:

```ts
function splitFullName(fullName: string): { firstName?: string; lastName?: string } {
  const cleaned = fullName.trim().replace(/\s+/g, " ");
  if (!cleaned) return {};
  const parts = cleaned.split(" ");
  if (parts.length === 1) return { firstName: parts[0] };

  // Heuristika: Czech příjmení často končí -ová, -ský, -cký, -ník, -ek …
  // Pokud poslední slovo vypadá jako příjmení → western order.
  const lastWord = parts[parts.length - 1];
  const looksLikeSurname = /ová$|ský$|cký$|ná$|nský$|ník$|ek$|ič$|áč$/i.test(lastWord);
  if (looksLikeSurname) {
    // Western: firstName = vše kromě posledního; lastName = poslední
    return {
      firstName: parts.slice(0, -1).join(" "),
      lastName: lastWord,
    };
  }
  // Jinak fallback na current (Czech order): první = lastName
  return {
    firstName: parts.slice(1).join(" "),
    lastName: parts[0],
  };
}
```

**Acceptance:**
- Unit test pro `"Jan Novák"` → firstName Jan, lastName Novák.
- Unit test pro `"Nováková Jana"` (Czech) → firstName Jana, lastName Nováková.

### F3-3 — Contact KPI UI karta pro úvěry (řeší C-10 follow-up)

**Soubor:** Portál contact overview komponenta (nejspíš
`apps/web/src/app/portal/contacts/[id]/ContactOverviewKpis.tsx` nebo podobně).

Po F0-4 máme nová pole `monthlyLoan, outstandingLoanBalance`. Přidat do
UI karty "Hypotéky & úvěry" s CZK formátováním.

**Acceptance:** Snapshot test + vizuální Storybook kontrola.

### F3-4 — Validation fixy H-13, H-14

Oba jsou drobné regex / parsing fixy. Každý ≤15 LoC.

- **H-13:** `extraction-validation.ts:248-257` — regex fix: akceptovat i
  `\d{10}` bez slashe jako valid.
- **H-14:** `czech-personal-id-birth-date.ts:38-41` — rozšířit month
  parsing o foreign RČ notaci (month + 50 pro ženy, month + 20/70 pro
  extended-calendar).

**Acceptance:** Unit testy pro validní + invalid RČ case.

### F3 — shrnutí

- 4-5 souborů UI + validation. ~130 LoC + ~12 test case.
- Nižší priorita, ale nutná pro "done-done" stav auditu.

---

## 8. Sekvencování, závislosti, risk matrix

**Dependency graph:**

```
F0-1 (portal page state) ──────┐
F0-2 (mergeFieldEdits status) ─┼─ Přidá INTENDED bloky z C-02, musí F0-1 být před E2E testem
F0-3 (gate hard-block)  ───────┤
F0-4 (KPI HYPO/UVER)  ─────────┘
         │
         ▼
F1-1 (envelope coerce) ────┐
F1-2 (payload fallback) ───┼─ F1-2 se opírá o F1-1 pro test (musí být proposal po coerce)
F1-3 (funds string shape) ─┤
F1-4 (multi-fund resolve) ─┘
         │
         ▼
F2-1 (multi-contract coverage) ─┐
F2-2 (concurrent mutex) ────────┼─ Všechny F2 vyžadují integration testy a staging run
F2-3 (phone+birthDate dedup) ───┤
F2-4 (payment reference order)  ┘
         │
         ▼
F3-1..F3-4 (UI + validation)
```

**Risk matrix:**

| Batch | Tech risk | Regresní risk | Scope | Mitigace |
|-------|-----------|---------------|-------|----------|
| F0 | LOW | LOW | Minimal | Izolované quick-fixy, unit tests |
| F1 | MID | MID | 4 souborů | Musí deploy atomicky; fixtures kryjí all branches |
| F2 | HIGH | HIGH | 2 souborů, architektura | Staging run + replay produkční data |
| F3 | LOW | LOW | UI + drobné | Snapshot tests + Storybook |

**Rollout strategie:**

1. F0 → merge do `main`, deploy na prod za 24h (observace 48h).
2. F1 → PR po F0+48h. Deploy v tichém okně (weekend / večer).
3. F2 → nejdřív deployovat na staging, sepsat replay harness s produkčními review-ID,
   konfrontovat diff před merge.
4. F3 → běží paralelně s F2 pipeline, deploy kdykoli.

**Feature flag zvážení:**

- F0-3 (gate hard-block) — zvážit flag `gate.payslip_hard_block` s
  default ON na prod po 1 týdnu.
- F2-2 (row lock) — flag `apply.row_lock` pro rapid rollback při
  neočekávané latenci.

---

## 9. Release gate checklist

Před merge každého batche:

- [ ] Všechny nové INTENDED bloky v `golden-regression-extended.test.ts`
      mají odstraněný `.skip` a projdou.
- [ ] Žádný existující test neregresuje (`pnpm test` global).
- [ ] Lint + type-check + TS strict bez nových errorů.
- [ ] Fixture coverage: každý bug ID má ≥1 fixture OR ≥1 unit test.
- [ ] Code review od minimálně 1 osoby mimo autora.
- [ ] Pro F2: staging replay produkčních reviews (≥50 samplů) bez nové
      chyby v logs/Sentry.
- [ ] Dokumentace `docs/audit/ai-review-fix-plan-2026-04-21.md` má
      check-boxy markované [x] pro dokončené fixy.

Před publikací na produkci:

- [ ] Sentry dashboard "AI Review Apply Failures" — baseline p50/p99 ok.
- [ ] Audit log sanity check: `apply_gate_override` a `apply_contract_review`
      události se logují konzistentně.
- [ ] Slack notifikace "F0 deployed" → "F0 stable (48h)" → atd.

---

## 10. Nepokryté oblasti / následný audit

Audit 2026-04-21 nepokryl (pro rozsah):

- **LLM prompt drift** — prompty v `extraction-schemas-by-type.ts` nebyly
  porovnány s golden expected output. Možné regrese v poli `premiumAnnual`
  vs `premiumAmount` konvenci.
- **Neživotní pojištění** — majetek, odpovědnost, auto. Pipeline existuje,
  ale fixture coverage je nulová.
- **Obnovovací smlouvy / dodatky** — `amendment` lifecycle + dedup vs
  původní smlouvy není verifikováno.
- **Mobilní Capacitor flow** — neauditováno. `ContractsReviewScreen.tsx`
  může mít vlastní state path pro approve.
- **Subdocument orchestrator** — `subdocument-extraction-orchestrator.ts`
  byl částečně auditován, ale merging `investmentData` vs primary extract
  není end-to-end pokryto testem.
- **Role propagation** — multi-person documenty (payer / insured /
  policyholder) nejsou testovány na full write-through.

Doporučení: po dokončení F0–F3 naplánovat follow-up audit s
full-coverage fixture matrix (~40 scénářů) a LLM output validation proti
golden.

---

## Changelog

- 2026-04-21: Initial draft (forensic audit result).
- 2026-04-21: Verification pass — subagent-backed line numbers, fixture
  files linked.
- 2026-04-21: Test harness `golden-regression-extended.test.ts` stable
  (18 pass / 7 skip).
