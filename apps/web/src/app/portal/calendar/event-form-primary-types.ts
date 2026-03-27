/** Stejné pořadí jako desktop `EventFormModal` — jeden „wizard“ napříč breakpointy. */
export const EVENT_FORM_PRIMARY_TYPE_ORDER = [
  "schuzka",
  "telefonat",
  "kafe",
  "mail",
  "ukol",
  "servis",
] as const;

export type EventFormPrimaryTypeId = (typeof EVENT_FORM_PRIMARY_TYPE_ORDER)[number];
