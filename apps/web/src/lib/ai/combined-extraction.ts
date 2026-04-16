import { z } from "zod";
import { aiReviewCreateResponse as createResponse } from "./review-llm-provider";
import {
  DOCUMENT_INTENTS,
  DOCUMENT_LIFECYCLE_STATUSES,
  EXTRACTION_FIELD_STATUSES,
  PRIMARY_DOCUMENT_TYPES,
  documentReviewEnvelopeSchema,
  type DocumentReviewEnvelope,
} from "./document-review-types";
import { coerceReviewEnvelopeParsedJson } from "./envelope-parse-coerce";

export const COMBINED_CLASSIFY_AND_EXTRACT_MIN_HINT_CHARS = 800;

const jsonScalarSchema: Record<string, unknown> = {
  anyOf: [
    { type: "string" },
    { type: "number" },
    { type: "boolean" },
    { type: "null" },
  ],
};

export const combinedClassifyAndExtractJsonSchema: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: [
    "documentClassification",
    "documentMeta",
    "extractedFields",
    "parties",
    "reviewWarnings",
    "suggestedActions",
  ],
  properties: {
    documentClassification: {
      type: "object",
      additionalProperties: false,
      required: ["primaryType", "lifecycleStatus", "documentIntent", "confidence", "reasons", "subtype"],
      properties: {
        primaryType: { type: "string", enum: [...PRIMARY_DOCUMENT_TYPES] },
        subtype: { anyOf: [{ type: "string" }, { type: "null" }] },
        lifecycleStatus: { type: "string", enum: [...DOCUMENT_LIFECYCLE_STATUSES] },
        documentIntent: { type: "string", enum: [...DOCUMENT_INTENTS] },
        confidence: { type: "number", minimum: 0, maximum: 1 },
        reasons: {
          type: "array",
          items: { type: "string" },
        },
      },
    },
    documentMeta: {
      type: "object",
      additionalProperties: false,
      required: ["scannedVsDigital", "fileName", "pageCount", "issuer", "documentDate", "language", "overallConfidence"],
      properties: {
        fileName: { anyOf: [{ type: "string" }, { type: "null" }] },
        pageCount: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
        issuer: { anyOf: [{ type: "string" }, { type: "null" }] },
        documentDate: { anyOf: [{ type: "string" }, { type: "null" }] },
        language: { anyOf: [{ type: "string" }, { type: "null" }] },
        scannedVsDigital: { type: "string", enum: ["scanned", "digital", "unknown"] },
        overallConfidence: { anyOf: [{ type: "number", minimum: 0, maximum: 1 }, { type: "null" }] },
      },
    },
    extractedFields: {
      type: "object",
      additionalProperties: {
        type: "object",
        additionalProperties: false,
        required: ["value", "status", "confidence", "sourcePage", "evidenceSnippet", "sensitive"],
        properties: {
          value: jsonScalarSchema,
          confidence: { type: "number", minimum: 0, maximum: 1 },
          sourcePage: { anyOf: [{ type: "integer", minimum: 1 }, { type: "null" }] },
          evidenceSnippet: { anyOf: [{ type: "string" }, { type: "null" }] },
          status: { type: "string", enum: [...EXTRACTION_FIELD_STATUSES] },
          sensitive: { anyOf: [{ type: "boolean" }, { type: "null" }] },
        },
      },
    },
    parties: {
      type: "object",
      additionalProperties: {
        anyOf: [
          { type: "string" },
          { type: "object", additionalProperties: true },
          { type: "array", items: { type: "object", additionalProperties: true } },
          { type: "null" },
        ],
      },
    },
    reviewWarnings: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["code", "message", "severity", "field"],
        properties: {
          code: { type: "string" },
          message: { type: "string" },
          field: { anyOf: [{ type: "string" }, { type: "null" }] },
          severity: { type: "string", enum: ["info", "warning", "critical"] },
        },
      },
    },
    suggestedActions: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["type", "label"],
        properties: {
          type: { type: "string" },
          label: { type: "string" },
        },
      },
    },
  },
};

export type CombinedExtractionBundleHint = {
  isBundle: boolean;
  primarySubdocumentType?: string | null;
  candidateTypes?: string[];
  sectionHeadings?: string[];
  hasSensitiveAttachment?: boolean;
  hasInvestmentSection?: boolean;
};

/**
 * Pre-sliced section texts for bundle documents.
 * When available, the extraction prompt uses labeled sections instead of one anonymous blob,
 * reducing cross-section contamination.
 *
 * Each field is optional — populated only when the corresponding section was detected
 * and sliced from the document. Missing fields fall back to the main document text blob.
 */
export type BundleSectionTexts = {
  /** Text from contractual pages (final_contract or contract_proposal section). */
  contractualText?: string | null;
  /** Text from health questionnaire pages — must NOT be used as contractual fact source. */
  healthText?: string | null;
  /** Text from investment / DIP / DPS section pages. */
  investmentText?: string | null;
  /** Text from payment instruction section pages. */
  paymentText?: string | null;
  /** Text from attachment / AML / supporting section pages. */
  attachmentText?: string | null;
};

/**
 * Build the bundle-aware preamble for the combined extraction prompt.
 * Returns an empty string when there is no bundle hint.
 */
