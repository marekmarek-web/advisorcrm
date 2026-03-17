import type { ClientStatusKey } from "./request-status";

/** Klientsky viditelná položka požadavku (opportunity). */
export type ClientRequestItem = {
  id: string;
  title: string;
  caseTypeLabel: string;
  statusKey: ClientStatusKey;
  statusLabel: string;
  updatedAt: Date;
  description?: string | null;
};

/** Typy požadavků pro výběr v portálu (caseType hodnoty + labely). */
export const CLIENT_REQUEST_TYPES = [
  { value: "hypotéka", label: "Hypotéka" },
  { value: "investice", label: "Investice" },
  { value: "pojištění", label: "Pojištění" },
  { value: "úvěr", label: "Úvěr" },
  { value: "změna situace", label: "Změna životní situace" },
  { value: "servis smlouvy", label: "Servis smlouvy" },
  { value: "jiné", label: "Jiné" },
] as const;
