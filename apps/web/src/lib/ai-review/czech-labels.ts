/**
 * User-facing Czech labels for AI Review classifier enums (fallback when model omits labels).
 */

import { getReasonMessage } from "../ai/reason-codes";

const DOC_TYPE: Record<string, string> = {
  contract: "Smlouva",
  proposal: "Návrh",
  modelation: "Modelace",
  amendment: "Dodatek / změna",
  statement: "Výpis",
  payment_instructions: "Platební pokyny",
  supporting_document: "Podkladový dokument",
  termination_document: "Ukončení / výpověď",
  consent_or_identification_document: "Souhlas / identifikace",
  confirmation_document: "Potvrzení",
  unknown: "Jiný dokument",
};

const FAMILY: Record<string, string> = {
  life_insurance: "Životní pojištění",
  non_life_insurance: "Neživotní pojištění",
  investment: "Investice",
  pp: "Penzijní připojištění (PP)",
  dps: "Doplňkové penzijní spoření (DPS)",
  dip: "Dlouhodobý investiční produkt (DIP)",
  building_savings: "Stavební spoření",
  loan: "Úvěr",
  mortgage: "Hypotéka",
  banking: "Bankovnictví",
  legacy_financial_product: "Starší finanční produkt",
  unknown: "Rodina produktu nebyla rozpoznána",
};

const SUBTYPE: Record<string, string> = {
  risk_life_insurance: "Rizikové životní",
  investment_life_insurance: "Investiční životní",
  capital_life_insurance: "Kapitálové životní",
  car_insurance: "Pojištění vozidla",
  property_insurance: "Majetek",
  household_insurance: "Domácnost",
  home_insurance: "Domácnost / domov",
  liability_insurance: "Odpovědnost",
  travel_insurance: "Cestovní",
  consumer_loan: "Spotřebitelský úvěr",
  mortgage_loan: "Hypoteční úvěr",
  bank_statement_standard: "Bankovní výpis",
  income_payroll: "Výplatní páska",
  income_tax_return: "Daňové přiznání",
  aml_kyc_form: "AML / KYC",
  direct_debit_mandate: "Inkasní mandát",
  confirmation_of_contract: "Potvrzení smlouvy",
  confirmation_of_payment: "Potvrzení platby",
  fundoo: "FUNDOO (pravidelná / jednorázová investice, typicky Amundi)",
  amundi_platform: "Amundi / investiční platforma",
  unknown: "Jiný podtyp",
};

/** Neznámé enum hodnoty — bez anglických kódů v UI. */
function labelUnknownClassifier(kind: string): string {
  return `${kind} — upřesněte podle dokumentu`;
}

export function labelDocumentType(code: string): string {
  const k = code.trim().toLowerCase();
  if (!k) return "Neurčeno";
  return DOC_TYPE[k] ?? labelUnknownClassifier("Typ dokumentu");
}

export function labelProductFamily(code: string): string {
  const k = code.trim().toLowerCase();
  if (!k) return "Neurčeno";
  return FAMILY[k] ?? labelUnknownClassifier("Rodina produktu");
}

export function labelProductSubtype(code: string): string {
  const k = code.trim().toLowerCase();
  if (!k) return "Neurčeno";
  return SUBTYPE[k] ?? labelUnknownClassifier("Podtyp produktu");
}

/** Normalized pipeline branch labels (internal codes → Czech for advisors). */
const PIPELINE_NORMALIZED: Record<string, string> = {
  insurance_modelation: "Modelace / návrh životního pojištění (nezávazná projekce)",
  insurance_proposal: "Návrh životního pojištění",
  life_insurance_contract: "Životní pojištění — smlouva",
  life_insurance: "Životní pojištění",
  nonlife_insurance_contract: "Neživotní pojištění — smlouva",
  consumer_loan: "Spotřebitelský úvěr",
  mortgage: "Hypotéka",
  investment: "Investice",
  payment_instructions: "Platební pokyny",
  supporting_document: "Podkladový dokument",
  manual_review_only: "Vyžaduje ruční kontrolu",
  unknown: "Jiný dokument",
};

export function labelNormalizedPipelineClassification(code: string): string {
  const k = code.trim().toLowerCase();
  if (!k) return "Neurčeno";
  return PIPELINE_NORMALIZED[k] ?? labelUnknownClassifier("Klasifikace dokumentu");
}

