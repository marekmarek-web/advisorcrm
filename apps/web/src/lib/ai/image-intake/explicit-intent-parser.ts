/**
 * Structured intent parser for advisor accompanying text.
 *
 * Extracts:
 * - target client name (explicit)
 * - intent verb (přiřaď, doplň, ulož, pošli, založ...)
 * - target destination (CRM, portál, poznámka, úkol...)
 * - requested fields (rodné číslo, adresa, telefon, email, platební údaje...)
 * - target operation type (update_contact | create_note | create_task | portal_payment | create_contact | draft_reply | attach)
 *
 * Reuse-first: extends parseExplicitClientNameFromText patterns.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type ExplicitIntentVerb =
  | "assign"    // přiřaď, přiřadit, připoj
  | "fill"      // doplň, doplnit, vyplň
  | "save"      // ulož, uložit, zapiš
  | "send"      // pošli, odešli, přepošli
  | "create"    // vytvoř, založ, založit
  | "prepare"   // připrav, připravit
  | "update"    // aktualizuj, uprav
  | "note"      // udělej poznámku
  | "unknown";

export type IntentTargetDestination =
  | "crm"
  | "portal"
  | "portal_payment"
  | "note"
  | "task"
  | "followup"
  | "reply"
  | "client_card"
  | "unknown";

export type IntentTargetOperation =
  | "update_contact"
  | "create_contact"
  | "create_note"
  | "create_task"
  | "create_followup"
  | "portal_payment_update"
  | "draft_reply"
  | "attach_to_client"
  | "unknown";

export type ParsedExplicitIntent = {
  clientName: string | null;
  verb: ExplicitIntentVerb;
  destination: IntentTargetDestination;
  operation: IntentTargetOperation;
  requestedFields: string[];
  hasExplicitTarget: boolean;
  mentionsClientPlacement: boolean;
  mentionsCrmDestination: boolean;
  mentionsTaskIntent: boolean;
  mentionsNoteIntent: boolean;
  raw: string;
};

// ---------------------------------------------------------------------------
// Client name extraction (extended patterns)
// ---------------------------------------------------------------------------

const CLIENT_NAME_PATTERNS = [
  /(?:ke\s+klientovi|klientovi|pro\s+klienta|klienta|pod\s+klienta|pod\s+klientem|u\s+klienta)\s+([A-ZÁ-Žá-ž][a-zá-ž]+(?:\s+[A-ZÁ-Žá-ž][a-zá-ž]+){1,2})/i,
  /(?:přiřaď|přiřadit|ulož|uložit|připoj|připojit|doplň|doplnit|pošli|odešli).*(?:klientovi|klienta|klientem|klient)\s+([A-ZÁ-Žá-ž][a-zá-ž]+(?:\s+[A-ZÁ-Žá-ž][a-zá-ž]+){1,2})/i,
  /(?:klientovi|klienta|klientem|klient)\s+([A-ZÁ-Žá-ž][a-zá-ž]+(?:\s+[A-ZÁ-Žá-ž][a-zá-ž]+){1,2})(?:\s|$|,|\.)/i,
  /(?:kontaktu|kontakt|pro\s+kontakt)\s+([A-ZÁ-Žá-ž][a-zá-ž]+(?:\s+[A-ZÁ-Žá-ž][a-zá-ž]+){1,2})/i,
  /\bpod\s+([A-ZÁ-Ž][A-Za-zÁ-Žá-ž]*(?:\s+[A-ZÁ-Ž][A-Za-zÁ-Žá-ž]*){0,2})\b/u,
  /\bklienta\s+([A-Za-zÁ-Žá-ž]{2,}(?:\s+[A-Za-zÁ-Žá-ž]{2,}){0,2})\b/u,
  /\bklientovi\s+([A-Za-zÁ-Žá-ž]{2,}(?:\s+[A-Za-zÁ-Žá-ž]{2,}){0,2})\b/u,
];

const NOT_A_PERSON_NAME = new Set([
  "údaje", "udaje", "adresu", "adresa", "adresy", "telefon", "telefonu",
  "email", "emailu", "e-mail", "rodné", "rodne", "číslo", "cislo",
  "screenshot", "screenshotu", "screenshoty", "fotku", "fotky", "foto",
  "obrázek", "obrazek", "obrázku", "obrazku", "obrázky",
  "smlouvu", "smlouvy", "smlouva", "doklad", "doklady", "dokladu",
  "dokument", "dokumenty", "dokumentu", "soubor", "souboru",
  "platbu", "platby", "platba", "fakturu", "faktura", "faktury",
  "poznámku", "poznamku", "poznámka", "poznámky",
  "úkol", "ukol", "úkoly", "ukoly",
  "data", "dat", "informace", "informací", "info",
  "kartu", "karta", "karty",
  "formulář", "formular", "formuláře",
  "systému", "systém", "crm",
  "portál", "portal", "portálu",
  "tabulku", "tabulka", "tabulky",
  "pojištění", "pojisteni", "pojistku", "pojistka",
  "kontakt", "kontaktu", "kontakty",
  "jméno", "jmeno", "příjmení", "prijmeni",
  "hodnotu", "hodnota", "hodnoty",
  "změnu", "změny", "zmenu", "zmeny",
  "návrh", "navrh", "náhled", "nahled",
  "podklad", "podklady",
]);

function looksLikePersonName(candidate: string): boolean {
  const tokens = candidate.trim().split(/\s+/);
  if (tokens.length === 0) return false;
  const first = tokens[0]!.toLowerCase()
    .normalize("NFD").replace(/\p{M}/gu, "");
  if (NOT_A_PERSON_NAME.has(tokens[0]!.toLowerCase())) return false;
  if (NOT_A_PERSON_NAME.has(first)) return false;
  if (tokens.length === 1) {
    if (tokens[0]!.length < 3) return false;
    if (/^\d/.test(tokens[0]!)) return false;
  }
  for (const t of tokens) {
    if (NOT_A_PERSON_NAME.has(t.toLowerCase())) return false;
  }
  return true;
}

function extractClientName(text: string): string | null {
  for (const pattern of CLIENT_NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]?.trim() && match[1].trim().length >= 3) {
      const candidate = match[1].trim();
      if (!looksLikePersonName(candidate)) continue;
      return candidate;
    }
  }
  return null;
}

// ---------------------------------------------------------------------------
// Verb detection
// ---------------------------------------------------------------------------

const VERB_MAP: Array<{ pattern: RegExp; verb: ExplicitIntentVerb }> = [
  { pattern: /(?:udělej|udělat).*(?:poznámk|záznam)/i, verb: "note" },
  { pattern: /(?:přiřaď|přiřadit|připoj|připojit)/i, verb: "assign" },
  { pattern: /(?:doplň|doplnit|vyplň|vyplnit)/i, verb: "fill" },
  { pattern: /(?:ulož|uložit|zapiš|zapsat|uložte)/i, verb: "save" },
  { pattern: /(?:pošli|odešli|přepošli|odeslat|poslat)/i, verb: "send" },
  { pattern: /(?:vytvoř|vytvořit|založ|založit|založte)/i, verb: "create" },
  { pattern: /(?:připrav|připravit|připravte)/i, verb: "prepare" },
  { pattern: /(?:aktualizuj|aktualizovat|uprav|upravit|změň|změnit)/i, verb: "update" },
];

function extractVerb(text: string): ExplicitIntentVerb {
  for (const { pattern, verb } of VERB_MAP) {
    if (pattern.test(text)) return verb;
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Destination detection
// ---------------------------------------------------------------------------

const DESTINATION_MAP: Array<{ pattern: RegExp; dest: IntentTargetDestination }> = [
  { pattern: /(?:do\s+portálu|klientský\s+portál|portál).*(?:plateb|payment)/i, dest: "portal_payment" },
  { pattern: /(?:pod\s+platební|platební\s+údaj)/i, dest: "portal_payment" },
  { pattern: /(?:do\s+portálu|klientský\s+portál|portál)/i, dest: "portal" },
  { pattern: /(?:do\s+CRM|v\s+CRM|do\s+systému)/i, dest: "crm" },
  { pattern: /(?:jako\s+poznámk|do\s+poznám|poznámku)/i, dest: "note" },
  { pattern: /(?:úkol|task|vytvoř\s+úkol|nový\s+úkol)/i, dest: "task" },
  { pattern: /(?:follow[\s-]?up|navazující|sledovac)/i, dest: "followup" },
  { pattern: /(?:odpověď|odpovědi|reply|odepsat)/i, dest: "reply" },
  { pattern: /(?:ke\s+klientovi|pod\s+klient|kartu\s+klient|klientskou\s+kart)/i, dest: "client_card" },
];

const CLIENT_PLACEMENT_HINT = /(?:ke\s+klientovi|pod\s+klienta|pod\s+klientem|ke\s+kartě|na\s+kartu\s+klienta|přilož(?:it)?\s+ke\s+klientovi)/i;
const CRM_DESTINATION_HINT = /(?:do\s+CRM|v\s+CRM|do\s+systému|na\s+kartu\s+klienta|do\s+karty\s+klienta)/i;
const TASK_INTENT_HINT = /(?:úkol|task|follow[\s-]?up|navazující\s+krok|připomeň|připomenout)/i;
const NOTE_INTENT_HINT = /(?:poznámk|záznam|interní\s+poznámk)/i;

function extractDestination(text: string): IntentTargetDestination {
  for (const { pattern, dest } of DESTINATION_MAP) {
    if (pattern.test(text)) return dest;
  }
  return "unknown";
}

// ---------------------------------------------------------------------------
// Requested fields
// ---------------------------------------------------------------------------

const FIELD_PATTERNS: Array<{ pattern: RegExp; field: string }> = [
  { pattern: /rodné?\s+číslo|osobní\s+číslo|personalId/i, field: "personalId" },
  { pattern: /adres[auy]|bydliště|ulice|město|PSČ/i, field: "address" },
  { pattern: /telefon|mobil|číslo\s+telefon/i, field: "phone" },
  { pattern: /e-?mail|email/i, field: "email" },
  { pattern: /datum\s+narozen/i, field: "birthDate" },
  { pattern: /jméno|příjmení/i, field: "name" },
  { pattern: /platební\s+údaj|číslo\s+účtu|IBAN|bankovní\s+spojen/i, field: "paymentDetails" },
  { pattern: /kontaktní\s+údaj/i, field: "contactDetails" },
  { pattern: /číslo\s+doklad|číslo\s+OP|číslo\s+pas/i, field: "documentNumber" },
];

function extractRequestedFields(text: string): string[] {
  const fields: string[] = [];
  for (const { pattern, field } of FIELD_PATTERNS) {
    if (pattern.test(text) && !fields.includes(field)) {
      fields.push(field);
    }
  }
  return fields;
}

// ---------------------------------------------------------------------------
// Operation resolution
// ---------------------------------------------------------------------------

function resolveOperation(
  verb: ExplicitIntentVerb,
  dest: IntentTargetDestination,
  fields: string[],
  text: string,
): IntentTargetOperation {
  if (/založ.*klient|založit.*klient|vytvoř.*klient|nový\s+klient/i.test(text)) {
    return "create_contact";
  }

  if (dest === "portal_payment" || fields.includes("paymentDetails")) {
    return "portal_payment_update";
  }

  if (dest === "note" || verb === "note") return "create_note";
  if (dest === "task") return "create_task";
  if (dest === "followup") return "create_followup";
  if (dest === "reply") return "draft_reply";

  if (
    verb === "assign" || verb === "fill" || verb === "save" || verb === "update"
  ) {
    if (dest === "client_card" || dest === "crm" || fields.length > 0) {
      return "update_contact";
    }
  }

  if (verb === "send" && dest === "portal") return "portal_payment_update";

  if (fields.length > 0) return "update_contact";

  return "unknown";
}

// ---------------------------------------------------------------------------
// Main entrypoint
// ---------------------------------------------------------------------------

export function parseExplicitIntent(text: string | null): ParsedExplicitIntent {
  const empty: ParsedExplicitIntent = {
    clientName: null,
    verb: "unknown",
    destination: "unknown",
    operation: "unknown",
    requestedFields: [],
    hasExplicitTarget: false,
    mentionsClientPlacement: false,
    mentionsCrmDestination: false,
    mentionsTaskIntent: false,
    mentionsNoteIntent: false,
    raw: text ?? "",
  };

  if (!text?.trim()) return empty;

  const t = text.trim();
  const clientName = extractClientName(t);
  const verb = extractVerb(t);
  const destination = extractDestination(t);
  const requestedFields = extractRequestedFields(t);
  const operation = resolveOperation(verb, destination, requestedFields, t);
  const mentionsClientPlacement = CLIENT_PLACEMENT_HINT.test(t);
  const mentionsCrmDestination = CRM_DESTINATION_HINT.test(t);
  const mentionsTaskIntent = TASK_INTENT_HINT.test(t);
  const mentionsNoteIntent = NOTE_INTENT_HINT.test(t);

  const hasExplicitTarget =
    clientName !== null ||
    destination !== "unknown" ||
    operation !== "unknown" ||
    verb !== "unknown";

  return {
    clientName,
    verb,
    destination,
    operation,
    requestedFields,
    hasExplicitTarget,
    mentionsClientPlacement,
    mentionsCrmDestination,
    mentionsTaskIntent,
    mentionsNoteIntent,
    raw: t,
  };
}

/**
 * Returns true when the user's text clearly signals a CRM extraction / update intent,
 * even if the classifier alone would be uncertain. Used to boost classification confidence.
 */
