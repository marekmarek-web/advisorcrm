/**
 * Section-specific extraction prompt builders for per-subdocument routing.
 *
 * These prompts are targeted at SPECIFIC sections within a bundle document.
 * They are used by the subdocument extraction orchestrator when a multi-section
 * bundle is detected. Each prompt focuses on extracting data for ONE type of
 * subdocument only — ignoring the rest of the document.
 *
 * Design:
 * - Hardcoded prompts (not Prompt Builder IDs) — no env config required.
 * - Small focused JSON schemas — minimal token footprint.
 * - Called only when the corresponding section is detected with confidence >= 0.4.
 */

import type { PacketSubdocumentCandidate } from "./document-packet-types";

// ─── Health Questionnaire ─────────────────────────────────────────────────────

export const HEALTH_SECTION_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["healthSectionPresent", "questionnaireEntries"],
  properties: {
    healthSectionPresent: { type: "boolean" },
    questionnaireEntries: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["questionnairePresent"],
        properties: {
          participantName: { type: "string" },
          participantRole: { type: "string" },
          questionnairePresent: { type: "boolean" },
          sectionSummary: { type: "string" },
          medicallyRelevantFlags: {
            type: "array",
            items: { type: "string" },
          },
        },
      },
    },
  },
};

export type HealthSectionExtractionOutput = {
  healthSectionPresent: boolean;
  questionnaireEntries: Array<{
    participantName?: string;
    participantRole?: string;
    questionnairePresent: boolean;
    sectionSummary?: string;
    medicallyRelevantFlags?: string[];
  }>;
};

/**
 * Build a focused prompt for extracting health questionnaire data from a document.
 * The LLM is explicitly told to ONLY extract health questionnaire sections.
 *
 * The `documentText` should already be pre-sliced to the health section window
 * by the orchestrator (via sliceSectionTextForType). This function further
 * reinforces the isolation rules so the model doesn't contaminate output.
 */
export function buildHealthSectionExtractionPrompt(
  documentText: string,
  candidates: PacketSubdocumentCandidate[],
): string {
  const hintLines = candidates
    .filter((c) => c.type === "health_questionnaire" || c.type === "aml_fatca_form")
    .map((c) => `- ${c.label}${c.sectionHeadingHint ? `: "${c.sectionHeadingHint}"` : ""}`)
    .join("\n");

  const trimmedText = documentText.trim();
  const isNarrowedWindow = trimmedText.length < 20_000;
  const contextNote = isNarrowedWindow
    ? "Obdržíš POUZE zdravotní sekci dokumentu — text byl fyzicky izolován ze specifických stránek/bloků. Neobsahuje smlouvu ani jiné sekce."
    : "Obdržíš celý text dokumentu. Zaměř se VÝHRADNĚ na zdravotní dotazníky nebo zdravotní prohlášení.";

  return `Jsi extrakční systém pro zdravotní dotazníky ve finančních dokumentech.

Tvůj úkol: Identifikuj a extrahuj POUZE zdravotní dotazníky nebo zdravotní prohlášení.
Ignoruj smlouvu, investiční sekci, AML formuláře a platební instrukce.
NEEXTRAHUJ z tohoto vstupu contractual facts — číslo smlouvy, pojistné, pojistník ani rizika.
Tyto informace patří do smluvní části, ne do zdravotního výstupu.

${contextNote}

KRITICKÁ PRAVIDLA IZOLACE:
- Výstup zdravotní extrakce NESMÍ ovlivnit smluvní část (contract core extraction).
- Jméno osoby uváděj pouze pokud je explicitně v zdravotní sekci — neodvozuj z titulní stránky smlouvy.
- Pokud vidíš pojistné nebo číslo smlouvy, IGNORUJ je — nepatří do zdravotního výstupu.
- healthSectionPresent nastav na true pouze pokud jsou v textu skutečné zdravotní otázky nebo prohlášení.

PRAVIDLO EVIDENCE:
Uváděj POUZE hodnoty explicitně přítomné v textu. Nepokládej domněnky o zdravotním stavu
ani nevypočítávej chybějící hodnoty z jiných sekcí. Pokud je jméno osoby uvedeno explicitně
v zdravotní sekci, uveď ho. Pokud není, nech participantName prázdný.

${hintLines ? `Detekované sekce v dokumentu:\n${hintLines}\n` : ""}

Pro každou nalezenou osobu v zdravotní sekci vyplň:
- participantName: celé jméno osoby (nebo prázdný string, pokud není uvedeno V ZDRAVOTNÍ SEKCI)
- participantRole: role osoby (pojistník / pojištěný / dítě / jiný)
- questionnairePresent: true pokud je zdravotní dotazník pro tuto osobu přítomný
- sectionSummary: stručný popis (1–2 věty) co sekce obsahuje, bez zdravotních detailů
- medicallyRelevantFlags: obecné příznaky důležité pro upisování (max 5 položek), NIKDY konkrétní diagnózy

Pokud zdravotní sekce není přítomna, vrať healthSectionPresent: false a prázdné pole.
Vrátíš pouze JSON dle schema. Žádný markdown, žádný komentář.

TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmedText}
<<<END_DOCUMENT_TEXT>>>`;
}