function buildBundleAwarePreamble(hint: CombinedExtractionBundleHint): string {
  if (!hint.isBundle) return "";

  const sectionTypeLabels: Record<string, string> = {
    final_contract: "finální smlouva",
    contract_proposal: "návrh smlouvy",
    modelation: "modelace",
    health_questionnaire: "zdravotní dotazník",
    aml_fatca_form: "AML/FATCA formulář",
    payment_instruction: "platební instrukce",
    investment_section: "investiční sekce / DIP / DPS",
    service_document: "servisní dokument",
    annex: "příloha",
  };

  const candidateList =
    (hint.candidateTypes ?? [])
      .map((t) => sectionTypeLabels[t] ?? t)
      .join(", ") || "více sekcí";

  const headingLines =
    (hint.sectionHeadings ?? []).length > 0
      ? `Detekované nadpisy sekcí: ${hint.sectionHeadings!.slice(0, 4).join(" | ")}\n`
      : "";

  const sensitiveNote = hint.hasSensitiveAttachment
    ? "POZOR: Dokument obsahuje citlivou přílohu (zdravotní dotazník nebo AML formulář) — tato data nepatří do smluvní extrakce.\n"
    : "";

  const investmentNote = hint.hasInvestmentSection
    ? "POZOR: Dokument obsahuje investiční sekci (DIP/DPS/fond) — extrahuj investmentStrategy, investmentFunds a investmentPremium z smluvní/investiční části, ne z modelací.\n"
    : "";

  return `BUNDLE DOKUMENT — více logických sekcí:
Detekované typy: ${candidateList}
Primární sekce: ${hint.primarySubdocumentType ? (sectionTypeLabels[hint.primarySubdocumentType] ?? hint.primarySubdocumentType) : "neznámá"}
${headingLines}${sensitiveNote}${investmentNote}
Pravidla pro bundle:
- Klasifikuj dokument podle PRIMÁRNÍ sekce (finální smlouva > návrh > modelace).
- Extrahuj contract fields POUZE z finální smlouvy nebo návrhu, NE ze zdravotního dotazníku nebo AML.
- lifecycleStatus urči podle primární sekce.
- contentFlags.containsMultipleDocumentSections nastav na true.

`;
}

/** Max chars per section slice in the bundle-context prompt (keeps total tokens in check). */
const SECTION_MAX_CHARS = 18_000;

/**
 * Format section-aware document text block.
 *
 * When `sectionTexts` provides non-trivial sections, emits explicitly labeled sections
 * so the model can attribute facts to the correct subdocument.
 * Falls back to a single anonymous blob when sections aren't available.
 */
function buildSectionAwareDocumentBlock(
  fullText: string,
  sectionTexts?: BundleSectionTexts | null,
): string {
  const trimmed = fullText.trim();

  if (!sectionTexts) {
    return `TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmed}
<<<END_DOCUMENT_TEXT>>>`;
  }

  const sections: string[] = [];

  const cap = (t: string) =>
    t.length > SECTION_MAX_CHARS ? t.slice(0, SECTION_MAX_CHARS) + "\n…[zkráceno]" : t;

  if (sectionTexts.contractualText?.trim()) {
    sections.push(`[SMLUVNÍ ČÁST — finální smlouva nebo návrh smlouvy]
${cap(sectionTexts.contractualText.trim())}`);
  }

  if (sectionTexts.healthText?.trim()) {
    sections.push(`[ZDRAVOTNÍ DOTAZNÍK — POUZE pro zdravotní prohlášení, NEPOUŽÍVEJ jako zdroj contractual facts]
${cap(sectionTexts.healthText.trim())}`);
  }

  if (sectionTexts.investmentText?.trim()) {
    sections.push(`[INVESTIČNÍ SEKCE — DIP / DPS / fondy / investiční strategie]
${cap(sectionTexts.investmentText.trim())}`);
  }

  if (sectionTexts.paymentText?.trim()) {
    sections.push(`[PLATEBNÍ SEKCE — platební instrukce / účet / variabilní symbol]
${cap(sectionTexts.paymentText.trim())}`);
  }

  if (sectionTexts.attachmentText?.trim()) {
    sections.push(`[PŘÍLOHA / AML / DOPROVODNÝ DOKUMENT — NEPOUŽÍVEJ jako zdroj smluvních dat]
${cap(sectionTexts.attachmentText.trim())}`);
  }

  if (sections.length === 0) {
    // All sections empty — fall back to full text blob
    return `TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmed}
<<<END_DOCUMENT_TEXT>>>`;
  }

  // Provide full text after sections as fallback context
  const fullBlob = trimmed.length > 0
    ? `\n[CELÝ TEXT DOKUMENTU — jako záložní kontext]\n${trimmed.length > SECTION_MAX_CHARS * 2 ? trimmed.slice(0, SECTION_MAX_CHARS * 2) + "\n…[zkráceno]" : trimmed}`
    : "";

  return `SEKCE DOKUMENTU (každá část je oddělená logická sekce):
${sections.map((s, i) => `--- SEKCE ${i + 1} ---\n${s}`).join("\n\n")}
${fullBlob}`;
}

/**
 * Section-specific extraction rules appended when section texts are available.
 * Instructs the model to prefer each section's content for the matching field type.
 */
function buildSectionSpecificRules(sectionTexts?: BundleSectionTexts | null): string {
  if (!sectionTexts) return "";

  const rules: string[] = [];

  if (sectionTexts.contractualText?.trim()) {
    rules.push("- contractNumber, insurer, productName, policyStartDate, policyEndDate, totalMonthlyPremium — taháš PRIMÁRNĚ ze SMLUVNÍ ČÁSTI.");
  }
  if (sectionTexts.healthText?.trim()) {
    rules.push("- ZDRAVOTNÍ DOTAZNÍK slouží POUZE jako signál sectionSensitivity.health_section='health_data'. NEEXTRAHUJ z něj contractual facts (jméno pojistníka, pojistné, rizika) pokud nejsou explicitně potvrzené ve SMLUVNÍ ČÁSTI.");
  }
  if (sectionTexts.investmentText?.trim()) {
    rules.push("- investmentStrategy, investmentFunds, fundAllocation, investmentPremium — taháš PRIMÁRNĚ z INVESTIČNÍ SEKCE.");
  }
  if (sectionTexts.paymentText?.trim()) {
    rules.push("- bankAccount, variableSymbol, iban, paymentFrequency — taháš PRIMÁRNĚ z PLATEBNÍ SEKCE nebo SMLUVNÍ ČÁSTI.");
  }
  if (sectionTexts.attachmentText?.trim()) {
    rules.push("- PŘÍLOHA / AML / DOPROVODNÝ DOKUMENT: tato část nesmí přepsat smluvní fakta. Nastav sensitiveAttachmentOnly=true pokud je to jediná přítomná sekce.");
  }

  // Section address separation (RULE 8 enforcement for section-aware bundles)
  rules.push(
    "- ADRESA INSTITUCE vs. ADRESA KLIENTA: Adresa z hlavičky dokumentu nebo ze záhlaví instituce PATŘÍ do institutionAddress, NIKOLI do extractedFields.address. Adresa z bloku pojistník/klient/investor/účastník PATŘÍ do extractedFields.address. Tyto dvě hodnoty NESMÍŠ zaměnit ani sloučit."
  );
  if (sectionTexts.contractualText?.trim()) {
    rules.push("- Pokud je adresa klienta nalezena ve SMLUVNÍ ČÁSTI v sekci pojistník/klient, je to autoritativní zdroj pro extractedFields.address — nemůže ji přepsat žádná jiná sekce.");
  }

  return rules.length > 0
    ? `\nPRAVIDLA PRO SEKCE:\n${rules.join("\n")}\n`
    : "";
}

