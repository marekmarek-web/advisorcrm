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
  { code: "preprocess_failed", severity: "warning", humanMessage: "Adobe preprocessing selhal — extrakce proběhla na surových datech.", retryRecommended: true, retryStrategy: "adobe_retry" },
  { code: "preprocess_timeout", severity: "warning", humanMessage: "Preprocessing vypršel — zkuste dokument znovu.", retryRecommended: true, retryStrategy: "adobe_retry" },
  { code: "low_text_coverage", severity: "warning", humanMessage: "Nízké pokrytí textu — scan nebo obrázek bez kvalitního OCR.", retryRecommended: false },

  // Classification
  { code: "low_classification_confidence", severity: "warning", humanMessage: "Nízká jistota klasifikace — typ dokumentu nejistý.", retryRecommended: false },
  { code: "unsupported_document_type", severity: "blocking", humanMessage: "Nepodporovaný typ dokumentu — nelze automaticky zpracovat.", retryRecommended: false },
  { code: "ambiguous_classification", severity: "warning", humanMessage: "Typ dokumentu je nejednoznačný — vyžaduje ruční ověření.", retryRecommended: false },

  // Extraction
  { code: "schema_validation_failed", severity: "blocking", humanMessage: "Extrahovaná data neprošla validací schématu.", retryRecommended: true, retryStrategy: "extraction_retry" },
  { code: "extraction_parse_error", severity: "blocking", humanMessage: "AI vrátila nevalidní JSON — extrakce selhala.", retryRecommended: true, retryStrategy: "extraction_retry" },
  { code: "rate_limit_exceeded", severity: "blocking", humanMessage: "Dosažen limit API volání — zkuste znovu za chvíli.", retryRecommended: true, retryStrategy: "backoff_retry" },

  // Payment
  { code: "payment_missing_critical_fields", severity: "blocking", humanMessage: "Platební pokyny — chybí klíčové údaje (částka, účet).", retryRecommended: false },
  { code: "payment_missing_identifier", severity: "warning", humanMessage: "Platební pokyny — chybí variabilní symbol nebo jiný identifikátor.", retryRecommended: false },
  { code: "payment_low_confidence", severity: "warning", humanMessage: "Platební údaje mají nízkou jistotu — doporučena kontrola.", retryRecommended: false },

  // Quality / OCR
  { code: "low_ocr_quality", severity: "warning", humanMessage: "Nízká kvalita OCR — výsledek může být nepřesný.", retryRecommended: false },
  { code: "scan_blur_detected", severity: "info", humanMessage: "Rozmazaný scan — snížená přesnost extrakce.", retryRecommended: false },
  { code: "scan_low_contrast", severity: "info", humanMessage: "Nízký kontrast scanu.", retryRecommended: false },

  // Client matching
  { code: "ambiguous_client_match", severity: "blocking", humanMessage: "Více možných shod klientů — potvrďte ručně.", retryRecommended: false },
  { code: "no_client_match", severity: "warning", humanMessage: "Nenalezena shoda klienta v CRM.", retryRecommended: false },

  // Apply gates
  { code: "proposal_not_final", severity: "blocking", humanMessage: "Dokument je návrh/modelace — nelze aplikovat jako finální smlouvu.", retryRecommended: false },
  { code: "envelope_classification_conflict", severity: "blocking", humanMessage: "Konflikt klasifikace — typ neodpovídá obsahu.", retryRecommended: false },

  // Pipeline
  { code: "pipeline_failed_step", severity: "blocking", humanMessage: "Pipeline selhala v jednom z kroků — zkontrolujte detail.", retryRecommended: true, retryStrategy: "manual_escalation" },

  // Extraction confidence & quality
  { code: "low_confidence", severity: "warning", humanMessage: "Nízká jistota extrakce — zkontrolujte výsledek.", retryRecommended: false },
  { code: "critical_review_warning", severity: "blocking", humanMessage: "Kritické upozornění extrakce — dokument vyžaduje ruční kontrolu.", retryRecommended: false },
  { code: "incomplete_required_data", severity: "warning", humanMessage: "Chybí povinné údaje — doplňte ručně nebo ověřte s klientem.", retryRecommended: false },
  { code: "sensitive_section_detected", severity: "warning", humanMessage: "Dokument obsahuje citlivé osobní údaje.", retryRecommended: false },
  { code: "low_text_coverage_estimate", severity: "warning", humanMessage: "Nízké pokrytí textu v dokumentu — pravděpodobně scan bez OCR.", retryRecommended: false },
  { code: "adobe_preprocess_failed_fallback", severity: "warning", humanMessage: "Adobe preprocessing selhal — extrakce proběhla na surových datech.", retryRecommended: true },
  { code: "model_flagged", severity: "warning", humanMessage: "Model označil dokument ke kontrole.", retryRecommended: false },

  // Document lifecycle
  { code: "proposal_not_final_contract", severity: "warning", humanMessage: "Dokument je návrh smlouvy — není to finální smlouva.", retryRecommended: false },
  { code: "offer_not_binding_contract", severity: "warning", humanMessage: "Dokument je nabídka — není to závazná smlouva.", retryRecommended: false },
  { code: "proposal_or_modelation_not_final_contract", severity: "warning", humanMessage: "Návrh nebo modelace — nejedná se o finální smlouvu.", retryRecommended: false },
  { code: "supporting_document_review", severity: "info", humanMessage: "Podpůrný dokument vyžaduje ruční kontrolu.", retryRecommended: false },

  // Payment
  { code: "payment_needs_review", severity: "warning", humanMessage: "Platební pokyny vyžadují ruční kontrolu.", retryRecommended: false },
  { code: "payment_extraction_failed", severity: "blocking", humanMessage: "Extrakce platebních pokynů selhala.", retryRecommended: true },
  { code: "payment_validation_needs_review", severity: "warning", humanMessage: "Validace platebních údajů vyžaduje ruční kontrolu.", retryRecommended: false },

  // Matching
  { code: "missing_existing_contract_match", severity: "warning", humanMessage: "Nenalezena odpovídající existující smlouva v CRM.", retryRecommended: false },
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
