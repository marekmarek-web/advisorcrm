/**
 * Centralized PII masking (Plan 9A.2).
 * Consolidates masking from assistant-audit.ts, assistant-context-builder.ts,
 * document-sensitivity.ts, and export-governance.ts into a single library.
 */

import type { RoleName } from "@/lib/auth/permissions";

// ---- Pattern definitions ----

export const IBAN_PATTERN = /\b[A-Z]{2}\d{2}[\dA-Z]{11,30}\b/g;
export const CZECH_PERSONAL_ID_PATTERN = /\b\d{6}[\/]?\d{3,4}\b/g;
export const CZECH_ACCOUNT_PATTERN = /\b\d{6,10}[\/]\d{4}\b/g;
export const EMAIL_PATTERN = /\b[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}\b/g;
export const PHONE_PATTERN = /\b(\+420|00420)?\s?[67]\d{2}\s?\d{3}\s?\d{3}\b/g;

export type PIIFieldType = "iban" | "personal_id" | "account_number" | "email" | "phone" | "birth_date" | "address";

// ---- Per-type masking functions ----

export function maskIban(value: string | null | undefined): string {
  if (!value) return "";
  const clean = value.replace(/\s/g, "");
  if (clean.length < 6) return "***";
  return `...${clean.slice(-4)}`;
}

export function maskPersonalId(value: string | null | undefined): string {
  if (!value) return "";
  return "XX/XXXX";
}

export function maskAccountNumber(value: string | null | undefined): string {
  if (!value) return "";
  const parts = value.split("/");
  if (parts.length === 2) return `***/${parts[1]}`;
  return "***";
}

export function maskEmail(value: string | null | undefined): string {
  if (!value) return "";
  const atIndex = value.indexOf("@");
  if (atIndex <= 0) return "***";
  const local = value.slice(0, atIndex);
  const domain = value.slice(atIndex);
  if (local.length <= 2) return `*${domain}`;
  return `${local[0]}***${local.slice(-1)}${domain}`;
}

export function maskPhone(value: string | null | undefined): string {
  if (!value) return "";
  const digits = value.replace(/\D/g, "");
  if (digits.length < 4) return "***";
  return `***${digits.slice(-3)}`;
}

export function maskGeneric(value: string | null | undefined): string {
  if (!value) return "";
  if (value.length <= 4) return "***";
  return `${value.slice(0, 2)}***${value.slice(-2)}`;
}

// ---- Detect and mask PII in free text ----

export function detectAndMaskPII(text: string): string {
  return text
    .replace(new RegExp(IBAN_PATTERN.source, "g"), (m) => maskIban(m))
    .replace(new RegExp(CZECH_PERSONAL_ID_PATTERN.source, "g"), () => "XX/XXXX")
    .replace(new RegExp(CZECH_ACCOUNT_PATTERN.source, "g"), (m) => maskAccountNumber(m))
    .replace(new RegExp(EMAIL_PATTERN.source, "g"), (m) => maskEmail(m))
    .replace(new RegExp(PHONE_PATTERN.source, "g"), (m) => maskPhone(m));
}

// ---- Field name heuristics for auto-detection ----

const PII_FIELD_NAME_PATTERNS: { pattern: RegExp; type: PIIFieldType }[] = [
  { pattern: /iban/i, type: "iban" },
  { pattern: /account.*number|bank.*account|accountno/i, type: "account_number" },
  { pattern: /personal.*id|personalid|rodne.*cislo|rodnecislo|pid\b/i, type: "personal_id" },
  { pattern: /email/i, type: "email" },
  { pattern: /phone|telefon|mobile/i, type: "phone" },
  { pattern: /birth.*date|datum.*narozeni/i, type: "birth_date" },
  { pattern: /address|adresa/i, type: "address" },
];

function detectPIIType(fieldName: string): PIIFieldType | null {
  for (const { pattern, type } of PII_FIELD_NAME_PATTERNS) {
    if (pattern.test(fieldName)) return type;
  }
  return null;
}

function maskValueByType(value: unknown, piiType: PIIFieldType): string {
  const str = typeof value === "string" ? value : String(value ?? "");
  switch (piiType) {
    case "iban": return maskIban(str);
    case "personal_id": return maskPersonalId(str);
    case "account_number": return maskAccountNumber(str);
    case "email": return maskEmail(str);
    case "phone": return maskPhone(str);
    default: return maskGeneric(str);
  }
}

// ---- Object-level masking ----

export const PII_FIELDS: string[] = [
  "iban", "ibanMasked", "personalId", "maskedPersonalId", "accountNumber",
  "opNumber", "email", "phone", "mobile", "birthDate", "address",
  "variableSymbol", "specificSymbol",
];

export function maskPIIInObject(
  obj: Record<string, unknown>,
  explicitFields?: string[]
): Record<string, unknown> {
  const result: Record<string, unknown> = {};
  const fieldsToMask = explicitFields ?? PII_FIELDS;

  for (const [key, value] of Object.entries(obj)) {
    const shouldMask = fieldsToMask.some((f) => key.toLowerCase().includes(f.toLowerCase()));
    const detectedType = shouldMask ? detectPIIType(key) : null;

    if (shouldMask && value !== null && value !== undefined) {
      if (typeof value === "object" && !Array.isArray(value)) {
        result[key] = maskPIIInObject(value as Record<string, unknown>, fieldsToMask);
      } else {
        result[key] = detectedType
          ? maskValueByType(value, detectedType)
          : maskGeneric(String(value));
      }
    } else if (typeof value === "object" && value !== null && !Array.isArray(value)) {
      result[key] = maskPIIInObject(value as Record<string, unknown>, fieldsToMask);
    } else {
      result[key] = value;
    }
  }

  return result;
}

// ---- Role-based masking decision ----

const ROLES_EXEMPT_FROM_MASKING: RoleName[] = ["Admin", "Director"];

export function shouldMaskForRole(roleName: RoleName): boolean {
  return !ROLES_EXEMPT_FROM_MASKING.includes(roleName);
}

export function maskIfRequired<T extends Record<string, unknown>>(
  obj: T,
  roleName: RoleName,
  explicitFields?: string[]
): T {
  if (!shouldMaskForRole(roleName)) return obj;
  return maskPIIInObject(obj, explicitFields) as T;
}

// ---- String masking for logs ----

export function maskForLog(obj: Record<string, unknown>): Record<string, unknown> {
  return maskPIIInObject(obj, PII_FIELDS);
}
