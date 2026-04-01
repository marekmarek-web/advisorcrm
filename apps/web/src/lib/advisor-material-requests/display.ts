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
