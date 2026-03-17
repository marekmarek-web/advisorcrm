/**
 * Mapování interního stage (sortOrder) a uzavření obchodu na klientsky srozumitelný stav.
 * Klient nevidí názvy stage (Lead, Kvalifikace, …), pouze tyto labely.
 */
export const CLIENT_STATUS_LABELS = {
  accepted: "Přijato",
  in_progress: "Řešíme",
  waiting_for_info: "Čekáme na doplnění",
  meeting: "Domlouváme schůzku",
  done: "Dokončeno",
} as const;

export type ClientStatusKey = keyof typeof CLIENT_STATUS_LABELS;

/**
 * Vrátí klientský stav podle sortOrder stage a zda je obchod uzavřen.
 * sortOrder 0 = první stage (Lead / Začínáme) → Přijato
 * sortOrder 1 často = Kvalifikace / čeká na podklady → Čekáme na doplnění
 * 2–3 → Řešíme, 4 → Domlouváme schůzku, 5+ → Řešíme
 * closedAt set → Dokončeno
 */
export function stageToClientStatus(
  stageSortOrder: number,
  closedAt: Date | null
): ClientStatusKey {
  if (closedAt) return "done";
  switch (stageSortOrder) {
    case 0:
      return "accepted";
    case 1:
      return "waiting_for_info";
    case 4:
      return "meeting";
    case 2:
    case 3:
    default:
      return "in_progress";
  }
}

export function getClientStatusLabel(key: ClientStatusKey): string {
  return CLIENT_STATUS_LABELS[key] ?? CLIENT_STATUS_LABELS.in_progress;
}