export function buildCombinedClassifyAndExtractPrompt(
  documentText: string,
  sourceFileName?: string | null,
  bundleHint?: CombinedExtractionBundleHint | null,
  sectionTexts?: BundleSectionTexts | null,
): string {
  const trimmedText = documentText.trim();
  const fileName = sourceFileName?.trim() || "unknown";
  const bundlePreamble = bundleHint?.isBundle ? buildBundleAwarePreamble(bundleHint) : "";
  const sectionRules = buildSectionSpecificRules(sectionTexts);
  const documentBlock = buildSectionAwareDocumentBlock(trimmedText, sectionTexts);

  return `Jsi extrakční systém pro finanční dokumenty (interní AI Review Aidvisory).
${bundlePreamble}

Z textu dokumentu proveď v jednom kroku:
1. klasifikaci typu dokumentu,
2. určení lifecycleStatus a documentIntent,
3. extrakci všech nalezených důležitých polí do extractedFields,
4. stručná reviewWarnings jen když je skutečný problém,
5. suggestedActions jen když dávají praktický smysl pro poradce.

══════════════════════════════════════════════════════════
RULE 1 — COMPOSITE FIELD PARSING (RČ vs. datum narození)
══════════════════════════════════════════════════════════
Dokumenty často obsahují sdílené labely:
  "RČ / Datum narození", "Datum narození / RČ", "RČ / datum nar.", "IČ / Datum nar."

Pravidlo:
- Pokud hodnota odpovídá vzoru rodného čísla (XXXXXX/XXXX nebo XXXXXXXXXX) → ulož do personalId, pole birthDate NECH null.
- Pokud hodnota odpovídá datu (DD.MM.RRRR, RRRR-MM-DD, DD/MM/RRRR) → ulož do birthDate, pole personalId NECH null.
- Pokud jsou oba formáty přítomny odděleně → vyplň obě pole ze správných zdrojů.
- birthDate NESMÍ nikdy obsahovat číslo tvaru XXXXXX/XXXX ani XXXXXXXXXX (rodné číslo).
- Pokud je hodnota nejednoznačná → ulož jako personalId a birthDate nech null.
- Příklady: "825916/1234" → personalId="825916/1234", birthDate=null. "16.9.1982" → birthDate="1982-09-16", personalId=null.

══════════════════════════════════════════════════════════
RULE 2 — INTERNÍ IDENTIFIKÁTORY BEZ MASKOVÁNÍ
══════════════════════════════════════════════════════════
Toto je INTERNÍ review nástroj pro finančního poradce. Výstup NIKDY neputuje na veřejnost.
NIKDY nemaskuj:
- personalId (rodné číslo) — NIKDY jako "XX/XXXX" nebo "******"
- bankAccount — NIKDY jako "XXXXXX/0800"
- iban — NIKDY jako "CZ** **** ****"
- variableSymbol — NIKDY jako "****"
- accountForRepayment — NIKDY jako maskované číslo
Výjimka pro masking NEEXISTUJE ani pro "GDPR", ani pro "ochranu dat". Toto je interní advisory tool.

══════════════════════════════════════════════════════════
RULE 3 — PARTY ROLE RESOLUTION
══════════════════════════════════════════════════════════
Globální pravidla pro osoby a role:

MAPOVÁNÍ ROLÍ (combined label → role):
- "Pojistník" / "Klient" / "Žadatel" → role "policyholder" → extractedFields.fullName + extractedFields.policyholder
- "Pojištěný" / "Pojistený" (odlišný od pojistníka) → role "insured" → extractedFields.insuredPersonName
- "Pojistník/Pojištěný" / "Pojistník a Pojištěný" / "Pojistník je shodný s pojištěným" → role "policyholder" I role "insured" jsou tatáž osoba → nastav OBOJÍ z téhož jména
- "Pojištěný je shodný s pojistníkem" → insuredPersonName = fullName / policyholder (neprázdná hodnota)
- "Účastník" / "Účastník smlouvy" (DPS, penzijní) → role "participant" → extractedFields.participantFullName + extractedFields.fullName
- "Investor" / "Klient / Investor" / "Klient/Investor" → role "investor" → extractedFields.investorFullName + extractedFields.fullName
- "2. pojištěný" / "Druhý pojištěný" / "Vedlejší pojištěná" → role "second_insured", přidej do parties
- "Dítě" / "Pojištěné dítě" → role "child_insured"
- "Spoludlužník" → role "co_applicant"
- "Zákonný zástupce" / "Jednatel" / "Prokurista" → role "legal_representative"
- "Obmyšlená osoba" / "Oprávněná osoba" → role "beneficiary"
- "Zprostředkovatel" / "Distributor" / "Obchodní zástupce" / "Poradce" → VÝHRADNĚ do intermediaryName/intermediaryCode/intermediaryCompany, NIKDY do fullName, policyholder nebo insured

PRIORITY ZDROJŮ PRO OSOBY (od nejvyšší):
1. Blok "Pojistník" / "Klient" / "Žadatel" / "Investor" / "Účastník" v hlavní smluvní části
2. Explicitní sekce smluvních stran ("Smluvní strany", "Strany smlouvy")
3. Záhlaví nebo podpis klienta ve smluvní části
4. Platební sekce (pokud klient uveden)
5. AML / FATCA / dotazníky / přílohy / podpisové protokoly — POUZE pokud není vyplněno výše

ZÁKAZY:
- fullName (hlavní klient) NIKDY z hlavičky pojišťovny, banky nebo investiční společnosti
- fullName NIKDY ze sekce zprostředkovatele, distributora nebo obchodního zástupce
- intermediaryName NIKDY ze sekce pojistníka / klienta
- insurer / lender / provider NIKDY z bloku klienta / pojistníka

KAŽDÁ OSOBA v parties: { role, fullName, birthDate?, personalId?, address?, email?, phone?, occupation? }
Pokud je v dokumentu explicitně uveden 2. pojištěný nebo spoludlužník, MUSÍ se objevit v parties.

══════════════════════════════════════════════════════════
RULE 4 — PAYMENT BLOCK PRIORITY
══════════════════════════════════════════════════════════
Platební sekce mají prioritu:
  "Platební údaje", "Údaje o smlouvě a platební údaje", "Informace k pojistnému",
  "Způsob placení", "Bankovní spojení", "Splatnost", "Platební instrukce"

Pravidla:
- payment fields (totalMonthlyPremium, bankAccount, variableSymbol, paymentFrequency) taháš VŽDY z těchto explicitních bloků pokud existují.
- Pokud je uvedeno "variabilní symbol = číslo smlouvy / návrhu" → propisuj VS z contractNumber nebo proposalNumber.
- ATRIS investiční společnost: variabilní symbol u podílových fondů je vždy 6místné číslo. První číslice = typ investice do fondu (1=Renta PLUS, 3=SPORO, 4=Stavební, 7=Důchodová renta, 9=Cíl). Zbývajících pět číslic = identifikační číslo investora / číslo smlouvy (doplněno nulami zepředu, pokud je kratší). Příklad: číslo smlouvy „40369“ a typ „3“ (SPORO) → VS „340369“. Pokud dokument obsahuje tabulku typů fondu nebo vyplněné pole „Typ investice do Fondu“, zkombinuj ho s číslem smlouvy podle tohoto pravidla; VS z platebního pokynu nebo QR ber jako zdroj pravdy, pokud je uveden explicitně.
- proposal / offer dokumenty mají payments stejně jako final_contract — NEIGNORUJ platby jen kvůli lifecycleStatus.
- Pokud obsahuje "Rozsah pojistného krytí", "Přehled pojistného krytí" nebo tabulku rizik → extrahuj coverages jako JSON string array [{ riskType, riskLabel, insuredAmount, premium }].
- Risk/coverage tables extrahuj i u proposal docs a offer docs.

══════════════════════════════════════════════════════════
RULE 7 — PAYMENT ANTI-HALLUCINATION (HARD FENCE)
══════════════════════════════════════════════════════════
Payment setup fields (bankAccount, variableSymbol, iban, bankCode, totalMonthlyPremium,
annualPremium, paymentFrequency, accountForRepayment) SMÍŠ vyplnit POUZE za těchto podmínek:

PODMÍNKA A — Dokument je explicitně payment_instruction nebo investment_payment_instruction.
PODMÍNKA B — Dokument obsahuje explicitně označenou platební sekci:
  "Platební údaje", "Platební instrukce", "Způsob placení", "Bankovní spojení",
  "Údaje o platbě", "Platba", "Jak platit", "Pokyny k platbě"
  a v této sekci je bankAccount / IBAN / variableSymbol EXPLICITNĚ uveden jako pokyn k platbě.
PODMÍNKA C — Jde o smluvní dokument (life_insurance_contract, nonlife_insurance_contract, ...)
  a pojistné je výslovně sjednáno v tabulce s platebními parametry.

ZAKÁZÁNO:
- NIKDY nevyplňuj bankAccount / iban / variableSymbol z informativního bloku, orientační
  kalkulace, modelace, indexace, nabídky bez smluvního závazku, AML/FATCA přílohy, nebo
  zdravotního dotazníku.
- NIKDY nevyplňuj payment fields jen proto, že dokument OBSAHUJE čísla nebo účty v
  informativní tabulce (přehled fondů, výpis, sazebník, porovnání, leták).
- Pokud si nejsi jistý, že bankovní údaj je přímý platební pokyn (ne informativní ukázka),
  NECH pole prázdné a přidej reviewWarning: code="payment_source_uncertain", severity="warning".
- Investment/DPS/DIP/penzijní dokumenty s informativním blokem bank. účtu NESMÍ nastavit
  payment fields jako write-eligible — přidej reviewWarning: code="investment_payment_informative_only".

══════════════════════════════════════════════════════════
RULE 8 — ADDRESS SOURCE SEPARATION (person vs. institution header)
══════════════════════════════════════════════════════════
Adresa v dokumentu má DVA různé zdroje — NESMÍŠ je míchat:

INSTITUCE (pojišťovna, banka, správce fondu, leasingová společnost):
  → Adresa z hlavičky dokumentu / záhlaví dopisu / signatáře instituce patří do institutionAddress.
  → NIKDY ji nedávej do extractedFields.address, extractedFields.permanentAddress ani do parties[*].address.

KLIENT / POJISTNÍK / INVESTOR / ÚČASTNÍK:
  → Adresa z bloku "Pojistník", "Klient", "Žadatel", "Investor", "Účastník",
    "Adresa pojistníka", "Trvalá adresa", "Kontaktní adresa" patří do extractedFields.address.
  → Tuto adresu NESMÍŠ vynulovat, přepsat ani ignorovat jen kvůli tomu, že hlavička dokumentu
    obsahuje adresu instituce.

Pokud dokument obsahuje obě adresy → extrahuj obě do správných polí.
Pokud je POUZE adresa instituce → extractedFields.address nech null.
Pokud je POUZE adresa klienta v person bloku → extrahuj do extractedFields.address.

══════════════════════════════════════════════════════════
RULE 5 — PROPOSAL/MODELATION/SUPPORTING: ŽÁDNÉ POTLAČENÍ CORE PAYLOADU
══════════════════════════════════════════════════════════
Lifecycle warning ANO, suppression core payloadu NE.
Dokumenty typu: proposal, offer, modelation, amendment, service_doc, supporting_doc MUSÍ vrátit:
- klienta (fullName nebo borrowerName),
- produkt / typ (insurer, productName, productType),
- platby / payment summary pokud existují v textu,
- parties pokud existují,
- coverages pokud jsou přítomny.
Příklad: MAXIMA nabídka má platební blok → totalMonthlyPremium MUSÍ být vyplněno.
Zdravotní dotazník jako příloha NESMÍ potlačit klientská data z hlavní smluvní části.

══════════════════════════════════════════════════════════
RULE 6 — SECTION PRIORITY (hlavní vs vedlejší sekce)
══════════════════════════════════════════════════════════
Pořadí priority sekcí (od nejvyšší):
1. Hlavní hlavička smlouvy / nabídky (první strana, nadpis, záhlaví)
2. Explicitní smluvní strany ("Pojistník", "Klient", "Žadatel", "Investor", "Účastník")
3. Sekce klient / pojistník / pojištěný / investor / účastník v těle smlouvy
4. Platební sekce a parametry smlouvy (bankAccount, variableSymbol, premium)
5. Vedlejší sekce — ČTOU SE, ale NESMÍ přepsat data z sekcí 1–4:
   - AML / FATCA dotazník
   - Zdravotní dotazník
   - Zprostředkovatel / Distributor / Obchodní zástupce
   - Podpisový protokol / podpisová strana
   - Přílohy, VOP, sazebník, ceník, reklamační řád
   - Marketingové materiály

Pokud najdeš osobu ve vedlejší sekci (např. jméno poradce v sekci Zprostředkovatel):
- NEPŘEPISUJ fullName / policyholder extrahovaný z hlavní sekce
- Poradenské jméno dej VÝHRADNĚ do intermediaryName
- Vedlejší sekce MŮŽE doplnit chybějící hodnoty (pokud sekce 1–4 nebyly dostupné)

══════════════════════════════════════════════════════════
RULE 9 — IDENTITY DOCUMENT FIELDS (občanský průkaz / cestovní pas)
══════════════════════════════════════════════════════════
Pokud dokument obsahuje údaje o dokladu totožnosti klienta (občanský průkaz, cestovní pas,
řidičský průkaz), extrahuj do extractedFields:
- idCardNumber: číslo dokladu (např. "123456789", "AB 123456")
- idCardIssuedBy: kdo doklad vydal (úřad, "MěÚ Praha 4", "Policie ČR")
- idCardValidUntil: platnost dokladu do (datum ve formátu YYYY-MM-DD)
- idCardIssuedAt: datum vydání dokladu (YYYY-MM-DD), pokud je v textu uvedeno

Tyto údaje hledej v sekcích:
  "Doklad totožnosti", "Osobní doklady", "Identifikace klienta", "Údaje klienta",
  "Občanský průkaz", "Číslo OP", "Identifikační doklad", "AML identifikace"

PRAVIDLA:
- POUZE explicitně uvedené hodnoty v dokumentu. NEODHADUJ číslo dokladu z rodného čísla.
- Pokud dokument doklady neobsahuje, tato pole NEUVÁDĚJ (nech je chybět, nedávej null).
- Pokud je uvedeno "OP č." nebo "č. OP" nebo "č. dokladu" → idCardNumber.
- Pokud je uvedeno "Platnost do" nebo "Platí do" → idCardValidUntil.
- Pokud je uvedeno "Vydal" nebo "Vydáno" → idCardIssuedBy.

══════════════════════════════════════════════════════════
RULE 10 — PRAKTICKÝ LÉKAŘ (životní pojištění)
══════════════════════════════════════════════════════════
U životního pojištění (life_insurance_contract, life_insurance_proposal):
Pokud je v dokumentu uveden praktický lékař klienta, extrahuj:
- generalPractitioner: jméno lékaře (případně i adresa ordinace)

Hledej v sekcích:
  "Praktický lékař", "Ošetřující lékař", "Lékař", "Zdravotní údaje", "Údaje o lékaři"

POUZE pokud je hodnota EXPLICITNĚ uvedena v dokumentu. Neodhaduj. Pokud chybí, pole neuváděj.

══════════════════════════════════════════════════════════
PRAVIDLA EXTRAKCE — POLE
══════════════════════════════════════════════════════════
- Vycházej pouze z textu dokumentu níže.
- Nevymýšlej hodnoty. Pokud si nejsi jistý, dej field status "missing" nebo pole vůbec neuváděj.
- Extrahuj co nejvíce praktických údajů pro finančního poradce a CRM.
- Preferované kategorie v extractedFields:
  - Klient / dlužník: fullName, birthDate, personalId, address, permanentAddress, phone, email, occupation, sports, idCardNumber, idCardIssuedBy, idCardValidUntil, idCardIssuedAt, generalPractitioner.
  - Smlouva / úvěr: contractNumber, proposalNumber, insurer, lender, productName, productType, documentStatus, policyStartDate, policyEndDate, policyDuration, dateSigned, businessCaseNumber.
  - Rizika a připojištění: coverages (JSON array [{ riskType, riskLabel, insuredAmount, termEnd?, premium? }]), riders, insuredRisks, insuredPersons, deathBenefit, accidentBenefit, disabilityBenefit, hospitalizationBenefit, seriousIllnessBenefit.
  - Platby pojistné: totalMonthlyPremium, annualPremium, riskPremium, investmentPremium, paymentFrequency, paymentAccountNumber, bankAccount, iban, variableSymbol, bankCode, firstPaymentDate, paymentPurpose.
  - Úvěr / hypotéka (povinné pokud jde o úvěrový dokument):
    loanAmount (výše úvěru / "Výše Úvěru" / "celkový limit úvěru"),
    installmentAmount (měsíční splátka / "Výše měsíčních anuitních splátek"),
    installmentCount (počet splátek / "Počet měsíčních anuitních splátek"),
    installmentFrequency (frekvence splátek),
    interestRate (roční úroková sazba),
    rpsn (RPSN),
    lender (věřitel / banka — z hlavičky věřitele, NIKOLI z bloku klienta),
    borrowerName (dlužník — z bloku "Dlužník" nebo "Klient"),
    coBorrowerName (spoludlužník — z bloku "Spoludlužník" pokud existuje),
    accountForRepayment (číslo účtu pro splácení — NEMASKOVAT),
    startDate (datum uzavření / datum čerpání),
    maturityDate (datum splatnosti),
    purpose (účel úvěru),
    intermediaryName (zprostředkovatel úvěru — z bloku "Zprostředkovatel úvěru").
  - Leasing / financování (povinné pokud jde o leasingovou nebo financovací smlouvu):
    lender / financingProvider (leasingová nebo financovací společnost — z hlavičky věřitele/pronajímatele),
    customer / customerName (zákazník — z bloku "Zákazník", "Klient", "Příjemce" — NIKDY z hlavičky leasingové společnosti),
    customerIco (IČO zákazníka pokud je firemní zákazník),
    representedBy (zástupce zákazníka — jednatel, prokurista),
    totalFinancedAmount (celková výše financování),
    downPayment (akontace / vlastní zdroje),
    installmentAmount (výše splátky),
    installmentCount / duration (počet splátek nebo délka v měsících),
    firstInstallmentDate (datum první splátky),
    financedObject (předmět financování — vozidlo, stroj, zařízení),
    vin (VIN nebo výrobní číslo předmětu).
  - Investiční smlouva / úpis (povinné pokud jde o investiční produkt):
    investorFullName (investor/klient — z bloku "Klient", "Investor", "Žadatel" — NIKDY z hlavičky investiční společnosti),
    institutionName (správce/investiční společnost),
    isin (ISIN fondu nebo cenného papíru),
    intendedInvestment (zamýšlená výše investice),
    entryFeePercent (vstupní poplatek v %),
    amountToPay (částka k úhradě),
    bankAccount (číslo účtu pro úhradu — NEMASKOVAT),
    variableSymbol (variabilní symbol — NEMASKOVAT).
  - Dodatek / změna smlouvy (povinné pokud jde o servisní nebo změnový dokument):
    existingPolicyNumber (číslo EXISTUJÍCÍ smlouvy — hledej "ke smlouvě č.", "na smlouvu č."),
    insurer (pojišťovna z hlavičky),
    fullName (pojistník — z bloku pojistník/klient, NIKDY z hlavičky pojistitele),
    effectiveDate (datum účinnosti),
    requestedChanges (shrnutí požadované změny).
  - Podpůrný dokument (výplatní lístek, daňové přiznání, výpis):
    Pro výplatní lístek: employer, fullName (zaměstnanec), payPeriod, grossPay, netPay, payoutAccount (NEMASKOVAT).
    Pro daňové přiznání: companyName, ico, taxPeriodFrom, taxPeriodTo, taxType, taxAmountDue.
    Nikdy netvoř contractNumber nebo insurer pro supporting docs.
  - Zprostředkovatel: intermediaryName, intermediaryCode, intermediaryCompany, advisorName, brokerName.
  - Investice: investmentStrategy, investmentFunds (JSON array [{ name, allocation, isin }]), fundAllocation, investmentAllocation, investmentScenario, investmentHorizon, intendedInvestment. VŽDY extrahuj fond a ISIN pokud jsou v textu přítomné — i pokud je fond jen jeden s alokací 100 %. Investiční profil (dynamický/vyvážený/konzervativní/růstový) patří do investmentStrategy.
  - Oprávněné osoby: beneficiaries.
- VĚŘITEL / BANKA: Pro úvěrové dokumenty lender je institucionální strana (Raiffeisenbank, ČSOB, Moneta atd.). NIKDY ji nevkládej do pole insurer. Použij pole lender.
- ZPROSTŘEDKOVATEL vs INSTITUCE: intermediaryName je poradce/makléř klienta. Osoba podepsaná za pojišťovnu/banku NENÍ zprostředkovatel. Zprostředkovatel pochází z bloku "Zprostředkovatel" nebo "Zprostředkovatel úvěru".
- PLATBY — FREKVENCE: paymentFrequency extrahuj přesně. Rozlišuj: "měsíčně" / "ročně" / "čtvrtletně" / "pololetně" / "jednorázově". Nesmíš zaměnit roční pojistné za měsíční.
- PLATBY — ROČNÍ vs MĚSÍČNÍ: Pokud je paymentFrequency = "ročně" nebo "annually", pak platba patří do annualPremium, NIKOLI do totalMonthlyPremium. Nepoužívej pole totalMonthlyPremium pro roční platbu.
- PLATBY — PRIORITA: výše splatné platby má prioritu. pořadí: konečná dlužná částka > roční po slevě > roční před slevami. Tato pravidla platí pro pojistné i příspěvky.
- PLATBY — riskPremium: Pole riskPremium používej POUZE pro rizikovou složku pojistného v životním pojištění (čistě riziková část bez investiční složky). Pro neživotní pojištění (majetek, auto, odpovědnost): pojistné za konkrétní sjednané krytí patří do coverages[].premium, NIKOLI do riskPremium. riskPremium u neživotního pojištění VYNECHEJ.
- PŘEDMĚT POJIŠTĚNÍ: Pro auto dokument vždy extrahuj insuredObject z části "Vozidlo" — ve formátu "[značka model] ([rok]), SPZ: [SPZ], VIN: [VIN]". Pro majetek extrahuj insuredObject z části "Místo pojištění" nebo "Předmět pojištění". Pokud model vrátí SPZ/VIN/značku odděleně (spz, vin, vehicleBrand+vehicleModel), je to v pořádku — normalizační vrstva je spojí do insuredObject. Stejně tak adresa/místo rizika z "Místo pojištění" / "Pojištěné místo".
- MULTI-PERSON: Více osob (pojistník ≠ pojištěný, děti, spoludlužník) extrahuj každou zvlášť do parties viz RULE 3 výše.
- POJISTNÍK = POJIŠTĚNÝ: Pokud dokument VÝSLOVNĚ uvádí "Pojištěný je shodný s pojistníkem", "Pojistník i pojištěný jsou tatáž osoba", nebo podobnou formulaci, nastav extractedFields.insuredPersonName = hodnota extractedFields.fullName / extractedFields.policyholder. Toto pravidlo platí i pro insuredPersons[0].fullName.
- MULTI-RISK: Pro každé sjednané riziko/připojištění vyplň coverages jako JSON string array [{ riskType, riskLabel, insuredAmount, termEnd?, premium? }].
- LIMITY A VELKÁ ČÍSLA: Limity pojistného plnění jako "150 mil. Kč", "50 000 000 Kč", "150/150 mil. Kč" MUSÍŠ extrahovat celé. "150 mil. Kč" = "150 000 000 Kč". "150/150 mil. Kč" = limity 150 000 000 / 150 000 000 Kč. NIKDY neextrahuj jen první číslo bez kontextu. Celou hodnotu dej jako string s plnou hodnotou.
- DEDUP INSTITUCE: Pokud provider, institutionName a insurer jsou stejná firma, nastav jen institutionName. Ostatní nechej prázdné. Neopakuj stejnou hodnotu ve více polích.
- INVESTICE: Extrahuj investmentStrategy (string), investmentFunds jako JSON string [{ name, isin?, allocation }], investmentPremium. Fond / ISIN / cílový fond jsou POVINNÉ pokud jsou v dokumentu. U modelace napiš lifecycleStatus = "modelation" nebo "non_binding_projection".
- PLATBY: bankAccount, variableSymbol, iban, bankCode, paymentFrequency extrahuj vždy, pokud jsou v dokumentu. Neodhaduj — pouze hodnoty z textu. NEMASKOVAT (viz RULE 2).
- BUNDLE — DOMINANT SEGMENT: Pokud dokument obsahuje více sekcí, DOMINANTNÍ HLAVNÍ SEKCE určuje primaryType a segment. Vedlejší sekce (zprostředkovatel, platební instrukce, zdravotní dotazník, AML) jen obohacují výstup. NESMÍŠ přepsat segment jen kvůli vedlejší sekci.
- BUNDLE: Pokud dokument obsahuje více logických sekcí (smlouva + zdravotní dotazník / AML / platební instrukce), nastav contentFlags.containsMultipleDocumentSections = true a přidej reviewWarning s kódem "multi_section_bundle_detected".
- ZDRAVOTNÍ SEKCE: Pokud je přítomný zdravotní dotazník nebo zdravotní prohlášení, nastav sectionSensitivity.health_section = "health_data". Zdravotní dotazník NESMÍ potlačit extrakci z hlavní smluvní části.
- FINÁLNOST: Pokud dokument je "Návrh" nebo "Nabídka" (proposal/offer) — jde o FINÁLNÍ VSTUP pro extrakci a CRM, NE o modelaci. Nastav lifecycleStatus = "proposal". VÝJIMKA: "Modelace", "Kalkulace", "orientační výpočet" → lifecycleStatus = "modelation", isProposalOnly = true.
- U modelací nebo návrhů extrahuj maximum čitelných údajů (viz RULE 5).
- COVERAGES FALLBACK: Pokud dokument obsahuje tabulku rizik / krytí / připojištění, ale neumíš přesně namapovat každý řádek do strukturovaného formátu, dej celý čitelný text tabulky do extractedFields.manualCoverageNotes s hodnotou jako kompaktní opis řádků tabulky.
- MANUAL FILL FALLBACK: Pokud si u sekce nejsi jistý přesným namapováním, dej přesný výtah z dokumentu do:
  - extractedFields.manualFillClientText pro klientská data bez spolehlivého mapování
  - extractedFields.manualFillContractText pro smluvní data
  - extractedFields.manualFillPaymentText pro platební data
  - extractedFields.manualFillCoveragesText pro krytí/rizika
  - extractedFields.manualFillIntermediaryText pro zprostředkovatele
  - extractedFields.manualFillNotesText pro ostatní poznámky
  Tyto hodnoty jsou text pro ruční doplnění poradcem — NEHALUCINUJ strukturovaná data, když si nejsi jist.
- INTERMEDIARY / BROKER: Vždy extrahuj zprostředkovatele do vlastních polí:
  - intermediaryName (jméno poradce / makléře)
  - intermediaryCode (kód zprostředkovatele)
  - intermediaryCompany (firma zprostředkovatele)
  Zprostředkovatel NIKDY nesmí skončit v insurer, lender, ani v klientovi.
  Pojišťovna / banka NIKDY nesmí skončit v intermediaryName.
- DOCUMENT FAMILY: Pokud neumíš dokument zařadit 100%, vrať nejlepší odhad family + confidence < 0.8 a reviewWarning. Nikdy nepoužívej unsupported_or_unknown pokud z textu plyne aspoň přibližná rodina (pojištění, úvěr, investice, pension).
- Vrátíš pouze JSON dle schema. Žádný markdown, žádný komentář.
- documentClassification.reasons piš stručně česky.
- documentMeta.scannedVsDigital nastav na "digital", pokud text působí jako strojově čitelný PDF převod.
- suggestedActions mají být krátké a akční; payload nech jako objekt.
- DATUMY: Do strukturovaného pole value používej interně ISO YYYY-MM-DD (jednoznačné pro CRM). V textech pro poradce v UI se datumy vždy zobrazují česky (DD.MM.YYYY); nepis ISO formát do volných textů určených čtenáři.
${sectionRules}
Soubor: ${fileName}

${documentBlock}`;
}

