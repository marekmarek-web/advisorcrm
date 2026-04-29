/**
 * Standardized reason code registry for pipeline failures, review triggers, and apply blocks.
 * Each code carries severity, human-readable message, and retry guidance.
 */

export type ReasonCodeSeverity = "info" | "warning" | "blocking";

export type ReasonCode = {
  code: string;
  severity: ReasonCodeSeverity;
  humanMessage: string;
  retryRecommended: boolean;
  retryStrategy?: string;
};

const REGISTRY: ReasonCode[] = [
  // Preprocessing
  { code: "preprocess_failed", severity: "warning", humanMessage: "Předzpracování dokumentu se nezdařilo — zpracování proběhlo na původním souboru. Zkuste dokument nahrát znovu.", retryRecommended: true, retryStrategy: "adobe_retry" },
  { code: "preprocess_timeout", severity: "warning", humanMessage: "Předzpracování trvalo příliš dlouho. Zkuste dokument nahrát znovu.", retryRecommended: true, retryStrategy: "adobe_retry" },
  { code: "low_text_coverage", severity: "warning", humanMessage: "Dokument se nepodařilo spolehlivě přečíst — pravděpodobně jde o scan nebo obrázek. Zkuste nahrát čitelnější verzi.", retryRecommended: false },

  // Classification
  { code: "low_classification_confidence", severity: "warning", humanMessage: "Typ dokumentu nebyl rozpoznán s dostatečnou jistotou — ověřte, zda odpovídá skutečnosti.", retryRecommended: false },
  { code: "unsupported_document_type", severity: "blocking", humanMessage: "Tento typ dokumentu zatím neumíme automaticky zpracovat. Přiřaďte ho ručně.", retryRecommended: false },
  { code: "ambiguous_classification", severity: "warning", humanMessage: "Typ dokumentu je nejednoznačný — zkontrolujte, zda odpovídá obsahu.", retryRecommended: false },

  // Extraction
  { code: "schema_validation_failed", severity: "blocking", humanMessage: "Údaje z dokumentu neprošly kontrolou — zkuste ho nahrát znovu.", retryRecommended: true, retryStrategy: "extraction_retry" },
  { code: "extraction_parse_error", severity: "blocking", humanMessage: "Zpracování dokumentu se nezdařilo. Zkuste ho nahrát znovu.", retryRecommended: true, retryStrategy: "extraction_retry" },
  { code: "rate_limit_exceeded", severity: "blocking", humanMessage: "Služba je momentálně přetížená. Zkuste to prosím za minutu.", retryRecommended: true, retryStrategy: "backoff_retry" },

  // Payment
  { code: "payment_missing_critical_fields", severity: "blocking", humanMessage: "V platebních pokynech chybí klíčové údaje — částka nebo číslo účtu.", retryRecommended: false },
  { code: "payment_missing_identifier", severity: "warning", humanMessage: "V platebních pokynech chybí variabilní symbol nebo jiný identifikátor. Doplňte ručně.", retryRecommended: false },
  { code: "payment_low_confidence", severity: "warning", humanMessage: "Platební údaje byly nalezeny jen částečně — doporučujeme je zkontrolovat oproti dokumentu.", retryRecommended: false },

  // Quality / OCR
  { code: "low_ocr_quality", severity: "warning", humanMessage: "Dokument se nepodařilo spolehlivě přečíst. Údaje je potřeba ručně zkontrolovat.", retryRecommended: false },
  { code: "scan_blur_detected", severity: "info", humanMessage: "Scan je rozmazaný — některé údaje mohou být nepřesné. Zkontrolujte je oproti originálu.", retryRecommended: false },
  { code: "scan_low_contrast", severity: "info", humanMessage: "Scan má nízký kontrast — zkontrolujte údaje oproti originálu.", retryRecommended: false },

  // Client matching
  { code: "ambiguous_client_match", severity: "blocking", humanMessage: "V CRM existuje více možných klientů — vyberte správného před zápisem.", retryRecommended: false },
  { code: "near_match_advisory", severity: "warning", humanMessage: "Nalezena pravděpodobná shoda s klientem v CRM — ověřte, zda jde o správnou osobu.", retryRecommended: false },
  { code: "no_client_match", severity: "warning", humanMessage: "Klient nebyl nalezen v CRM. Potvrďte vytvoření nového záznamu, nebo vyberte existujícího.", retryRecommended: false },

  // Apply gates
  { code: "proposal_not_final", severity: "warning", humanMessage: "AI našla znaky návrhu/modelace. Ověřte před schválením.", retryRecommended: false },
  { code: "envelope_classification_conflict", severity: "blocking", humanMessage: "Rozpoznaný typ neodpovídá obsahu dokumentu — zkontrolujte a opravte klasifikaci.", retryRecommended: false },

  // Pipeline
  { code: "pipeline_failed_step", severity: "blocking", humanMessage: "Zpracování se zastavilo v jednom z kroků. Zkuste dokument nahrát znovu.", retryRecommended: true, retryStrategy: "manual_escalation" },

  // Extraction confidence & quality
  { code: "low_confidence", severity: "warning", humanMessage: "Některé údaje byly nalezeny jen částečně — důkladně je zkontrolujte oproti dokumentu.", retryRecommended: false },
  { code: "critical_review_warning", severity: "blocking", humanMessage: "Dokument vyžaduje vaši ruční kontrolu před dalším zpracováním.", retryRecommended: false },
  { code: "incomplete_required_data", severity: "warning", humanMessage: "Některé povinné údaje chybí. Doplňte je ručně nebo ověřte s klientem.", retryRecommended: false },
  { code: "sensitive_section_detected", severity: "warning", humanMessage: "Dokument obsahuje citlivé osobní údaje — zpracovávejte v souladu s GDPR.", retryRecommended: false },
  { code: "low_text_coverage_estimate", severity: "warning", humanMessage: "Dokument se nepodařilo spolehlivě přečíst — pravděpodobně jde o scan. Zkuste nahrát čitelnější verzi.", retryRecommended: false },
  { code: "adobe_preprocess_failed_fallback", severity: "warning", humanMessage: "Předzpracování se nezdařilo — zpracování proběhlo na původním souboru. Výsledek zkontrolujte.", retryRecommended: true },
  { code: "model_flagged", severity: "warning", humanMessage: "Dokument byl označen ke kontrole — ověřte klíčové údaje.", retryRecommended: false },

  // Document lifecycle
  { code: "proposal_not_final_contract", severity: "warning", humanMessage: "AI našla znaky návrhu/modelace. Ověřte před schválením.", retryRecommended: false },
  { code: "offer_not_binding_contract", severity: "warning", humanMessage: "AI našla znaky nabídky. Ověřte před schválením.", retryRecommended: false },
  { code: "proposal_or_modelation_not_final_contract", severity: "warning", humanMessage: "AI našla znaky návrhu/modelace. Ověřte před schválením.", retryRecommended: false },
  { code: "supporting_document_review", severity: "info", humanMessage: "Podpůrný dokument — zkontrolujte, zda obsahuje relevantní informace.", retryRecommended: false },

  // Payment
  { code: "payment_needs_review", severity: "warning", humanMessage: "Platební pokyny vyžadují vaši kontrolu před zápisem.", retryRecommended: false },
  { code: "payment_extraction_failed", severity: "blocking", humanMessage: "Platební pokyny se nepodařilo automaticky přečíst. Zadejte je ručně.", retryRecommended: true },
  { code: "payment_validation_needs_review", severity: "warning", humanMessage: "Platební údaje neprošly kontrolou — ověřte je oproti dokumentu.", retryRecommended: false },

  // Matching
  { code: "missing_existing_contract_match", severity: "warning", humanMessage: "Odpovídající smlouva nebyla nalezena v CRM.", retryRecommended: false },

  // Advisor-facing extraction gaps
  { code: "policyholder_missing", severity: "warning", humanMessage: "Údaje o pojistníkovi nebyly nalezeny s dostatečnou jistotou — ověřte v dokumentu nebo doplňte ručně.", retryRecommended: false },
  { code: "document_family_unknown", severity: "warning", humanMessage: "Rodina produktu nebyla rozpoznána — ověřte typ dokumentu podle jeho obsahu.", retryRecommended: false },
];

const CODE_MAP = new Map<string, ReasonCode>(REGISTRY.map((r) => [r.code, r]));

export function getReasonCode(code: string): ReasonCode | undefined {
  return CODE_MAP.get(code);
}

export function getReasonMessage(code: string): string {
  return CODE_MAP.get(code)?.humanMessage ?? code;
}

export function isBlocking(code: string): boolean {
  return CODE_MAP.get(code)?.severity === "blocking";
}

export function isRetryRecommended(code: string): boolean {
  return CODE_MAP.get(code)?.retryRecommended ?? false;
}

export function getAllReasonCodes(): ReasonCode[] {
  return [...REGISTRY];
}