export type AiClassifierLike = {
  documentType?: string;
  productFamily?: string;
  productSubtype?: string;
  documentTypeLabel?: string;
  productFamilyLabel?: string;
  productSubtypeLabel?: string;
};

export function formatAiClassifierForAdvisor(c: AiClassifierLike): string {
  const dt = c.documentTypeLabel?.trim() || labelDocumentType(c.documentType ?? "");
  const fam = c.productFamilyLabel?.trim() || labelProductFamily(c.productFamily ?? "");
  const sub = c.productSubtypeLabel?.trim() || labelProductSubtype(c.productSubtype ?? "");
  if (sub && sub !== "Neurčeno") return `${dt} · ${fam} · ${sub}`;
  return `${dt} · ${fam}`;
}

/** Důvody kontroly z pipeline — doplnění nad standardní registry reason-codes. */
const EXTRA_REASON_CS: Record<string, string> = {
  hybrid_contract_signals_detected:
    "V dokumentu jsou prvky více typů smluv — ověřte, že rozpoznaný typ odpovídá skutečnosti.",
  direct_extraction_unsupported_flag:
    "Tento typ dokumentu neumíme plně automaticky zpracovat — doplňte údaje ručně.",
  scan_or_ocr_unusable: "Dokument se nepodařilo spolehlivě přečíst. Zkuste nahrát čitelnější verzi nebo PDF s textovou vrstvou.",
  partial_extraction_coerced:
    "Některé údaje byly dopočítány z kontextu — ověřte je oproti originálu.",
  partial_extraction_merged_into_stub:
    "Údaje byly nalezeny jen částečně — zkontrolujte úplnost oproti dokumentu.",
  payment_data_missing: "Platební údaje chybí nebo nejsou dostatečně jisté. Doplňte je ručně.",
  low_evidence_required: "V dokumentu není dostatek informací — ověřte údaje u klienta nebo v příloze.",
  combined_single_call: "Dokument zpracován v jednom kroku.",
  pipeline_defensive_legacy_extract: "Byla použita záložní metoda zpracování — zkontrolujte výsledek.",
  ai_review_router_manual: "Tento typ dokumentu vyžaduje vaše rozhodnutí.",
  router_review_required_defensive: "Doporučujeme zkontrolovat výsledek zpracování.",
  product_family_text_override: "Rodina produktu byla upřesněna podle obsahu dokumentu.",
  router_input_text_override: "Zpracování bylo upraveno podle textu dokumentu.",
  combined_dip_dps_type_override: "Typ DIP/DPS byl upřesněn podle obsahu dokumentu.",
  policyholder_missing: "Údaje o pojistníkovi nebyly nalezeny s dostatečnou jistotou — ověřte v dokumentu nebo doplňte ručně.",
  "policyholder missing": "Údaje o pojistníkovi nebyly nalezeny s dostatečnou jistotou — ověřte v dokumentu nebo doplňte ručně.",
  document_family_unknown: "Rodina produktu nebyla rozpoznána — ověřte typ dokumentu podle jeho obsahu.",
  "document family unknown": "Rodina produktu nebyla rozpoznána — ověřte typ dokumentu podle jeho obsahu.",
  document_family_unclassified: "Rodina produktu nebyla rozpoznána — ověřte typ dokumentu podle jeho obsahu.",
  platform: "Chybí typ nebo platforma investičního produktu — ověřte podle dokumentu.",
  investment_payment_instruction:
    "Platební blok k investici je potřeba ověřit ručně (účet nebo IBAN, variabilní symbol, výše a příjemce).",
  investment_payment_instructions:
    "Platební blok k investici je potřeba ověřit ručně (účet nebo IBAN, variabilní symbol, výše a příjemce).",
  policyholder: "U pojištění ověřte, že pojistník odpovídá osobě a údajům v dokumentu.",
  policy_holder: "U pojištění ověřte, že pojistník odpovídá osobě a údajům v dokumentu.",
  low_classifier_confidence: "Typ dokumentu nebyl rozpoznán s dostatečnou jistotou — ověřte, zda odpovídá skutečnosti.",
  no_markdown_content_for_pdf: "Z dokumentu se nepodařilo získat čitelný text. Zkuste nahrát čitelnější verzi.",
  scan_pending_ocr: "Dokument čeká na rozpoznání textu ze skenu. Zkuste to za chvíli znovu.",
};

