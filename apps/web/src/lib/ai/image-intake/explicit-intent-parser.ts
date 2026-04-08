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

function extractClientName(text: string): string | null {
  for (const pattern of CLIENT_NAME_PATTERNS) {
    const match = text.match(pattern);
    if (match?.[1]?.trim() && match[1].trim().length >= 3) {
      return match[1].trim();
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
    raw: text ?? "",
  };

  if (!text?.trim()) return empty;

  const t = text.trim();
  const clientName = extractClientName(t);
  const verb = extractVerb(t);
  const destination = extractDestination(t);
  const requestedFields = extractRequestedFields(t);
  const operation = resolveOperation(verb, destination, requestedFields, t);

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
    raw: t,
  };
}

/**
 * Returns true when the user's text clearly signals a CRM extraction / update intent,
 * even if the classifier alone would be uncertain. Used to boost classification confidence.
 */
export function textSignalsCrmExtractionIntent(intent: ParsedExplicitIntent): boolean {
  if (intent.operation === "update_contact") return true;
  if (intent.operation === "create_contact") return true;
  if (intent.operation === "portal_payment_update") return true;
  if (intent.verb === "assign" || intent.verb === "fill" || intent.verb === "save") return true;
  if (intent.requestedFields.length >= 2) return true;
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
    intent.destination === "followup"
  );
}
