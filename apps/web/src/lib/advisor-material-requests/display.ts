export const MATERIAL_REQUEST_CATEGORY_IDS = [
  "doklady_totoznosti",
  "prijmy_finance",
  "smlouvy_podklady",
  "bydleni_uvery",
  "pojisteni",
  "investice_penze",
  "zivotni_situace",
  "ostatni",
] as const;

export function materialRequestCategoryLabel(id: string): string {
  const m: Record<string, string> = {
    doklady_totoznosti: "Doklady totožnosti",
    prijmy_finance: "Příjmy a finance",
    smlouvy_podklady: "Smlouvy a podklady",
    bydleni_uvery: "Bydlení a úvěry",
    pojisteni: "Pojištění",
    investice_penze: "Investice a penze",
    zivotni_situace: "Životní situace",
    ostatni: "Ostatní",
  };
  return m[id] ?? id;
}

/** 5B: Canonical status labels — single source of truth for all surfaces. */
export function materialRequestStatusLabel(status: string): string {
  const m: Record<string, string> = {
    new: "Nový",
    seen: "Zobrazeno",
    answered: "Odpovězeno",
    needs_more: "Čeká na doplnění",
    done: "Vyřízeno",
    closed: "Uzavřeno",
  };
  return m[status] ?? status;
}

export function materialRequestStatusClasses(status: string): string {
  if (status === "done" || status === "closed") {
    return "bg-emerald-50 text-emerald-700 border-emerald-100";
  }
  if (status === "needs_more") {
    return "bg-amber-50 text-amber-800 border-amber-100";
  }
  return "bg-blue-50 text-blue-700 border-blue-100";
}

export type MaterialRequestListItem = {
  id: string;
  title: string;
  category: string;
  categoryLabel: string;
  status: string;
  priority: string;
  dueAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
};

export type MaterialRequestDetail = MaterialRequestListItem & {
  description: string | null;
  responseMode: string;
  internalNote: string | null;
  readByClientAt: Date | null;
  contactId: string;
  /** 5F: optional link to related client-initiated request (opportunity). */
  opportunityId: string | null;
  messages: Array<{
    id: string;
    authorRole: string;
    body: string;
    createdAt: Date;
  }>;
  attachments: Array<{
    documentId: string;
    name: string;
    mimeType: string | null;
    attachmentRole: string;
    visibleToClient: boolean | null;
  }>;
};

/** Server-prefetched payload for kontakt → záložka Podklady (RSC → client). */
export type MaterialRequestsTabInitialPayload = {
  list: MaterialRequestListItem[];
  detail: MaterialRequestDetail | null;
  selectedId: string | null;
};