// ─── AML / FATCA ─────────────────────────────────────────────────────────────

export const AML_SECTION_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["amlSectionPresent", "declarationPresent", "complianceFlags"],
  properties: {
    amlSectionPresent: { type: "boolean" },
    declarationPresent: { type: "boolean" },
    politicallyExposedPerson: { type: ["boolean", "null"] },
    complianceFlags: {
      type: "array",
      items: { type: "string" },
    },
    participantName: { type: "string" },
  },
};

export type AmlSectionExtractionOutput = {
  amlSectionPresent: boolean;
  declarationPresent: boolean;
  politicallyExposedPerson?: boolean | null;
  complianceFlags: string[];
  participantName?: string;
};

/**
 * Build a focused prompt for extracting AML/FATCA compliance data.
 */
export function buildAmlSectionExtractionPrompt(documentText: string): string {
  const trimmedText = documentText.trim();
  return `Jsi extrakční systém pro AML/FATCA formuláře ve finančních dokumentech.

Tvůj úkol: Identifikuj a extrahuj POUZE AML (Anti-Money Laundering) nebo FATCA sekce.
Ignoruj smlouvu, zdravotní dotazníky a platební instrukce.

Extrahuj:
- amlSectionPresent: true pokud je AML/FATCA sekce přítomna
- declarationPresent: true pokud obsahuje prohlášení o původu prostředků
- politicallyExposedPerson: true/false/null dle obsahu (null pokud neuveden)
- complianceFlags: seznam relevantních compliance příznaků (max 5)
- participantName: jméno deklarující osoby, pokud je uvedeno

Vrátíš pouze JSON dle schema. Žádný markdown, žádný komentář.

TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmedText}
<<<END_DOCUMENT_TEXT>>>`;
}

// ─── Investment / DIP / DPS section ──────────────────────────────────────────

export const INVESTMENT_SECTION_EXTRACTION_SCHEMA: Record<string, unknown> = {
  type: "object",
  additionalProperties: false,
  required: ["investmentSectionPresent", "productType"],
  properties: {
    investmentSectionPresent: { type: "boolean" },
    /**
     * DIP | DPS | PP | investment_fund | investment_life_insurance | investment_service_agreement | unknown
     */
    productType: { type: "string" },
    strategy: { type: "string" },
    funds: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["name"],
        properties: {
          name: { type: "string" },
          allocation: { type: ["string", "number", "null"] },
          isin: { type: "string" },
        },
      },
    },
    investmentAmount: { type: ["string", "number", "null"] },
    investmentPremium: { type: ["string", "number", "null"] },
    provider: { type: "string" },
    contractNumber: { type: "string" },
    productName: { type: "string" },
    /** True when values come from an illustration/modelation (not binding). */
    isModeledData: { type: "boolean" },
    /** True when values are contractual/binding. */
    isContractualData: { type: "boolean" },
    notes: { type: "string" },
  },
};

export type InvestmentSectionExtractionOutput = {
  investmentSectionPresent: boolean;
  productType: string;
  strategy?: string;
  funds?: Array<{ name: string; allocation?: string | number | null; isin?: string }>;
  investmentAmount?: string | number | null;
  investmentPremium?: string | number | null;
  provider?: string;
  contractNumber?: string;
  productName?: string;
  isModeledData?: boolean;
  isContractualData?: boolean;
  notes?: string;
};

/**
 * Build a focused prompt for extracting investment/DIP/DPS data from a document.
 * Only extracts investment-specific fields; ignores health, AML, and base contract data.
 */
