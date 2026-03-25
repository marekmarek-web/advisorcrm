/**
 * Delivery failure registry (Plan 6B.4).
 * Standardized failure codes with Czech user-facing messages.
 */

export type FailureCategory = "email" | "push" | "calendar" | "system";

export type FailureCodeEntry = {
  code: string;
  category: FailureCategory;
  retryable: boolean;
  userMessage: string;
};

export const FAILURE_CODES: FailureCodeEntry[] = [
  { code: "email_send_failed", category: "email", retryable: true, userMessage: "Odeslání emailu selhalo. Zkuste to znovu." },
  { code: "email_invalid_recipient", category: "email", retryable: false, userMessage: "Neplatná emailová adresa příjemce." },
  { code: "email_consent_blocked", category: "email", retryable: false, userMessage: "Kontakt se odhlásil z emailových notifikací." },
  { code: "email_bounced", category: "email", retryable: false, userMessage: "Email se vrátil – adresa neexistuje." },
  { code: "push_delivery_failed", category: "push", retryable: true, userMessage: "Push notifikace nedoručena. Zkuste to znovu." },
  { code: "push_invalid_token", category: "push", retryable: false, userMessage: "Push notifikace nedoručena — znovupřihlašte mobilní zařízení." },
  { code: "push_device_unregistered", category: "push", retryable: false, userMessage: "Zařízení bylo odregistrováno." },
  { code: "calendar_create_failed", category: "calendar", retryable: true, userMessage: "Vytvoření události v kalendáři selhalo." },
  { code: "calendar_auth_expired", category: "calendar", retryable: false, userMessage: "Oprávnění ke kalendáři vypršelo – znovu propojte účet." },
  { code: "scheduling_failed", category: "system", retryable: true, userMessage: "Plánování akce selhalo." },
  { code: "approval_expired", category: "system", retryable: false, userMessage: "Schválení vypršelo – vytvořte nový požadavek." },
  { code: "duplicate_prevented", category: "system", retryable: false, userMessage: "Tato akce již byla provedena." },
  { code: "provider_timeout", category: "system", retryable: true, userMessage: "Služba neodpověděla včas. Zkuste to znovu." },
];

export function getFailureEntry(code: string): FailureCodeEntry | undefined {
  return FAILURE_CODES.find((f) => f.code === code);
}

export function isRetryable(code: string): boolean {
  const entry = getFailureEntry(code);
  return entry?.retryable ?? false;
}

export function getUserMessage(code: string): string {
  const entry = getFailureEntry(code);
  return entry?.userMessage ?? "Neočekávaná chyba. Zkuste to znovu.";
}