/** Strip ```json ... ``` fences if the model wrapped the payload. */
function stripMarkdownJsonFence(text: string): string {
  const t = text.trim();
  const fullFence = t.match(/^```(?:json)?\s*([\s\S]*?)```\s*$/im);
  if (fullFence) return fullFence[1].trim();
  const inner = t.match(/```(?:json)?\s*([\s\S]*?)```/im);
  if (inner) return inner[1].trim();
  return t;
}

/**
 * First balanced `{ ... }` slice, respecting JSON string quotes and backslash escapes.
 * Greedy `/\{[\s\S]*\}/` can include trailing prose or span multiple objects incorrectly.
 */
function extractFirstBalancedJsonObject(text: string): string | null {
  const start = text.indexOf("{");
  if (start < 0) return null;
  let depth = 0;
  let inString = false;
  let escape = false;
  for (let i = start; i < text.length; i++) {
    const c = text[i];
    if (escape) {
      escape = false;
      continue;
    }
    if (inString) {
      if (c === "\\") {
        escape = true;
        continue;
      }
      if (c === "\"") inString = false;
      continue;
    }
    if (c === "\"") {
      inString = true;
      continue;
    }
    if (c === "{") depth++;
    else if (c === "}") {
      depth--;
      if (depth === 0) return text.slice(start, i + 1);
    }
  }
  return null;
}