export function buildInvestmentSectionExtractionPrompt(
  documentText: string,
  candidates: PacketSubdocumentCandidate[],
): string {
  const invCandidates = candidates.filter(
    (c) => c.type === "investment_section",
  );
  const hintLines = invCandidates
    .map((c) => `- ${c.label}${c.sectionHeadingHint ? `: "${c.sectionHeadingHint}"` : ""}`)
    .join("\n");

  const trimmedText = documentText.trim();
  const isNarrowedWindow = trimmedText.length < 20_000;
  const contextNote = isNarrowedWindow
    ? "Obdržíš POUZE investiční sekci dokumentu — text byl fyzicky izolován ze specifických stránek/bloků. Ostatní sekce (smlouva, zdravotní dotazník) nejsou přítomny v tomto vstupu."
    : "Obdržíš celý text dokumentu. Zaměř se VÝHRADNĚ na investiční sekci.";

  return `Jsi extrakční systém specializovaný na investiční produkty, DIP a DPS.

Tvůj úkol: Identifikuj a extrahuj POUZE investiční data — strategie, fondy, alokace, investiční prémie, typ produktu.
Ignoruj smlouvu pojištění osob, zdravotní dotazníky a AML formuláře.
NEEXTRAHUJ z tohoto vstupu pojistná rizika, základní pojistné smlouvy ani zdravotní údaje.

${contextNote}

KRITICKÁ PRAVIDLA IZOLACE:
- investmentStrategy, investmentFunds, fundAllocation taháš VÝHRADNĚ z investiční sekce.
- Neodvozuj strategii z jiné části (např. pojistné smlouvy nebo titulní stránky).
- isModeledData = true pokud jsou hodnoty z ilustrace / modelace / nezávazné kalkulace.
- isContractualData = true POUZE pokud jde o podepsanou smlouvu (ne ilustraci, ne modelaci).
- Pokud vidíš základní pojistnou smlouvu bez investiční složky, vrať investmentSectionPresent: false.

PRAVIDLO EVIDENCE:
Extrahuj VÝHRADNĚ hodnoty, které jsou explicitně uvedeny v textu před tebou.
Nepokus se odvodit investiční strategii z jiné sekce dokumentu.
Neodhaduj výši prémie z pojistné smlouvy — zadej pouze, pokud je v investiční sekci explicitně zmíněna.
Pokud hodnota v textu chybí, nech pole null nebo prázdné.

${hintLines ? `Detekované investiční sekce:\n${hintLines}\n` : ""}

Rozlišuj přesně:
- DIP (Dlouhodobý investiční produkt) — novinka od 2024, daňový odpočet
- DPS (Doplňkové penzijní spoření) — státní příspěvek, penzijní společnost
- PP (Penzijní připojištění) — starší produkt, transformované fondy
- IŽP s investiční složkou — fondové životní pojištění
- Čistá investiční smlouva / investiční program

Extrahuj:
- productType: typ produktu (DIP | DPS | PP | investment_fund | investment_life_insurance | investment_service_agreement | unknown)
- strategy: název investiční strategie, pokud je uveden EXPLICITNĚ v textu
- funds: seznam fondů s alokací (%), pokud jsou uvedeny EXPLICITNĚ; může být prázdné
- investmentAmount: celková investiční částka, pokud je uvedena EXPLICITNĚ
- investmentPremium: investiční prémie nebo část pojistného jdoucí do investic
- provider: název instituce / pojišťovny / penzijní společnosti
- contractNumber: číslo smlouvy nebo DIP/DPS účtu, pokud je k dispozici
- productName: název produktu
- isModeledData: true pokud jsou hodnoty z modelace nebo ilustrace (nezávazné)
- isContractualData: true pokud jsou hodnoty smluvní (závazné, z podepsané smlouvy)
- notes: stručná poznámka (max 1–2 věty), pokud je relevantní

Pokud investiční sekce není přítomna, vrať investmentSectionPresent: false.
Vrátíš pouze JSON dle schema. Žádný markdown, žádný komentář.

TEXT DOKUMENTU:
<<<DOCUMENT_TEXT>>>
${trimmedText}
<<<END_DOCUMENT_TEXT>>>`;
}

// ─── Contract section (for bundle type correction) ────────────────────────────

/**
 * Build a section-aware extraction prompt that tells the LLM about detected
 * bundle sections. Used as an AUGMENTATION of the combined extraction prompt
 * when a bundle is detected — adds explicit section context at the top.
 */
export function buildBundleAwareExtractionHint(
  candidates: PacketSubdocumentCandidate[],
): string {
  if (candidates.length === 0) return "";

  const sectionLines = candidates
    .map(
      (c, i) =>
        `  ${i + 1}. ${c.label} (typ: ${c.type}, publishovatelný: ${c.publishable ? "ANO" : "NE"}${c.pageRangeHint ? `, strany: ${c.pageRangeHint}` : ""})`,
    )
    .join("\n");

  return `UPOZORNĚNÍ: Dokument je bundle (více logických sekcí):
${sectionLines}

Při extrakci:
- Extrahuj contract fields Z finální smlouvy nebo návrhu smlouvy, ne ze zdravotního dotazníku nebo AML.
- Nepublikuj zdravotní dotazníky ani AML/FATCA jako smlouvu.
- Nastav contentFlags.containsMultipleDocumentSections = true.
- Životní cyklus (lifecycleStatus) urči podle PRIMÁRNÍ sekce (finální smlouva > návrh > modelace).`;
}