const PATH_PREFIX_RE =
  /^(?:extractedFields|documentClassification|documentMeta|publishHints|packetMeta|parties|financialTerms)\./i;

function stripInternalPathPrefixes(s: string): string {
  let t = s.trim();
  for (let i = 0; i < 8 && PATH_PREFIX_RE.test(t); i++) {
    t = t.replace(PATH_PREFIX_RE, "").trim();
  }
  if (t.includes(".")) {
    const parts = t.split(".").filter(Boolean);
    const last = parts[parts.length - 1];
    if (last && /^[a-zA-Z][a-zA-Z0-9_]*$/.test(last)) {
      t = last;
    }
  }
  return t.trim();
}

function normalizeReasonKey(s: string): string {
  return stripInternalPathPrefixes(s)
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_")
    .replace(/[^a-z0-9_]/g, "");
}

function resolveOneReasonToken(token: string): string | null {
  const trimmed = token.trim();
  if (!trimmed) return null;
  const stripped = stripInternalPathPrefixes(trimmed);
  const k = normalizeReasonKey(stripped);
  const variants = Array.from(new Set([stripped, stripped.toLowerCase(), k].filter(Boolean)));
  for (const v of variants) {
    if (EXTRA_REASON_CS[v]) return EXTRA_REASON_CS[v];
  }
  for (const v of variants) {
    const msg = getReasonMessage(v);
    if (msg !== v) return msg;
  }
  if (/^[a-z][a-z0-9_]*$/i.test(stripped) && stripped.includes("_") && stripped.length <= 80) {
    return "Výstup zpracování vyžaduje ověření — porovnejte s dokumentem.";
  }
  if (/[a-zA-Z]/.test(stripped) && stripped.length > 80) {
    return "Výstup zpracování vyžaduje ověření — porovnejte s dokumentem.";
  }
  return null;
}

/**
 * Převod interních kódů a prefixovaných důvodů (např. `router_…:code`) na čitelnou češtinu pro poradce.
 * Použití: ruční kontrola v UI, PDF export, checklist.
 */
export function humanizeReviewReasonLine(raw: string): string {
  const t = raw.trim();
  if (!t) return t;

  if (t.includes(":")) {
    const idx = t.indexOf(":");
    const prefix = stripInternalPathPrefixes(t.slice(0, idx).trim());
    const suffix = t.slice(idx + 1).trim();
    const leftResolved =
      resolveOneReasonToken(prefix) ??
      (getReasonMessage(normalizeReasonKey(prefix)) !== normalizeReasonKey(prefix)
        ? getReasonMessage(normalizeReasonKey(prefix))
        : null);
    const leftLabel =
      leftResolved ??
      (prefix.length > 0 && !/^[a-z0-9_]+$/i.test(prefix)
        ? prefix
        : "Kontrola dokumentu");
    if (!suffix) return leftLabel;
    const subParts = suffix.split(",").map((s) => s.trim()).filter(Boolean);
    const rightBits = subParts.map((s) => {
      const r = resolveOneReasonToken(s);
      if (r) return r;
      const nk = normalizeReasonKey(s);
      const msg = getReasonMessage(nk);
      return msg !== nk ? msg : "Podrobnost ke kontrole";
    });
    return `${leftLabel}: ${rightBits.join(", ")}`;
  }

  const stripped = stripInternalPathPrefixes(t);
  const single = resolveOneReasonToken(stripped);
  if (single) return single;

  const nk = normalizeReasonKey(stripped);
  const fromRegistry = getReasonMessage(nk);
  if (fromRegistry !== nk) return fromRegistry;
  if (EXTRA_REASON_CS[nk]) return EXTRA_REASON_CS[nk];

  if (/^[a-z][a-z0-9_]*$/i.test(stripped) && stripped.includes("_")) {
    return "Výstup zpracování vyžaduje ověření — porovnejte s dokumentem.";
  }
  // Zachovat již české věty z API / validace (nejsou to interní kódy).
  if (/[áčďéěíňóřšťúůýž]/i.test(stripped)) {
    return stripped;
  }
  if (stripped.length > 0 && stripped.length < 200 && /[\s]/.test(stripped)) {
    return "Výstup zpracování vyžaduje ověření — porovnejte s dokumentem.";
  }
  return "Kontrola dokumentu";
}