function tryParseJsonObjectLenient(s: string): Record<string, unknown> | null {
  const variants = [s, s.replace(/,\s*([}\]])/g, "$1")];
  for (const v of variants) {
    try {
      const p = JSON.parse(v) as unknown;
      if (p && typeof p === "object" && !Array.isArray(p)) return p as Record<string, unknown>;
    } catch {
      /* try next */
    }
  }
  return null;
}

/** Parse combined-classify model output: whole JSON, fenced JSON, or first balanced object. */
function tryParseCombinedJsonResponse(rawText: string): Record<string, unknown> | null {
  const stripped = stripMarkdownJsonFence(rawText);
  const whole = tryParseJsonObjectLenient(stripped);
  if (whole) return whole;
  const balanced = extractFirstBalancedJsonObject(stripped);
  if (balanced) {
    const o = tryParseJsonObjectLenient(balanced);
    if (o) return o;
  }
  const balancedRaw = extractFirstBalancedJsonObject(rawText);
  if (balancedRaw && balancedRaw !== balanced) {
    const o2 = tryParseJsonObjectLenient(balancedRaw);
    if (o2) return o2;
  }
  return null;
}

export async function runCombinedClassifyAndExtract(params: {
  documentText: string;
  sourceFileName?: string | null;
  bundleHint?: CombinedExtractionBundleHint | null;
  /** Pre-sliced section texts for bundle-context enrichment. Reduces cross-section contamination. */
  sectionTexts?: BundleSectionTexts | null;
}): Promise<{ raw: string; envelope: DocumentReviewEnvelope }> {
  // Use plain text response instead of Structured Outputs — extractedFields has dynamic keys
  // which OpenAI Structured Outputs cannot represent with additionalProperties: false.
  // We parse the JSON manually and validate with Zod.
  const rawText = await createResponse(
    buildCombinedClassifyAndExtractPrompt(params.documentText, params.sourceFileName, params.bundleHint, params.sectionTexts),
    {
      routing: { category: "ai_review" },
    }
  );

  const parsedObject = tryParseCombinedJsonResponse(rawText);
  if (!parsedObject) {
    throw new Error(`combined_classify_extract: failed to parse JSON response (length=${rawText.length})`);
  }

  // Merge fileName into documentMeta before coerce+parse
  const parsedMeta =
    parsedObject.documentMeta &&
    typeof parsedObject.documentMeta === "object" &&
    !Array.isArray(parsedObject.documentMeta)
      ? (parsedObject.documentMeta as Record<string, unknown>)
      : {};
  const withMeta = {
    ...parsedObject,
    documentMeta: {
      ...parsedMeta,
      ...(params.sourceFileName?.trim() ? { fileName: params.sourceFileName.trim() } : {}),
    },
  };

  // Log raw classification for debug — helps identify what model actually returned
  if (process.env.NODE_ENV !== "production" || process.env.ANCHOR_DEBUG) {
    const dc = (withMeta as Record<string, unknown>).documentClassification;
    const pt = dc && typeof dc === "object" ? (dc as Record<string, unknown>).primaryType : undefined;
    const ef = (withMeta as Record<string, unknown>).extractedFields;
    const efKeys = ef && typeof ef === "object" ? Object.keys(ef as object).slice(0, 5) : [];
    const topKeys = Object.keys(withMeta as object).slice(0, 10);
    const dcKeys = dc && typeof dc === "object" ? Object.keys(dc as object).slice(0, 10) : [];
    const efSample = ef && typeof ef === "object" ? Object.fromEntries(Object.entries(ef as object).slice(0, 2)) : {};
    console.info("[combined-extraction] raw model classification:", { primaryType: pt, dcKeys, efKeysHead: efKeys, efSample, topKeys, rawHead: rawText.slice(0, 300) });
  }

  // First attempt: strict Zod parse
  const parsed = documentReviewEnvelopeSchema.safeParse(withMeta);
  if (parsed.success) {
    return {
      raw: rawText,
      envelope: parsed.data,
    };
  }

  // Second attempt: light coercion (fix enum values, clamp confidence, etc.)
  const coerced = coerceReviewEnvelopeParsedJson(withMeta, { mode: "light" });
  const parsedCoerced = documentReviewEnvelopeSchema.safeParse(coerced);
  if (parsedCoerced.success) {
    return {
      raw: rawText,
      envelope: parsedCoerced.data,
    };
  }

  // Third attempt: aggressive coercion
  const coercedAggressive = coerceReviewEnvelopeParsedJson(withMeta, { mode: "aggressive" });
  const parsedAggressive = documentReviewEnvelopeSchema.safeParse(coercedAggressive);
  if (parsedAggressive.success) {
    return {
      raw: rawText,
      envelope: parsedAggressive.data,
    };
  }

  // Fourth attempt: nuclear fallback — strip all problematic fields and parse with minimal valid shape.
  // Preserves documentClassification and valid extractedFields, drops everything else to defaults.
  const nuclear = coercedAggressive as Record<string, unknown>;
  const nuclearMinimal = {
    ...nuclear,
    // Strip potentially broken nested objects to let Zod defaults take over
    productsOrObligations: [],
    financialTerms: {},
    serviceTerms: {},
    evidence: [],
    candidateMatches: undefined,
    sectionSensitivity: {},
    relationshipInference: undefined,
    reviewWarnings: [],  // nuclear: strip to empty — severity coercion should have run first; if still failing, drop all
    suggestedActions: Array.isArray(nuclear.suggestedActions) ? nuclear.suggestedActions : [],
    parties: (nuclear.parties && typeof nuclear.parties === "object" && !Array.isArray(nuclear.parties)) ? nuclear.parties : {},
    extractedFields: (nuclear.extractedFields && typeof nuclear.extractedFields === "object" && !Array.isArray(nuclear.extractedFields)) ? nuclear.extractedFields : {},
    contentFlags: (nuclear.contentFlags && typeof nuclear.contentFlags === "object" && !Array.isArray(nuclear.contentFlags)) ? nuclear.contentFlags : undefined,
  };
  const parsedNuclear = documentReviewEnvelopeSchema.safeParse(nuclearMinimal);
  if (parsedNuclear.success) {
    console.warn("[combined-extraction] nuclear fallback succeeded — some fields dropped", {
      aggressiveErrors: parsedAggressive.error.issues.slice(0, 3).map((i) => ({ path: i.path.join("."), message: i.message })),
      rawHead: rawText.slice(0, 200),
    });
    return {
      raw: rawText,
      envelope: parsedNuclear.data,
    };
  }

  // All coercion attempts failed — throw coerced error (better signal) so combined path falls back
  console.warn("[combined-extraction] all coercion attempts failed", {
    firstAttemptErrors: parsed.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    aggressiveErrors: parsedAggressive.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    nuclearErrors: parsedNuclear.error.issues.slice(0, 5).map((i) => ({ path: i.path.join("."), message: i.message })),
    rawHead: rawText.slice(0, 300),
  });
  throw new z.ZodError(parsedAggressive.error.issues);
}