export function textSignalsCrmExtractionIntent(intent: ParsedExplicitIntent): boolean {
  if (intent.operation === "update_contact" && (intent.mentionsCrmDestination || intent.mentionsClientPlacement)) return true;
  if (intent.operation === "create_contact") return true;
  if (intent.operation === "portal_payment_update") return true;
  if ((intent.verb === "assign" || intent.verb === "fill" || intent.verb === "save") && intent.mentionsCrmDestination) return true;
  if (intent.requestedFields.length >= 2 && (intent.mentionsCrmDestination || intent.mentionsClientPlacement)) return true;
  return false;
}

/**
 * Returns true when intent signals payment/portal destination.
 */
export function textSignalsPaymentIntent(intent: ParsedExplicitIntent): boolean {
  return (
    intent.operation === "portal_payment_update" ||
    intent.destination === "portal_payment" ||
    intent.requestedFields.includes("paymentDetails")
  );
}

/**
 * Returns true when intent signals note/task creation.
 */
export function textSignalsNoteOrTaskIntent(intent: ParsedExplicitIntent): boolean {
  return (
    intent.operation === "create_note" ||
    intent.operation === "create_task" ||
    intent.operation === "create_followup" ||
    intent.destination === "note" ||
    intent.destination === "task" ||
    intent.destination === "followup" ||
    intent.mentionsTaskIntent ||
    intent.mentionsNoteIntent
  );
}
